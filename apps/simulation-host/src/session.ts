import {DEFAULT_IDLE_RETIRE_MS, idleRetireDelay, inactiveRoom} from './retirement-policy.ts';
import {SimulationRepository, type Ownership} from '../../../packages/persistence/src/simulation.ts';
import type {Admission, InstanceCheckpoint} from './instance.ts';
import {inputConfirmation, type SimulationInput, type PublishedInputReceipt} from '../../../packages/protocol/src/simulation.ts';
import {SimulationHost} from './host.ts';

export type PreparedTransfer = {transferId: string; owner: Ownership; checkpoint: InstanceCheckpoint};

/** IO coordinator for the stage-B runtime. One detached checkpoint and one
 * durable commit at a time per instance; a failed/uncertain commit fences the
 * local instance. The repository's game boundary materializes bound character
 * assets atomically; unbound benchmark rooms only persist their checkpoint. */
export class SimulationSession {
  private host: SimulationHost;
  private repository: SimulationRepository;
  private owner: Ownership;
  private timer?: NodeJS.Timeout;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private durableAccepted = 0;
  private durableApplied = 0;
  private stopped = false;
  private discarded = false;
  private closing?: Promise<void>;
  private retiring = false;
  private transfer?: {id: string; prepared: Promise<PreparedTransfer>; expires?: NodeJS.Timeout};
  private transferAbort?: Promise<void>;
  private fencing?: Promise<void>;
  private onRetired: () => void = () => {};
  private checkpointMs: number;
  private idleRetireMs = DEFAULT_IDLE_RETIRE_MS;
  private inactiveSince?: number;
  private onError: (error: unknown) => void;
  private constructor(host: SimulationHost, repository: SimulationRepository, owner: Ownership,
    checkpointMs: number, onError: (error: unknown) => void) {
    this.host = host; this.repository = repository; this.owner = owner; this.checkpointMs = checkpointMs; this.onError = onError;
  }
  get active() { return !this.stopped && !this.closing && !this.retiring && this.host.available(this.owner.id, this.owner.epoch); }
  /** Opening a replacement must wait for removal and lease release, including
   * an automatic retirement already executing in the serialized IO tail. */
  async whenStopped(): Promise<void> {
    if (this.active) return Promise.reject(new Error('Session is still active'));
    // A dead shard is observable before the next checkpoint timer. Fence its
    // session immediately, then drain any IO already accepted. Keep the lease
    // until expiry because that IO may have an uncertain durable outcome.
    if (!this.stopped && !this.closing && !this.retiring) void this.fenceLocal();
    await (this.closing ?? this.tail).catch(() => {});
    // Fencing marks the session unavailable synchronously, but IPC removal can
    // still be running outside the IO tail (for example a transfer timeout).
    await this.fencing;
  }
  identity() { if (this.stopped) throw new Error('Session fenced'); return {instanceId: this.owner.id, ownerEpoch: this.owner.epoch}; }
  static async open(host: SimulationHost, repository: SimulationRepository, ownerId: string,
    admission: Omit<Admission, 'ownerEpoch'>, options: {checkpointMs?: number; idleRetireMs?: number; onError?: (error: unknown) => void; onRetired?: () => void} = {}) {
    const checkpointMs = options.checkpointMs ?? 5000;
    if (!Number.isSafeInteger(checkpointMs) || checkpointMs < 100 || checkpointMs > 10_000) throw new Error('Invalid checkpoint interval');
    const idleRetireMs = idleRetireDelay(options.idleRetireMs ?? DEFAULT_IDLE_RETIRE_MS);
    const owner = await repository.acquire(admission.instanceId, ownerId);
    const session = new SimulationSession(host, repository, owner, checkpointMs, options.onError ?? console.error);
    session.idleRetireMs = idleRetireMs;
    session.onRetired = options.onRetired ?? (() => {});
    try {
      const saved = await repository.load<InstanceCheckpoint>(admission.instanceId);
      const leaseMs = session.remainingLease();
      if (saved) await host.restore(saved.checkpoint, owner.epoch, {leaseMs});
      else await host.admit({...admission, ownerEpoch: owner.epoch}, {leaseMs});
      await session.persist();
      // Deterministic staggering avoids synchronized checkpoint bursts.
      let offset = 0; for (const char of owner.id) offset = (offset * 31 + char.charCodeAt(0)) % checkpointMs;
      session.schedule(100 + offset);
      return session;
    } catch (error) {
      await session.fenceLocal();
      // Do not release an uncertain durable write; expiry/recovery resolves it.
      throw error;
    }
  }
  /** Durable means this applied/rejected receipt and the containing state have
   * committed. It does not mean the requested spell has finished casting. */
  input(accountId: string, input: SimulationInput): Promise<PublishedInputReceipt> {
    return this.enqueue(async () => {
      if (input.instanceId !== this.owner.id) throw new Error('Wrong instance');
      this.remainingLease();
      await this.syncContentPhase();
      const applied = await this.host.input(accountId, input);
      const confirmation = inputConfirmation(input.command);
      if (confirmation === 'durable' && applied.status !== 'rejected') await this.persist();
      this.remainingLease();
      return {...applied, confirmation, durable: applied.inputSequence <= (applied.status === 'queued' ? this.durableAccepted : this.durableApplied)};
    });
  }
  project(full = false) {
    return this.enqueue(async () => {
      this.remainingLease();
      const frame = await this.host.project(this.owner.id, Date.now(), full);
      this.remainingLease(); // DB ownership must still be live before publishing.
      return frame;
    });
  }
  checkpoint(retireIdle = false) { return this.enqueue(() => this.persist(retireIdle)); }
  presentation(accountId:string,actorId:string,scope:'full'|'combat',online=false) {
    return this.enqueue(async()=>{
      this.remainingLease();await this.syncContentPhase();const response=await this.host.presentation(this.owner.id,accountId,actorId,scope,online);
      this.remainingLease();return response;
    });
  }
  /** Local barrier followed by a durable seal. Operations already accepted
   * drain first; new inputs and publications are refused synchronously. The
   * Worker remains stopped until a fenced abort or durable transfer discard. */
  prepareTransfer(transferId: string, alignment?: (checkpoint: InstanceCheckpoint)=>Promise<number>): Promise<PreparedTransfer> {
    if (typeof transferId !== 'string' || !transferId || transferId.length > 120) return Promise.reject(new Error('Invalid transfer ID'));
    if (!this.active) return Promise.reject(new Error('Session unavailable or busy'));
    if (this.transfer) return this.transfer.id === transferId
      ? this.transfer.prepared.then(value => structuredClone(value)) : Promise.reject(new Error('Different transfer pending'));
    if (this.stopped || this.closing || this.retiring || this.pending >= 16) return Promise.reject(new Error('Session unavailable or busy'));
    if (this.timer) clearTimeout(this.timer);
    const prepared = this.enqueue(async () => {
      try {
        await this.syncContentPhase();
        let checkpoint = await this.host.quiesce(this.owner.id);
        if(alignment){
          const until=await this.deadline(alignment(checkpoint),'Transfer alignment deadline exceeded');
          let complete=false,lastWall=checkpoint.state.wallAt,lastPending=checkpoint.inputSequence-checkpoint.appliedInputSequence;
          for(let slice=0;slice<256&&!complete;slice++){
            this.remainingLease();
            const result=await this.host.alignQuiesced(this.owner.id,until);
            if(result.wallAt<until&&result.wallAt===lastWall&&result.pendingInputs===lastPending)
              throw new Error('Transfer cannot advance beyond offline allowance');
            complete=result.complete&&result.wallAt===until;
            lastWall=result.wallAt;lastPending=result.pendingInputs;
          }
          if(!complete)throw new Error('Transfer alignment budget exceeded');
          checkpoint=await this.host.checkpoint(this.owner.id);
          if(checkpoint.inputSequence!==checkpoint.appliedInputSequence)throw new Error('Transfer still has unapplied inputs');
        }
        await this.persist(false, checkpoint);
        this.owner = await this.deadline(this.repository.seal(this.owner, transferId));
        const transfer = this.transfer!;
        transfer.expires = setTimeout(() => {
          void this.fenceLocal().then(() => this.onError(new Error('Transfer decision deadline exceeded')));
        }, Math.min(10_000, this.remainingLease()));
        return {transferId, owner: {...this.owner}, checkpoint};
      } catch (error) { await this.fenceLocal(); throw error; }
    });
    this.transfer = {id: transferId, prepared};
    return prepared.then(value => structuredClone(value));
  }
  /** Freeze every source first, then advance each to the latest accepted wall
   * boundary. No worker waits for another worker or for SQL while advancing. */
  static async prepareGroupTransfer(sessions: readonly SimulationSession[], transferId: string): Promise<PreparedTransfer[]> {
    if(sessions.length<2||sessions.length>5||new Set(sessions.map(s=>s.identity().instanceId)).size!==sessions.length)
      throw new Error('Invalid transfer source sessions');
    if(sessions.some(s=>s.transfer)){
      if(!sessions.every(s=>s.transfer?.id===transferId))throw new Error('A source already has another preparation');
      const previous=await Promise.all(sessions.map(s=>s.prepareTransfer(transferId)));
      if(new Set(previous.map(p=>p.checkpoint.state.wallAt)).size!==1)throw new Error('Existing preparations are not aligned');
      return previous;
    }
    let resolve!:(wallAt:number)=>void,reject!:(error:unknown)=>void;
    const boundary=new Promise<number>((yes,no)=>{resolve=yes;reject=no;});
    void boundary.catch(()=>{});
    let arrived=0,until=0;
    const alignment=async(checkpoint:InstanceCheckpoint)=>{
      until=Math.max(until,checkpoint.state.wallAt,...checkpoint.recentInputs.filter(row=>row.receipt.status==='queued').map(row=>row.receipt.effectiveWallAt));
      if(++arrived===sessions.length)resolve(until);
      return boundary;
    };
    const work=sessions.map(session=>session.prepareTransfer(transferId,alignment));
    for(const task of work)void task.catch(reject);
    const results=await Promise.allSettled(work),errors=results.flatMap(r=>r.status==='rejected'?[r.reason]:[]);
    if(errors.length){
      const aborts=await Promise.allSettled(results.map((r,i)=>r.status==='fulfilled'?sessions[i].abortTransfer(transferId):Promise.resolve()));
      for(const r of aborts)if(r.status==='rejected')errors.push(r.reason);
      throw new AggregateError(errors,'Unable to prepare all transfer sources');
    }
    return results.map(r=>(r as PromiseFulfilledResult<PreparedTransfer>).value);
  }
  abortTransfer(transferId: string): Promise<void> {
    const transfer = this.transfer;
    if (!transfer || transfer.id !== transferId) return Promise.reject(new Error('Different transfer pending'));
    if (this.transferAbort) return this.transferAbort;
    this.transferAbort = (async () => {
      try {
        await transfer.prepared;
        if (this.stopped || this.closing) throw new Error('Session fenced');
        this.owner = await this.deadline(this.repository.unseal(this.owner, transferId));
        this.remainingLease();
        await this.host.resumeExecution(this.owner.id);
        if (transfer.expires) clearTimeout(transfer.expires);
        this.transfer = undefined;
        this.schedule(this.checkpointMs);
      } catch (error) { await this.fenceLocal(); throw error; }
      finally { this.transferAbort = undefined; }
    })();
    return this.transferAbort;
  }
  /** The durable save deletion already revoked this owner. Saving again would
   * resurrect discarded state; only stop local execution and drain its tail. */
  async discard() {
    this.discarded = true;
    await this.fenceLocal();
    await this.tail;
  }
  async close() {
    if (this.closing) return this.closing;
    if (this.transfer) {
      // Shutdown cannot turn an uncertain transfer into a released old owner.
      this.closing = (async () => { await this.transfer!.prepared.catch(() => {}); await this.fenceLocal(); })();
      return this.closing;
    }
    if (this.retiring) return this.whenStopped();
    if (this.stopped) return this.whenStopped();
    if (this.timer) clearTimeout(this.timer);
    this.closing = this.enqueue(async () => {
      await this.persist();
      await this.host.remove(this.owner.id, this.owner.epoch);
      await this.repository.release(this.owner);
      this.stopped = true;
    });
    return this.closing;
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (this.stopped || this.closing || this.retiring || this.transfer || this.pending >= 16) return Promise.reject(new Error('Session unavailable or busy'));
    this.pending++;
    const result = this.tail.then(async () => {
      if (this.stopped) throw new Error('Session fenced');
      return work();
    });
    this.tail = result.catch(() => {});
    return result.finally(() => { this.pending--; });
  }
  private async syncContentPhase(){await this.host.contentPhase(this.owner.id,await this.deadline(this.repository.contentPhase(),'Content phase read deadline exceeded'));}
  private async persist(retireIdle = false, captured?: InstanceCheckpoint) {
    try {
      this.remainingLease();
      if(!captured)await this.syncContentPhase();
      const checkpoint = captured ?? await this.host.checkpoint(this.owner.id);
      const sequence = this.owner.commitSequence + 1;
      await this.deadline(this.repository.commit(this.owner, sequence, checkpoint));
      this.owner.commitSequence = sequence;
      await this.host.confirmCheckpoint(this.owner.id, checkpoint.inputSequence, checkpoint.appliedInputSequence);
      this.durableAccepted = checkpoint.inputSequence; this.durableApplied = checkpoint.appliedInputSequence;
      const presence = checkpoint.presence;
      const now = Date.now();
      const inactive = checkpoint.inputSequence === checkpoint.appliedInputSequence && inactiveRoom(checkpoint.state);
      this.inactiveSince = inactive ? this.inactiveSince ?? now : undefined;
      const unobservedIdle = presence && this.inactiveSince !== undefined &&
        now >= Math.max(this.inactiveSince, ...presence.accounts.map(([, at]) => at)) + this.idleRetireMs;
      const idle = checkpoint.inputSequence === checkpoint.appliedInputSequence && presence && checkpoint.state.wallAt >= Math.min(...presence.accounts.map(([, at]) => at)) + presence.offlineLimitMs;
      // No other session operation may be accepted between this decision and
      // removal. An input arriving during the commit keeps the room resident.
      // A shared room may be frozen by one absent participant while another
      // still watches it. Keep that owner resident instead of churning epochs
      // on every authenticated projection. Reclaim once every allowance expires.
      const allOffline = presence && Date.now() >= Math.max(...presence.accounts.map(([, at]) => at)) + presence.offlineLimitMs;
      if (retireIdle && (idle && allOffline || unobservedIdle) && this.pending === 1 && !this.closing) {
        this.retiring = true;
        if (this.timer) clearTimeout(this.timer);
        await this.host.remove(this.owner.id, this.owner.epoch);
        await this.deadline(this.repository.release(this.owner));
        this.stopped = true;
        this.onRetired();
        return {sequence, ownerEpoch: this.owner.epoch};
      }
      this.owner = await this.deadline(this.repository.renew(this.owner));
      await this.host.renew(this.owner.id, this.remainingLease());
      return {sequence, ownerEpoch: this.owner.epoch};
    } catch (error) { await this.fenceLocal(); throw error; }
  }
  private remainingLease() {
    // A margin for IPC keeps the worker deadline earlier than the durable lease.
    const remaining = this.owner.expiresAt - Date.now() - 1000;
    if (remaining <= 0) throw new Error('Owner lease expired');
    return remaining;
  }
  private async deadline<T>(work: Promise<T>, message = 'Durable IO deadline exceeded'): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), Math.min(5000, this.remainingLease()));
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  private schedule(delay: number) {
    if (this.stopped || this.closing || this.retiring || this.transfer) return;
    this.timer = setTimeout(() => {
      if (this.stopped || this.closing || this.retiring || this.transfer) return;
      void this.checkpoint(true).then(() => this.schedule(this.checkpointMs), error => {
        void this.fenceLocal().then(() => { if (!this.discarded) this.onError(error); });
      });
    }, delay);
  }
  private async fenceLocal() {
    if (this.fencing) return this.fencing;
    this.stopped = true;
    if (this.transfer?.expires) clearTimeout(this.transfer.expires);
    if (this.timer) clearTimeout(this.timer);
    this.fencing = this.host.remove(this.owner.id, this.owner.epoch).catch(() => {});
    return this.fencing;
  }
}
