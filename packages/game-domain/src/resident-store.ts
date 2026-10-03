import {residentNpcProfiles} from './npc-residency.ts';
import type {Store, Transaction, TableName, Row} from '../../persistence/src/store.ts';
import type {Ownership} from '../../persistence/src/simulation.ts';
import {DomainError} from './model.ts';
import {randomUUID} from 'node:crypto';
import type {Residency, CharacterAdmission} from './resident-characters.ts';
import {participantState, validateParticipants} from './resident-participants.ts';

export type CharacterClaim = {id: string; accountId: string|null; instanceId: string};
const wrapped = new WeakMap<Store, Store>();
const authority = new WeakMap<Transaction, Ownership>();
const deletions = new WeakMap<Transaction, string>();
const retirements = new WeakMap<Transaction, string>();
const transfers = new WeakMap<Transaction, {destinationIds: Set<string>; sourceIds: Set<string>; claims: Map<string, CharacterClaim>; assignments: Map<string, string>; admissions:Set<string>; releases:Set<string>}>();
const protectedTables = new Set<TableName>(['characters', 'npc_characters', 'wallets', 'items', 'actor_leases', 'activities',
  'reservations', 'parties', 'companions', 'instances', 'simulation_characters', 'simulation_residencies']);

/** The claim survives lease expiry: recovery, not an unrelated API writer,
 * decides what happens to uncommitted runtime state. Both sides of a transfer
 * are checked, including delete and replacement of an existing row. */
export function residentStore(store: Store): Store {
  const existing = wrapped.get(store); if (existing) return existing;
  const result: Store = {
    read: work => store.read(work),
    heartbeat: (...args) => store.heartbeat(...args),
    close: () => store.close(),
    transaction: (work, options) => store.transaction(async raw => {
      const claims = new Map<string, CharacterClaim | null>();
      const check = async (table: TableName, row: Row | null, removing = false) => {
        if (!row) return;
        let ids: string[] = [];
        switch (table) {
          case 'characters': case 'simulation_characters': ids = [row.id]; break;
          case 'npc_characters': ids=[row.id];break;
          case 'wallets': ids = [row.id, row.characterId]; break;
          case 'simulation_residencies':
            if (!Array.isArray(row.participants) || !row.participants.length) throw new DomainError('SIMULATION_STATE', '实例参与角色名册无效');
            ids = [row.characterId, ...row.participants.map((p: Row) => p.characterId)]; break;
          case 'items': ids = [row.ownerCharacterId]; break;
          case 'actor_leases': ids = [row.id, row.actorId]; break;
          case 'activities': ids = [row.actorId, ...(row.participantIds ?? [])]; break;
          case 'reservations': ids = [row.payerId, row.recipientId]; break;
          case 'parties': ids = row.characterIds ?? []; break;
          case 'companions': ids = [row.characterId, row.ownerCharacterId]; break;
          case 'instances': ids = (row.roster ?? []).map((member: Row) => member.characterId); break;
          default: return;
        }
        for (const id of new Set(ids.filter(Boolean))) {
          if (!claims.has(id)) claims.set(id, await raw.get<CharacterClaim>('simulation_characters', id));
          const claim = claims.get(id);
          if (!claim) continue;
          if (removing && deletions.has(tx) && (deletions.get(tx) === claim.accountId || claim.accountId===null)) {
            const revoked = await raw.get<Ownership>('simulation_owners', claim.instanceId);
            if (revoked?.deleted?.saveId === deletions.get(tx)) continue;
            throw new DomainError('SIMULATION_FENCED', '删除前必须撤销实例执行权');
          }
          if (removing && retirements.get(tx) === claim.instanceId) {
            const revoked = await raw.get<Ownership>('simulation_owners', claim.instanceId);
            if (revoked?.transferred?.id.startsWith('runtime-retire:')) continue;
            throw new DomainError('SIMULATION_FENCED', '旧实例未被撤销');
          }
          const allowed = authority.get(tx);
          if (!allowed || allowed.id !== claim.instanceId)
            throw new DomainError('SIMULATION_OWNED', '角色由模拟实例管理，请通过实例执行操作');
          // The capability checks ownership once before and once after this
          // transaction's write batch, not once per inventory/NPC row.
        }
      };
      const write = async (table: TableName, row: Row, insert: boolean) => {
        if(table==='npc_characters'){
          const before=await raw.get(table,row.id);
          if(before&&(before.accountId!==row.accountId||before.realm!==row.realm))
            throw new DomainError('NPC_OWNER','冒险者永久归属不可通过检查点改变');
        }
        const transfer = transfers.get(tx);
        if (transfer && table === 'simulation_characters') {
          const before = transfer.claims.get(row.id);
          if (row.instanceId !== transfer.assignments.get(row.id) || (transfer.admissions.has(row.id) ? !insert || row.accountId!==null : insert || !before || row.accountId!==before.accountId))
            throw new DomainError('SIMULATION_TRANSFER', '转移不得增删身份或改变账号归属');
        } else if (transfer && table === 'simulation_residencies') {
          if (!insert || !transfer.destinationIds.has(row.id)) throw new DomainError('SIMULATION_TRANSFER', '转移只能创建目标实例');
        } else if (protectedTables.has(table)) {
          if (!insert) await check(table, await raw.get(table, row.id));
          await check(table, row);
        }
        if (table === 'simulation_characters') claims.delete(row.id);
        await (insert ? raw.insert(table, row) : raw.put(table, row));
      };
      const tx: Transaction = {
        get: (...args) => raw.get(...args), list: (...args) => raw.list(...args), due: (...args) => raw.due(...args),
        insert: (table, row) => write(table, row, true), put: (table, row) => write(table, row, false),
        delete: async (table, id) => {
          const transfer = transfers.get(tx);
          if(transfer && table==='simulation_characters' && transfer.releases.has(id)) {
            // Only public claims omitted by the validated destination may return to the pool.
          } else if (transfer && table === 'simulation_residencies' && transfer.sourceIds.has(id)) {
            if ((await raw.list('simulation_characters', {instanceId: id})).length)
              throw new DomainError('SIMULATION_TRANSFER', '移除来源实例前必须转移所有角色');
          } else if (protectedTables.has(table)) await check(table, await raw.get(table, id), true);
          if (table === 'simulation_characters') claims.delete(id);
          await raw.delete(table, id);
        },
      };
      try { return await work(tx); } finally { authority.delete(tx); deletions.delete(tx); retirements.delete(tx); transfers.delete(tx); }
    }, options),
  };
  wrapped.set(store, result); wrapped.set(result, result); return result;
}

