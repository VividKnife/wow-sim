import {createHash} from 'node:crypto';
import type {Store, Transaction} from './store.ts';
import {assertJson} from '../../sim-core/src/json.js';

export type Ownership = {id: string; ownerId: string; epoch: number; expiresAt: number; commitSequence: number; handoff?: {id: string; sequence: number}; deleted?: {at: number; userId: string; saveId: string}; transferred?: {id: string; destinationIds: string[]; at: number}};
export type DurableCheckpoint = {instanceId: string; ownerEpoch: number; rulesetVersion: string; contentHash: string};
export type CommittedCheckpoint<T> = {id: string; sequence: number; checkpoint: T};
export type TransferBoundary<T extends DurableCheckpoint> = (tx: Transaction, context: {
  transferId: string; destinations: Ownership[]; sources: {owner: Ownership; checkpoint: T}[];
}) => Promise<T[]>;
export type CheckpointBoundary = (tx: Transaction, context: {
  owner: Ownership; sequence: number; businessKey: string; checkpoint: DurableCheckpoint;
}) => Promise<void>;
type StoredCheckpoint = {id: string; sequence: number; encodedCheckpoint: string};
export type SettlementBoundary = {
  encounterId: string; sequence: number; facts: unknown;
  apply: (tx: Transaction, businessKey: string) => Promise<void>;
};
const integer = (value: number, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error('Invalid durable cursor');
};
function lease(now: number, duration: number) { integer(now); integer(duration, 1); if (duration > 60_000) throw new Error('Lease too long'); integer(now + duration); }
function identity(value: string) { if (typeof value !== 'string' || !value || value.length > 120) throw new Error('Invalid owner identity'); }
function checkpointFingerprint(value: Record<string, unknown>): string {
  // Envelope key order is immaterial, but nested rule maps currently have
  // insertion-order semantics. Never canonical-sort the simulation tree.
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + JSON.stringify(value[key])).join(',') + '}';
}
function factEncoding(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(factEncoding).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + factEncoding(value[key])).join(',') + '}';
}

/** All ownership and checkpoint writes use the store's serializable transaction.
 * No database calls originate inside combat rules or the simulation worker. */
