import {Worker} from 'node:worker_threads';
import {AsyncResource} from 'node:async_hooks';
import {integer} from '../../../packages/combat-core/scheduling/event-queue.ts';
import type {Admission, InstanceCheckpoint} from './instance.ts';
import type {SimulationInput, InputReceipt, PublicFrame} from '../../../packages/protocol/src/simulation.ts';
import type {WorkerOperation, WorkerResponse} from './messages.ts';
import type {GameResponse} from '../../../packages/contracts/src/game.ts';

type Pending = {resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; resource: AsyncResource};
type Shard = {worker: Worker; instances: Set<string>; pending: Map<number, Pending>; ready:boolean; failed: boolean; restart?: NodeJS.Timeout; restartAt?: number; failure?: string; startedAt: number; failures: number};
type Route = {shard: Shard; epoch: number; ready: boolean};
export type HostOptions = {workers?: number; maxInstances?: number; maxPendingPerWorker?: number; requestTimeoutMs?: number};

/** Fixed ownership, bounded mailboxes. Full state crosses threads only on
 * admission/checkpoint; advancement replies contain just cursors. Internal API:
 * callers must acquire durable ownership and authenticate accounts first. */
export class SimulationHost {
  private shards: Shard[] = [];
  private routes = new Map<string, Route>();
  private sequence = 0;
  private closed = false;
  private options: Required<HostOptions>;
  constructor(options: HostOptions = {}) {
    this.options = {workers: 1, maxInstances: 128, maxPendingPerWorker: 64, requestTimeoutMs: 30_000, ...options};
    for (const [key, value] of Object.entries(this.options)) integer(value, key, 1);
    for (let index = 0; index < this.options.workers; index++) {
      this.shards.push(this.spawn(index, 0));
    }
  }
  private spawn(index: number, failures: number): Shard {
    const worker = new Worker(new URL('./worker.ts', import.meta.url));
    const shard: Shard = {worker, instances: new Set(), pending: new Map(), ready:false, failed: false, startedAt: Date.now(), failures};
    worker.on('message', (message: WorkerResponse) => {
      if(message.id===0&&message.ok){shard.ready=true;return;}
      const pending = shard.pending.get(message.id);
      if (!pending) return;
      shard.pending.delete(message.id); clearTimeout(pending.timer);
      pending.resource.runInAsyncScope(() => message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error)));
      pending.resource.emitDestroy();
    });
    worker.on('error', error => this.fail(shard, error));
    worker.on('exit', code => {
      this.fail(shard, new Error(`Simulation worker exited (${code})`));
      // Only an observed exit permits replacement. A timed-out thread may
      // still be executing; it must terminate before this slot is reused.
      for (const id of shard.instances) if (this.routes.get(id)?.shard === shard) this.routes.delete(id);
      shard.instances.clear();
      if (this.closed) return;
      const attempts = Date.now() - shard.startedAt >= 60_000 ? 0 : shard.failures;
      this.replaceAfterExit(index, shard, attempts);
    });
    return shard;
  }
  private replaceAfterExit(index: number, shard: Shard, attempts: number) {
    const delay = Math.min(30_000, 100 * 2 ** attempts);
    shard.restartAt = Date.now() + delay;
    shard.restart = setTimeout(() => {
      if (this.closed || this.shards[index] !== shard) return;
      const next = Math.min(attempts + 1, 9);
      try { this.shards[index] = this.spawn(index, next); }
      catch (error) {
        // Thread allocation can itself fail. Keep the slot unavailable and
        // back off instead of throwing out of a timer and crashing the host.
        shard.failure = String(error);
        this.replaceAfterExit(index, shard, next);
      }
    }, delay);
  }
  available(instanceId: string, epoch: number) {
    const route = this.routes.get(instanceId);
    return !this.closed && route?.ready === true && !route.shard.failed && route.epoch === epoch;
  }
  async admit(admission: Admission, options: {leaseMs?: number; realtime?: boolean} = {}) {
    return this.install(admission.instanceId, admission.ownerEpoch,
      {kind: 'admit', admission, leaseMs: options.leaseMs ?? 30_000, realtime: options.realtime ?? true});
  }
  async restore(checkpoint: InstanceCheckpoint, ownerEpoch: number, options: {leaseMs?: number; realtime?: boolean} = {}) {
    return this.install(checkpoint.instanceId, ownerEpoch,
      {kind: 'restore', checkpoint, ownerEpoch, leaseMs: options.leaseMs ?? 30_000, realtime: options.realtime ?? true});
  }
  checkpoint(instanceId: string): Promise<InstanceCheckpoint> { return this.call(instanceId, {kind: 'checkpoint'}); }
  quiesce(instanceId: string): Promise<InstanceCheckpoint> { return this.call(instanceId, {kind: 'quiesce'}); }
  alignQuiesced(instanceId: string, until: number): Promise<{complete:boolean;wallAt:number;simTime:number;pendingInputs:number}> {
    return this.call(instanceId,{kind:'alignQuiesced',until});
  }
  resumeExecution(instanceId: string): Promise<boolean> { return this.call(instanceId, {kind: 'resumeExecution'}); }
  advance(instanceId: string, until: number, maxTicks = 10): Promise<{complete: boolean; wallAt: number; simTime: number}> {
    return this.call(instanceId, {kind: 'advance', until, maxTicks});
  }
  input(accountId: string, input: SimulationInput): Promise<InputReceipt> { return this.call(input.instanceId, {kind: 'input', accountId, input}); }
  project(instanceId: string, serverTime: number, full = false): Promise<PublicFrame> { return this.call(instanceId, {kind: 'project', serverTime, full}); }
  presentation(instanceId:string,accountId:string,actorId:string,scope:'full'|'combat',online=false):Promise<GameResponse>{return this.call(instanceId,{kind:'presentation',accountId,actorId,scope,online});}
  confirmCheckpoint(instanceId:string,accepted:number,applied:number):Promise<boolean>{return this.call(instanceId,{kind:'confirmCheckpoint',accepted,applied});}
  renew(instanceId: string, leaseMs: number): Promise<boolean> { return this.call(instanceId, {kind: 'renew', leaseMs}); }
  async remove(instanceId: string, expectedEpoch?: number) {
    const route = this.route(instanceId);
    if (expectedEpoch !== undefined && expectedEpoch !== route.epoch) throw new Error('Owner fenced');
    await this.call(instanceId, {kind: 'remove'});
    if (this.routes.get(instanceId) === route) { this.routes.delete(instanceId); route.shard.instances.delete(instanceId); }
  }
  inspect() { return this.shards.map((shard, index) => ({worker: index, instances: shard.instances.size, pending: shard.pending.size, ready:shard.ready, failed: shard.failed, consecutiveRestarts: shard.failures, restartAt: shard.restartAt ?? null, failure: shard.failure ?? null})); }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const shard of this.shards) { if (shard.restart) clearTimeout(shard.restart); this.fail(shard, new Error('Host closed')); }
    await Promise.all(this.shards.map(shard => shard.worker.terminate()));
    this.routes.clear();
  }
  private async install(instanceId: string, epoch: number, operation: WorkerOperation) {
    if (this.closed || this.routes.has(instanceId) || this.routes.size >= this.options.maxInstances) throw new Error('Instance admission refused');
    const shard = this.shards.filter(row => !row.failed).sort((a, b) => a.instances.size - b.instances.size)[0];
    if (!shard) throw new Error('No healthy simulation workers');
    const route: Route = {shard, epoch, ready: false};
    this.routes.set(instanceId, route); shard.instances.add(instanceId);
    try {
      const result = await this.send(shard, operation);
      if (shard.failed || this.routes.get(instanceId) !== route) throw new Error('Instance unavailable');
      route.ready = true;
      return result;
    } catch (error) {
      if (this.routes.get(instanceId) === route) this.routes.delete(instanceId);
      shard.instances.delete(instanceId); throw error;
    }
  }
  private route(instanceId: string) {
    const route = this.routes.get(instanceId);
    if (!route?.ready || this.closed || route.shard.failed) throw new Error('Instance unavailable');
    return route;
  }
  private call<T>(instanceId: string, operation: Omit<Extract<WorkerOperation, {instanceId: string}>, 'instanceId' | 'ownerEpoch'> | Record<string, unknown>): Promise<T> {
    const route = this.route(instanceId);
    return this.send(route.shard, {...operation, instanceId, ownerEpoch: route.epoch} as WorkerOperation) as Promise<T>;
  }
  private send(shard: Shard, operation: WorkerOperation): Promise<unknown> {
    if (this.closed || shard.failed || shard.pending.size >= this.options.maxPendingPerWorker) return Promise.reject(new Error('Simulation mailbox full or unavailable'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const resource = new AsyncResource('SimulationRequest');
      const timer = setTimeout(() => {
        // An uncertain mutation must not continue unnoticed after an RPC timeout.
        this.fail(shard, new Error('Simulation request timed out; shard fenced'));
        void shard.worker.terminate();
      }, this.options.requestTimeoutMs);
      shard.pending.set(id, {resolve, reject, timer, resource});
      try { shard.worker.postMessage({id, operation}); }
      catch (error) {
        shard.pending.delete(id); clearTimeout(timer); resource.emitDestroy(); reject(error);
      }
    });
  }
  private fail(shard: Shard, error: Error) {
    if (shard.failed) return;
    shard.failed = true; shard.failure = error.message;
    for (const pending of shard.pending.values()) {
      clearTimeout(pending.timer); pending.resource.runInAsyncScope(pending.reject, undefined, error); pending.resource.emitDestroy();
    }
    shard.pending.clear();
  }
}