/** Only the IO boundary may grant this capability, after fencing in the same
 * serializable transaction. It is never carried in an HTTP command or Rules. */
export async function withResidentAuthority<T>(tx: Transaction, owner: Ownership, work: () => Promise<T>): Promise<T> {
  if (authority.has(tx) || transfers.has(tx)) throw new Error('Nested resident write authority');
  const fence = async () => {
    const current = await tx.get<Ownership>('simulation_owners', owner.id);
    if (!current || current.deleted || current.transferred || current.handoff || current.epoch !== owner.epoch || current.ownerId !== owner.ownerId || current.expiresAt <= Date.now())
      throw new DomainError('SIMULATION_FENCED', '模拟实例执行权已失效');
  };
  await fence();
  authority.set(tx, owner);
  try { const result = await work(); await fence(); return result; } finally { authority.delete(tx); }
}

/** Narrow capability for explicit save deletion after durable owner revocation
 * in the same transaction. It never permits replacement assets or admission. */
export async function withResidentDeletion<T>(tx: Transaction, accountId: string, work: () => Promise<T>): Promise<T> {
  if (deletions.has(tx) || authority.has(tx) || transfers.has(tx)) throw new Error('Nested resident deletion authority');
  for (const claim of await tx.list<CharacterClaim>('simulation_characters', {accountId})) {
    const owner = await tx.get<Ownership>('simulation_owners', claim.instanceId);
    if (owner?.deleted?.saveId !== accountId) throw new DomainError('SIMULATION_FENCED', '删除前必须撤销实例执行权');
  }
  deletions.set(tx, accountId);
  try { return await work(); } finally { deletions.delete(tx); }
}

/** Retire an expired runtime after a rules/content update. Its durable
 * characters and assets remain authoritative; the old owner is permanently fenced. */