export class SimulationRepository {
  private store: Store;
  private now: () => number;
  private boundary?: CheckpointBoundary;
  constructor(store: Store, now: () => number = Date.now, boundary?: CheckpointBoundary) {
    this.store = store; this.now = now; this.boundary = boundary;
  }
  async acquire(instanceId: string, ownerId: string, leaseMs = 30_000): Promise<Ownership> {
    identity(instanceId); identity(ownerId);
    return this.store.transaction(async tx => {
      const now = this.now(); lease(now, leaseMs);
      const old = await tx.get<Ownership>('simulation_owners', instanceId);
      if (old?.deleted) throw new Error('Instance permanently deleted');
      if (old?.transferred) throw new Error('Instance permanently transferred');
      if (old && old.expiresAt > now) throw new Error('Owner lease held');
      const epoch = (old?.epoch ?? 0) + 1; integer(epoch, 1);
      const next: Ownership = {id: instanceId, ownerId, epoch, expiresAt: now + leaseMs, commitSequence: old?.commitSequence ?? 0};
      await tx.put('simulation_owners', next);
      return next;
    });
  }
  async renew(owner: Ownership, leaseMs = 30_000): Promise<Ownership> {
    return this.store.transaction(async tx => {
      const now = this.now(); lease(now, leaseMs);
      const current = await this.fence(tx, owner, now);
      current.expiresAt = now + leaseMs;
      await tx.put('simulation_owners', current);
      return current;
    });
  }
  load<T extends DurableCheckpoint>(instanceId: string) {
    return this.store.read(async tx => {
      const row = await tx.get<StoredCheckpoint>('simulation_checkpoints', instanceId);
      return row ? {id: row.id, sequence: row.sequence, checkpoint: JSON.parse(row.encodedCheckpoint) as T} : null;
    });
  }
  /** settlement.apply must only mutate this transaction. Reward identity uses
   * encounter/settlement sequence, independent of checkpoint cadence and epoch.
   * Checkpoint + assets + outbox commit atomically.
   * The callback is a domain boundary, not a generic rewards implementation. */
  async commit<T extends DurableCheckpoint>(owner: Ownership, sequence: number, checkpoint: T,
    settlement?: SettlementBoundary) {
    integer(sequence, 1);
    if (checkpoint.instanceId !== owner.id || checkpoint.ownerEpoch !== owner.epoch) throw new Error('Checkpoint owner mismatch');
    // Normalize the durable representation before hashing; SQL stores JSON too.
    const encodedCheckpoint = JSON.stringify(checkpoint);
    const canonical = JSON.parse(encodedCheckpoint) as T;
    let settlementKey: string | null = null, factsHash: string | null = null;
    if (settlement) {
      identity(settlement.encounterId); integer(settlement.sequence, 1); assertJson(settlement.facts, 'settlement facts');
      const facts = factEncoding(settlement.facts);
      if (Buffer.byteLength(facts) > 65_536) throw new Error('Settlement facts too large');
      settlementKey = 'sim-settlement:' + createHash('sha256').update(JSON.stringify([owner.id, settlement.encounterId, settlement.sequence])).digest('hex');
      factsHash = createHash('sha256').update(facts).digest('hex');
    }
    const fingerprint = createHash('sha256').update(checkpointFingerprint({...canonical, ownerEpoch: 0, settlementKey, factsHash})).digest('hex');
    const id = `simulation:${owner.id}:${sequence}`;
    return this.store.transaction(async tx => {
      const current = await this.fence(tx, owner, this.now());
      const previous = await tx.get<{id: string; fingerprint: string}>('simulation_commits', id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error('Commit sequence reused');
        return {sequence, duplicate: true};
      }
      if (sequence !== current.commitSequence + 1) throw new Error('Invalid commit sequence');
      const saved = await tx.get<StoredCheckpoint>('simulation_checkpoints', owner.id);
      const previousCheckpoint: T | undefined = saved ? JSON.parse(saved.encodedCheckpoint) : undefined;
      if (previousCheckpoint && (previousCheckpoint.rulesetVersion !== checkpoint.rulesetVersion || previousCheckpoint.contentHash !== checkpoint.contentHash)) throw new Error('Runtime version mismatch');
      // Materialize owned character state in the same transaction as its
      // checkpoint. This runs once per commit, after fencing and retry checks.
      await this.boundary?.(tx, {owner: current, sequence, businessKey: id, checkpoint: canonical});
      if (settlement && settlementKey) {
        const previousSettlement = await tx.get('settlements', settlementKey);
        if (previousSettlement) {
          if (previousSettlement.factsHash !== factsHash) throw new Error('Settlement facts changed');
        } else {
          await settlement.apply(tx, settlementKey);
          await tx.insert('settlements', {id: settlementKey, businessKey: settlementKey, instanceId: owner.id,
            encounterId: settlement.encounterId, sequence: settlement.sequence, factsHash, facts: settlement.facts});
        }
      }
      // Domain transactions may take time. Expiry during asset writes must
      // roll back the whole boundary rather than publish a late commit.
      await this.fence(tx, owner, this.now());
      // JSONB reorders object keys. Existing AI iterates some string-keyed maps
      // in insertion order, so store the boundary payload losslessly as text.
      await tx.put('simulation_checkpoints', {id: owner.id, sequence, encodedCheckpoint});
      await tx.insert('simulation_commits', {id, instanceId: owner.id, sequence, fingerprint});
      current.commitSequence = sequence;
      await tx.put('simulation_owners', current);
      return {sequence, duplicate: false};
    });
  }
  /** Called only after the Worker has stopped execution and publication.
   * The durable seal prevents any later checkpoint/renew/release from this
   * owner while an atomic character transfer is being decided. */
  async seal(owner: Ownership, transferId: string): Promise<Ownership> {
    identity(transferId);
    return this.store.transaction(async tx => {
      const current = await this.fence(tx, owner, this.now(), true);
      if (current.commitSequence !== owner.commitSequence) throw new Error('Transfer checkpoint changed');
      if (current.handoff) {
        if (current.handoff.id !== transferId || current.handoff.sequence !== current.commitSequence) throw new Error('Different transfer pending');
        return current;
      }
      const saved = await tx.get<StoredCheckpoint>('simulation_checkpoints', owner.id);
      if (!saved || saved.sequence !== current.commitSequence) throw new Error('Transfer checkpoint missing');
      await this.fence(tx, owner, this.now(), true);
      current.handoff = {id: transferId, sequence: current.commitSequence};
      await tx.put('simulation_owners', current);
      return current;
    });
  }
  /** Aborting is a fenced operation too: a changed owner or completed transfer
   * must never cause the old Worker to resume. Repeating the same abort before
   * further commits is harmless. */
  async unseal(owner: Ownership, transferId: string): Promise<Ownership> {
    identity(transferId);
    return this.store.transaction(async tx => {
      const current = await this.fence(tx, owner, this.now(), true);
      if (current.commitSequence !== owner.commitSequence) throw new Error('Transfer checkpoint changed');
      if (current.handoff && (current.handoff.id !== transferId || current.handoff.sequence !== current.commitSequence))
        throw new Error('Different transfer pending');
      await this.fence(tx, owner, this.now(), true);
      delete current.handoff;
      await tx.put('simulation_owners', current);
      return current;
    });
  }
  /** Sealed rooms are partitioned into one or more recoverable destinations.
   * The domain boundary conserves all character claims across the partition.
   * Old owners become permanent tombstones in the SAME transaction. Targets
   * start without execution leases; normal acquire/restore owns their startup.
   * No Worker or network side effects are permitted in create. */
  async transfer<T extends DurableCheckpoint>(transferId: string, sources: Ownership[], destinationIds: string[],
    create: TransferBoundary<T>): Promise<{instanceIds: string[]; duplicate: boolean}> {
    identity(transferId);
    if (!Array.isArray(destinationIds) || destinationIds.length < 1 || destinationIds.length > 40 ||
      new Set(destinationIds).size !== destinationIds.length) throw new Error('Invalid transfer destinations');
    destinationIds = [...destinationIds];
    for (const id of destinationIds) identity(id);
    if (!Array.isArray(sources) || sources.length < 1 || sources.length > 40 ||
      new Set(sources.map(o => o.id)).size !== sources.length || sources.some(o => destinationIds.includes(o.id))) throw new Error('Invalid transfer sources');
    const tokens = sources.map(o => {
      identity(o.id); identity(o.ownerId); integer(o.epoch, 1); integer(o.commitSequence, 1);
      return {id: o.id, ownerId: o.ownerId, epoch: o.epoch, commitSequence: o.commitSequence};
    });
    const fingerprint = createHash('sha256').update(JSON.stringify({destinationIds, sources: tokens})).digest('hex');
    const receiptId = `simulation-transfer:${transferId}`;
    return this.store.transaction(async tx => {
      const previous = await tx.get('receipts', receiptId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error('Transfer ID reused');
        return {instanceIds: [...destinationIds], duplicate: true};
      }
      for (const destinationId of destinationIds) for (const table of ['simulation_owners', 'simulation_checkpoints', 'simulation_residencies'] as const)
        if (await tx.get(table, destinationId)) throw new Error('Transfer destination already exists');
      const prepared: {owner: Ownership; checkpoint: T}[] = [];
      const fencedSource = async (token: typeof tokens[number]) => {
        const owner = await this.fence(tx, {...token, expiresAt: 0}, this.now(), true);
        if (owner.handoff?.id !== transferId || owner.handoff.sequence !== token.commitSequence || owner.commitSequence !== token.commitSequence)
          throw new Error('Transfer source is not sealed at the requested cursor');
        return owner;
      };
      for (const token of tokens) {
        const owner = await fencedSource(token);
        const row = await tx.get<StoredCheckpoint>('simulation_checkpoints', token.id);
        if (!row || row.sequence !== token.commitSequence) throw new Error('Transfer checkpoint missing');
        const checkpoint = JSON.parse(row.encodedCheckpoint) as T;
        if (checkpoint.instanceId !== token.id || checkpoint.ownerEpoch !== token.epoch) throw new Error('Transfer checkpoint owner mismatch');
        if (prepared.length && (checkpoint.rulesetVersion !== prepared[0].checkpoint.rulesetVersion || checkpoint.contentHash !== prepared[0].checkpoint.contentHash))
          throw new Error('Transfer runtime version mismatch');
        prepared.push({owner, checkpoint});
      }
      const now = this.now(); integer(now);
      const destinations: Ownership[] = destinationIds.map(id => ({id, ownerId: 'transfer', epoch: 1, expiresAt: now, commitSequence: 0,
        handoff: {id: transferId, sequence: 0}}));
      for (const destination of destinations) await tx.insert('simulation_owners', destination);
      const {rulesetVersion, contentHash} = prepared[0].checkpoint;
      const checkpoints = await create(tx, {transferId, destinations: structuredClone(destinations), sources: prepared});
      if (!Array.isArray(checkpoints) || checkpoints.length !== destinations.length ||
        new Set(checkpoints.map(c => c?.instanceId)).size !== destinations.length) throw new Error('Transfer destination checkpoint coverage mismatch');
      const encoded = new Map<string, {encodedCheckpoint: string; canonical: T}>();
      for (const checkpoint of checkpoints) {
        const destination = destinations.find(d => d.id === checkpoint?.instanceId);
        if (!destination || checkpoint.ownerEpoch !== destination.epoch ||
          checkpoint.rulesetVersion !== rulesetVersion || checkpoint.contentHash !== contentHash)
          throw new Error('Transfer destination checkpoint mismatch');
        const encodedCheckpoint = JSON.stringify(checkpoint);
        encoded.set(destination.id, {encodedCheckpoint, canonical: JSON.parse(encodedCheckpoint) as T});
      }
      // A slow domain boundary cannot commit after a source lease has expired.
      // Serializable conflict detection also rejects a concurrent takeover.
      for (const token of tokens) await fencedSource(token);
      const at = this.now(); integer(at);
      for (const token of tokens) {
        const epoch = token.epoch + 1; integer(epoch, 1);
        await tx.put('simulation_owners', {...token, epoch, expiresAt: at, transferred: {id: transferId, destinationIds, at}});
        // The targets now carry the state. Keep only the small retirement
        // marker, not another full character/NPC snapshot for every transition.
        await tx.delete('simulation_checkpoints', token.id);
      }
      for (const destination of destinations) {
        const {encodedCheckpoint, canonical} = encoded.get(destination.id)!;
        await tx.put('simulation_checkpoints', {id: destination.id, sequence: 1, encodedCheckpoint});
        await tx.insert('simulation_commits', {id: `simulation:${destination.id}:1`, instanceId: destination.id, sequence: 1,
          fingerprint: createHash('sha256').update(checkpointFingerprint({...canonical, ownerEpoch: 0, settlementKey: null, factsHash: null})).digest('hex')});
        delete destination.handoff;
        await tx.put('simulation_owners', {...destination, expiresAt: at, commitSequence: 1});
      }
      await tx.insert('receipts', {id: receiptId, fingerprint, destinationIds, sourceIds: tokens.map(o => o.id), at});
      return {instanceIds: [...destinationIds], duplicate: false};
    });
  }
  async release(owner: Ownership) {
    return this.store.transaction(async tx => {
      const now = this.now(), current = await this.fence(tx, owner, now);
      current.expiresAt = now; await tx.put('simulation_owners', current);
    });
  }
  private async fence(tx: Transaction, owner: Ownership, now: number, allowSealed = false) {
    integer(now);
    const current = await tx.get<Ownership>('simulation_owners', owner.id);
    if (!current || current.deleted || current.transferred || current.epoch !== owner.epoch || current.ownerId !== owner.ownerId || current.expiresAt <= now) throw new Error('Owner fenced');
    if (current.handoff && !allowSealed) throw new Error('Owner sealed for transfer');
    return current;
  }
}
