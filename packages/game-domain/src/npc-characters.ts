import {awayNpc} from './npc-residency.ts';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {ReadView, Transaction} from '../../persistence/src/store.ts';
import type {Character, Item, Rules, Wallet} from './model.ts';
import {requireThat} from './model.ts';
import {persistAssets} from './context.ts';
import {syncNpcWorld} from './rules/npc-world.js';
import type {CharacterClaim} from './resident-store.ts';

const containers = ['bag', 'bags', 'bank', 'pending', 'auctions', 'raidCollection', 'raidPendingEquipment'];
const assetFields = ['id', 'money', 'equipment', ...containers];
export type NpcCharacter = {
  id: string; accountId: string; ownerCharacterId: string;
  rules: Rules; profile: Rules; assetHash: string;
};
type Owner = Pick<Character, 'id' | 'accountId' | 'rules'>;

/** Permanent NPC identity/profile and assets are independent rows. The world
 * header preserves display order; a checkpoint still owns its runtime copies. */
export async function loadNpcWorld(tx: ReadView, owner: Owner, state: Rules) {
  if (!state.npcWorld) return;
  const ids = state.npcWorld.residentIds;
  requireThat(!Object.hasOwn(state.npcWorld, 'residents') && Array.isArray(ids) &&
    ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length,
    'NPC_STATE', '冒险者身份索引无效，请重新创建开发存档');
  const records = await tx.list<NpcCharacter>('npc_characters', {ownerCharacterId: owner.id});
  const byId = new Map(records.map(row => [row.id, row]));
  requireThat(records.length === ids.length && ids.every(id => byId.has(id)), 'NPC_STATE', '冒险者记录不完整');
  // Three indexed account/owner reads rather than one asset query per NPC.
  const items = await tx.list<Item>('items', {accountId: owner.accountId});
  const wallets = new Map((await tx.list<Wallet>('wallets', {accountId: owner.accountId})).map(row => [row.id, row]));
  const assets = new Map<string, Item[]>();
  for (const item of items) if (byId.has(item.ownerCharacterId)) {
    const rows = assets.get(item.ownerCharacterId) ?? []; rows.push(item); assets.set(item.ownerCharacterId, rows);
  }
  const ownerClaim=await tx.get<CharacterClaim>('simulation_characters',owner.id);
  const claims=new Map((await tx.list<CharacterClaim>('simulation_characters',{accountId:owner.accountId})).map(row=>[row.id,row]));
  const away:Rules[]=[],local=ids.filter((id:string)=>{
    const claim=claims.get(id),row=byId.get(id)!;
    if(claim&&claim.instanceId!==ownerClaim?.instanceId){away.push(awayNpc({...row.profile,id,unit:row.rules}));return false;}
    return true;
  });
  if(away.length)state.npcWorld.away=away;else delete state.npcWorld.away;
  state.npcWorld.residents = local.map((id: string) => {
    const row = byId.get(id)!, wallet = wallets.get(id);
    requireThat(row.accountId === owner.accountId && wallet?.characterId === id,
      'NPC_STATE', '冒险者资产归属无效');
    const unit: Rules = {...structuredClone(row.rules), id, equipment: {}};
    for (const container of containers) unit[container] = [];
    for (const item of (assets.get(id) ?? []).sort((a, b) => a.position - b.position)) {
      if (item.container === 'reservation') continue;
      const data: Rules = {...structuredClone(item.data), uid: item.id};
      if (item.container === 'equipment') unit.equipment[item.slot!] = data;
      else if (item.container === 'auctions') unit.auctions.push({...data, item: {...data.item, uid: item.id}});
      else {
        requireThat(containers.includes(item.container), 'NPC_STATE', '冒险者物品容器无效');
        unit[item.container].push(data);
      }
    }
    return {...structuredClone(row.profile), id, unit, wallet: wallet.balance};
  });
  delete state.npcWorld.residentIds;
}

export async function persistNpcWorld(tx: Transaction, owner: Owner, state: Rules, key: string) {
  if (!state.npcWorld) return;
  syncNpcWorld(state);
  const residents = state.npcWorld.residents;
  requireThat(Array.isArray(residents) && new Set(residents.map(p => p.id)).size === residents.length,
    'NPC_STATE', '冒险者身份重复或无效');
  const existing = await tx.list<NpcCharacter>('npc_characters', {ownerCharacterId: owner.id});
  const byId = new Map(existing.map(row => [row.id, row]));
  const ids = new Set([...residents,...(state.npcWorld.away??[])].map(p => p.id));
  requireThat(existing.every(row => ids.has(row.id)), 'NPC_STATE', '不能通过战斗快照删除永久冒险者');
  const claim = await tx.get<CharacterClaim>('simulation_characters', owner.id);
  const claims=new Map((await tx.list<CharacterClaim>('simulation_characters',{accountId:owner.accountId})).map(row=>[row.id,row]));
  const away=state.npcWorld.away??[];
  requireThat(Array.isArray(away)&&new Set([...residents,...away].map(p=>p.id)).size===residents.length+away.length,
    'NPC_STATE','冒险者外出身份重复');
  for(const marker of away){
    const previous=byId.get(marker.id),assigned=claims.get(marker.id);
    requireThat(previous&&previous.profile.index===marker.index&&assigned&&assigned.accountId===owner.accountId&&assigned.instanceId!==claim?.instanceId,
      'NPC_STATE','外出冒险者执行权记录不完整');
  }
  for(const resident of residents)await persistNpcResident(tx,owner,resident,key,claim?.instanceId,{previous:byId.get(resident.id),claim:claims.get(resident.id)??null});
}

export async function persistNpcResident(tx:Transaction,owner:Pick<Owner,'id'|'accountId'>,resident:Rules,key:string,instanceId?:string,known?:{previous?:NpcCharacter;claim:CharacterClaim|null}){
 const assigned=known?known.claim:await tx.get<CharacterClaim>('simulation_characters',resident.id);
 requireThat(!assigned||assigned.instanceId===instanceId&&assigned.accountId===owner.accountId,
  'SIMULATION_FENCED','冒险者由另一实例管理');
 if(instanceId&&!assigned)await tx.insert('simulation_characters',{id:resident.id,accountId:owner.accountId,instanceId});
    const {unit, wallet, id, ...profile} = resident;
    requireThat(typeof id === 'string' && id.startsWith(`npc:${owner.id}:`) && unit?.id === id && unit.npcPlayer === true,
      'NPC_OWNER', '冒险者永久身份与所属世界不一致');
    const previous = known?.previous??await tx.get<NpcCharacter>('npc_characters', id);
    if(previous)requireThat(previous.accountId===owner.accountId&&previous.ownerCharacterId===owner.id,'NPC_OWNER','冒险者永久归属无效');
    const rules = structuredClone(unit);
    for (const field of assetFields) delete rules[field];
    const assets = {money: wallet, equipment: unit.equipment, ...Object.fromEntries(containers.map(c => [c, unit[c] ?? []]))};
    const assetHash = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
    const row: NpcCharacter = {id, accountId: owner.accountId, ownerCharacterId: owner.id, rules, profile, assetHash};
    // JSONB reorders object keys; compare durable values rather than their text
    // so a boundary with no NPC changes does not rewrite all 72 records.
    if (!previous || !isDeepStrictEqual(previous, JSON.parse(JSON.stringify(row)))) await tx.put('npc_characters', row);
    // Hash only skips unchanged boundary writes. Money/count/identity checks
    // and ledger entries share exactly the player's asset materializer.
    if (previous?.assetHash !== assetHash) await persistAssets(tx, row, {...unit, ...assets}, key, 'npc_characters');
}