export async function withResidentRetirement<T>(tx: Transaction, instanceId: string, work: () => Promise<T>): Promise<T> {
  if (retirements.has(tx) || deletions.has(tx) || authority.has(tx) || transfers.has(tx)) throw new Error('Nested resident retirement authority');
  const now=Date.now(),owner=await tx.get<Ownership>('simulation_owners',instanceId);
  if(owner&&(owner.expiresAt>now||owner.deleted||owner.transferred||owner.handoff))
    throw new DomainError('SIMULATION_FENCED','旧实例仍持有执行权或正在交接',503);
  await tx.put('simulation_owners',{id:instanceId,ownerId:owner?.ownerId??'runtime-retire',epoch:owner?.epoch??1,
    expiresAt:now,commitSequence:owner?.commitSequence??0,
    transferred:{id:`runtime-retire:${randomUUID()}`,destinationIds:[],at:now}} satisfies Ownership);
  retirements.set(tx,instanceId);
  try{return await work();}finally{retirements.delete(tx);}
}

/** Called only inside SimulationRepository.transfer. This is deliberately NOT
 * a general multi-owner asset-write capability. It can only move existing
 * claims unchanged and replace their residency records; assets remain exactly
 * as committed by the source checkpoints. */
export async function transferResidentClaims(tx: Transaction, transferId: string, sources: Ownership[], destinations: Residency[]): Promise<void> {
  if (transfers.has(tx) || authority.has(tx) || deletions.has(tx)) throw new Error('Nested resident transfer authority');
  if (!Array.isArray(destinations) || !destinations.length || destinations.length > 40 || new Set(destinations.map(d => d.id)).size !== destinations.length)
    throw new DomainError('SIMULATION_TRANSFER', '目标实例无效');
  const destinationIds = new Set(destinations.map(d => d.id));
  for (const destination of destinations) {
    const target = await tx.get<Ownership>('simulation_owners', destination.id);
    if (!target || target.ownerId !== 'transfer' || target.epoch !== 1 || target.commitSequence !== 0 ||
      target.handoff?.id !== transferId || target.handoff.sequence !== 0 || target.deleted || target.transferred)
      throw new DomainError('SIMULATION_TRANSFER', '目标实例未处于原子转移边界');
    if (destination.rulesetVersion !== destinations[0].rulesetVersion || destination.contentHash !== destinations[0].contentHash)
      throw new DomainError('SIMULATION_VERSION', '转移目标内容版本不一致');
  }
  const sourceIds = new Set(sources.map(o => o.id));
  if (!sourceIds.size || sourceIds.size !== sources.length || sources.length > 40 || sources.some(s => destinationIds.has(s.id))) throw new DomainError('SIMULATION_TRANSFER', '来源实例无效');
  const claims = new Map<string, CharacterClaim>(), participants = new Map<string, string>();
  for (const source of sources) {
    const owner = await tx.get<Ownership>('simulation_owners', source.id), residency = await tx.get<Residency>('simulation_residencies', source.id);
    if (!owner || owner.deleted || owner.transferred || owner.ownerId !== source.ownerId || owner.epoch !== source.epoch || owner.expiresAt <= Date.now() ||
      owner.commitSequence !== source.commitSequence || owner.handoff?.id !== transferId || owner.handoff.sequence !== source.commitSequence)
      throw new DomainError('SIMULATION_FENCED', '来源实例未封存在指定检查点');
    if (!residency || residency.rulesetVersion !== destinations[0].rulesetVersion || residency.contentHash !== destinations[0].contentHash)
      throw new DomainError('SIMULATION_VERSION', '转移来源内容版本不一致');
    validateParticipants(residency.participants, residency.characterId);
    for (const p of residency.participants) {
      if (participants.has(p.characterId)) throw new DomainError('SIMULATION_TRANSFER', '来源角色重复');
      participants.set(p.characterId, p.accountId);
    }
    for (const claim of await tx.list<CharacterClaim>('simulation_characters', {instanceId: source.id})) claims.set(claim.id, claim);
  }
  const assignments = new Map<string, string>();
  for (const destination of destinations) {
    validateParticipants(destination.participants, destination.characterId);
    for (const p of destination.participants) {
      if (assignments.has(p.characterId) || participants.get(p.characterId) !== p.accountId)
        throw new DomainError('SIMULATION_TRANSFER', '转移必须保留所有真人角色及账号');
      assignments.set(p.characterId, destination.id);
    }
    if (participants.get(destination.characterId) !== destination.accountId)
      throw new DomainError('SIMULATION_TRANSFER', '目标账号归属无效');
  }
  if (assignments.size !== participants.size) throw new DomainError('SIMULATION_TRANSFER', '转移必须保留所有真人角色及账号');
  const expected = new Map<string,string|null>(participants);
  const admissions=new Set<string>(),releases=new Set<string>();
  for (const destination of destinations) {
    const admission = JSON.parse(destination.encodedAdmission) as CharacterAdmission;
    if (admission.instanceId !== destination.id || admission.state.id !== destination.characterId || admission.controllers.length !== destination.participants.length ||
      new Set(admission.controllers.map(c => c.actorId)).size !== destination.participants.length ||
      admission.controllers.some(c => assignments.get(c.actorId) !== destination.id || participants.get(c.actorId) !== c.accountId))
      throw new DomainError('SIMULATION_TRANSFER', '目标控制器名册无效');
    for(const {profile:npc}of residentNpcProfiles(admission.state)){
      if(expected.has(npc.id))throw new DomainError('SIMULATION_TRANSFER','目标 NPC 身份重复');
      const row=await tx.get('npc_characters',npc.id);
      if(!row||row.realm!=='public'||row.accountId!==null||npc.unit?.id!==npc.id||!npc.unit.npcPlayer)
        throw new DomainError('SIMULATION_TRANSFER','目标 NPC 所属角色无效');
      expected.set(npc.id,row.accountId);assignments.set(npc.id,destination.id);
    }
    const occupants = [admission.state, ...admission.state.party];
    if (new Set(occupants.map(a => a.id)).size !== occupants.length || occupants.some(a =>
      assignments.get(a.id) !== destination.id || (participants.has(a.id) ? a.npcPlayer === true : a.npcPlayer !== true)))
      throw new DomainError('SIMULATION_TRANSFER', '目标实例包含未归属或重复的单位');
  }
  for(const [id,accountId] of expected){
    const claim=claims.get(id);
    if(claim){if(claim.accountId!==accountId)throw new DomainError('SIMULATION_TRANSFER','角色账号归属改变');}
    else{
      const row=await tx.get('npc_characters',id);
      if(accountId!==null||row?.realm!=='public'||await tx.get('simulation_characters',id))throw new DomainError('SIMULATION_TRANSFER','只能从公共池独占接纳空闲 NPC');
      const target=destinations.find(d=>d.id===assignments.get(id))!;
      const state=(JSON.parse(target.encodedAdmission) as CharacterAdmission).state;
      const membership=await tx.get('social_members',id);
      if(state.goldRaid?.active){if(membership)throw new DomainError('SIMULATION_TRANSFER','NPC 已被其他队伍预留');}
      else if(!membership||membership.groupId!==state.dungeonRoster?.groupId)throw new DomainError('SIMULATION_TRANSFER','NPC 缺少匹配队伍预留');
      admissions.add(id);
    }
  }
  for(const claim of claims.values())if(!expected.has(claim.id)){
    if(claim.accountId!==null)throw new DomainError('SIMULATION_TRANSFER','转移不能丢失真人');
    const origin=await tx.get<Residency>('simulation_residencies',claim.instanceId);
    if(destinations.some(d=>d.participants.some(p=>origin?.participants.some(o=>o.characterId===p.characterId))&&(()=>{const s=JSON.parse(d.encodedAdmission).state;return s.dungeon||s.goldRaid?.active;})()))throw new DomainError('SIMULATION_TRANSFER','活动中必须保留全部真人与 NPC 执行权');
    releases.add(claim.id);
  }
  transfers.set(tx, {destinationIds, sourceIds, claims, assignments, admissions, releases});
  try {
    for (const destination of destinations) await tx.insert('simulation_residencies', destination);
    for(const id of releases)await tx.delete('simulation_characters',id);
    for(const id of admissions)await tx.insert('simulation_characters',{id,accountId:null,instanceId:assignments.get(id)!});
    for (const claim of claims.values())if(!releases.has(claim.id))await tx.put('simulation_characters', {...claim, instanceId: assignments.get(claim.id)!});
    for (const id of sourceIds) await tx.delete('simulation_residencies', id);
  } finally { transfers.delete(tx); }
}
