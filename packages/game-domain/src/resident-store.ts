import type {Store, Transaction, TableName, Row} from '../../persistence/src/store.ts';
import type {Ownership} from '../../persistence/src/simulation.ts';
import {DomainError} from './model.ts';
import type {Residency, CharacterAdmission} from './resident-characters.ts';
import {participantState, validateParticipants} from './resident-participants.ts';

export type CharacterClaim = {id: string; accountId: string; instanceId: string};
const wrapped = new WeakMap<Store, Store>();
const authority = new WeakMap<Transaction, Ownership>();
const deletions = new WeakMap<Transaction, string>();
const transfers = new WeakMap<Transaction, {destinationId: string; sourceIds: Set<string>; claims: Map<string, CharacterClaim>}>();
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
          case 'npc_characters': ids = [row.id, row.ownerCharacterId]; break;
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
          if (removing && deletions.get(tx) === claim.accountId) {
            const revoked = await raw.get<Ownership>('simulation_owners', claim.instanceId);
            if (revoked?.deleted?.saveId === claim.accountId) continue;
            throw new DomainError('SIMULATION_FENCED', '删除前必须撤销实例执行权');
          }
          const allowed = authority.get(tx);
          if (!allowed || allowed.id !== claim.instanceId)
            throw new DomainError('SIMULATION_OWNED', '角色由模拟实例管理，请通过实例执行操作');
          // The capability checks ownership once before and once after this
          // transaction's write batch, not once per inventory/NPC row.
        }
      };
      const write = async (table: TableName, row: Row, insert: boolean) => {
        const transfer = transfers.get(tx);
        if (transfer && table === 'simulation_characters') {
          const before = transfer.claims.get(row.id);
          if (insert || !before || row.accountId !== before.accountId || row.instanceId !== transfer.destinationId)
            throw new DomainError('SIMULATION_TRANSFER', '转移不得增删身份或改变账号归属');
        } else if (transfer && table === 'simulation_residencies') {
          if (!insert || row.id !== transfer.destinationId) throw new DomainError('SIMULATION_TRANSFER', '转移只能创建目标实例');
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
          if (transfer && table === 'simulation_residencies' && transfer.sourceIds.has(id)) {
            if ((await raw.list('simulation_characters', {instanceId: id})).length)
              throw new DomainError('SIMULATION_TRANSFER', '移除来源实例前必须转移所有角色');
          } else if (protectedTables.has(table)) await check(table, await raw.get(table, id), true);
          if (table === 'simulation_characters') claims.delete(id);
          await raw.delete(table, id);
        },
      };
      try { return await work(tx); } finally { authority.delete(tx); deletions.delete(tx); transfers.delete(tx); }
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

/** Called only inside SimulationRepository.transfer. This is deliberately NOT
 * a general multi-owner asset-write capability. It can only move existing
 * claims unchanged and replace their residency records; assets remain exactly
 * as committed by the source checkpoints. */
export async function transferResidentClaims(tx: Transaction, transferId: string, sources: Ownership[], destination: Residency): Promise<void> {
  if (transfers.has(tx) || authority.has(tx) || deletions.has(tx)) throw new Error('Nested resident transfer authority');
  const target = await tx.get<Ownership>('simulation_owners', destination.id);
  if (!target || target.ownerId !== 'transfer' || target.epoch !== 1 || target.commitSequence !== 0 ||
    target.handoff?.id !== transferId || target.handoff.sequence !== 0 || target.deleted || target.transferred)
    throw new DomainError('SIMULATION_TRANSFER', '目标实例未处于原子转移边界');
  const sourceIds = new Set(sources.map(o => o.id));
  if (!sourceIds.size || sourceIds.size !== sources.length || sourceIds.has(destination.id)) throw new DomainError('SIMULATION_TRANSFER', '来源实例无效');
  const claims = new Map<string, CharacterClaim>(), participants = new Map<string, string>();
  for (const source of sources) {
    const owner = await tx.get<Ownership>('simulation_owners', source.id), residency = await tx.get<Residency>('simulation_residencies', source.id);
    if (!owner || owner.deleted || owner.transferred || owner.ownerId !== source.ownerId || owner.epoch !== source.epoch || owner.expiresAt <= Date.now() ||
      owner.commitSequence !== source.commitSequence || owner.handoff?.id !== transferId || owner.handoff.sequence !== source.commitSequence)
      throw new DomainError('SIMULATION_FENCED', '来源实例未封存在指定检查点');
    if (!residency || residency.rulesetVersion !== destination.rulesetVersion || residency.contentHash !== destination.contentHash)
      throw new DomainError('SIMULATION_VERSION', '转移来源内容版本不一致');
    validateParticipants(residency.participants, residency.characterId);
    for (const p of residency.participants) {
      if (participants.has(p.characterId)) throw new DomainError('SIMULATION_TRANSFER', '来源角色重复');
      participants.set(p.characterId, p.accountId);
    }
    for (const claim of await tx.list<CharacterClaim>('simulation_characters', {instanceId: source.id})) claims.set(claim.id, claim);
  }
  validateParticipants(destination.participants, destination.characterId);
  if (participants.size !== destination.participants.length || destination.participants.some(p => participants.get(p.characterId) !== p.accountId) ||
    participants.get(destination.characterId) !== destination.accountId) throw new DomainError('SIMULATION_TRANSFER', '转移必须保留所有真人角色及账号');
  const admission = JSON.parse(destination.encodedAdmission) as CharacterAdmission;
  if (admission.instanceId !== destination.id || admission.state.id !== destination.characterId || admission.controllers.length !== participants.size ||
    new Set(admission.controllers.map(c => c.actorId)).size !== participants.size || admission.controllers.some(c => participants.get(c.actorId) !== c.accountId))
    throw new DomainError('SIMULATION_TRANSFER', '目标控制器名册无效');
  const expected = new Map(participants);
  for (const p of destination.participants) {
    const actor = participantState(admission.state, p.characterId);
    for (const npc of actor.npcWorld?.residents ?? []) {
      if (expected.has(npc.id)) throw new DomainError('SIMULATION_TRANSFER', '目标 NPC 身份重复');
      const row = await tx.get('npc_characters', npc.id);
      if (!row || row.ownerCharacterId !== p.characterId || row.accountId !== p.accountId) throw new DomainError('SIMULATION_TRANSFER', '目标 NPC 所属角色无效');
      expected.set(npc.id, p.accountId);
    }
  }
  if (claims.size !== expected.size || [...expected].some(([id, accountId]) => claims.get(id)?.accountId !== accountId))
    throw new DomainError('SIMULATION_TRANSFER', '转移必须保留全部真人与 NPC 执行权');
  transfers.set(tx, {destinationId: destination.id, sourceIds, claims});
  try {
    await tx.insert('simulation_residencies', destination);
    for (const claim of claims.values()) await tx.put('simulation_characters', {...claim, instanceId: destination.id});
    for (const id of sourceIds) await tx.delete('simulation_residencies', id);
  } finally { transfers.delete(tx); }
}
