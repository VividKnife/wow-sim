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
  state.npcWorld.residents = ids.map((id: string) => {
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
  const ids = new Set(residents.map(p => p.id));
  requireThat(existing.every(row => ids.has(row.id)), 'NPC_STATE', '不能通过战斗快照删除永久冒险者');
  const claim = await tx.get<CharacterClaim>('simulation_characters', owner.id);
  const claims = claim ? new Map((await tx.list<CharacterClaim>('simulation_characters', {instanceId: claim.instanceId})).map(row => [row.id, row])) : null;
  for (const resident of residents) {
    const {unit, wallet, id, ...profile} = resident;
    requireThat(typeof id === 'string' && id.startsWith(`npc:${owner.id}:`) && unit?.id === id && unit.npcPlayer === true,
      'NPC_OWNER', '冒险者永久身份与所属世界不一致');
    const previous = byId.get(id);
    if (!previous) requireThat(!await tx.get('npc_characters', id), 'NPC_OWNER', '冒险者已属于另一角色');
    else requireThat(previous.accountId === owner.accountId, 'NPC_OWNER', '冒险者账号归属无效');
    const rules = structuredClone(unit);
    for (const field of assetFields) delete rules[field];
    const assets = {money: wallet, equipment: unit.equipment, ...Object.fromEntries(containers.map(c => [c, unit[c] ?? []]))};
    const assetHash = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
    const row: NpcCharacter = {id, accountId: owner.accountId, ownerCharacterId: owner.id, rules, profile, assetHash};
    // JSONB reorders object keys; compare durable values rather than their text
    // so a boundary with no NPC changes does not rewrite all 72 records.
    if (!previous || !isDeepStrictEqual(previous, JSON.parse(JSON.stringify(row)))) await tx.put('npc_characters', row);
    if (claim) {
      const assigned = claims!.get(id) ?? await tx.get<CharacterClaim>('simulation_characters', id);
      requireThat(!assigned || assigned.instanceId === claim.instanceId && assigned.accountId === owner.accountId,
        'SIMULATION_FENCED', '冒险者由另一实例管理');
      if (!assigned) await tx.insert('simulation_characters', {id, accountId: owner.accountId, instanceId: claim.instanceId});
    }
    // Hash only skips unchanged boundary writes. Money/count/identity checks
    // and ledger entries share exactly the player's asset materializer.
    if (previous?.assetHash !== assetHash) await persistAssets(tx, row, {...unit, ...assets}, key, 'npc_characters');
  }
}
