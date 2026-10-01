import {parentPort} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {MinHeap} from '../../../packages/combat-core/scheduling/min-heap.ts';
import {ResidentInstance} from './instance.ts';
import {integer} from '../../../packages/combat-core/scheduling/event-queue.ts';
import {validateSimulationInput} from '../../../packages/protocol/src/simulation.ts';
import type {WorkerRequest, WorkerResponse} from './messages.ts';

if (!parentPort) throw new Error('Simulation worker requires a parent port');
const port = parentPort;
type Resident = {runtime: ResidentInstance; origin: number; wallAnchor: number; expiresAt: number; realtime: boolean; quiesced?: boolean; fault?: string};
type Wake = {at: number; instanceId: string};
const residents = new Map<string, Resident>();
const wakes = new MinHeap<Wake>((a, b) => a.at - b.at || a.instanceId.localeCompare(b.instanceId), [], false, wake => wake.instanceId);
let timer: NodeJS.Timeout | undefined;
function lease(value: number) { integer(value, 'leaseMs', 1); if (value > 60_000) throw new Error('Lease too long'); return value; }
function get(instanceId: string, epoch: number) {
  const resident = residents.get(instanceId);
  if (!resident || resident.runtime.ownerEpoch !== epoch || performance.now() >= resident.expiresAt) throw new Error('Owner fenced');
  if (resident.fault) throw new Error(resident.fault);
  return resident;
}
function schedule(instanceId: string, resident: Resident, incomplete = false) {
  // One indexed entry per resident: inputs/presence can move a wake in either
  // direction without accumulating stale timers or scanning other rooms.
  wakes.remove(instanceId);
  if (!resident.realtime || resident.quiesced || resident.fault || performance.now() >= resident.expiresAt) return;
  const deadline = resident.runtime.nextWakeWallAt;
  if (incomplete || Number.isFinite(deadline)) {
    const at = incomplete ? performance.now() : resident.origin + deadline - resident.wallAnchor;
    wakes.push({instanceId, at});
  }
}
function wallTime(resident: Resident) { return Math.floor(resident.wallAnchor + performance.now() - resident.origin); }
function presence(resident: Resident, accountId: string, actorId: string, generation?: number) {
  resident.runtime.recordPresence(accountId, actorId, wallTime(resident), generation);
  schedule(resident.runtime.instanceId, resident);
}
function arm() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const next = wakes.peek();
  if (next) timer = setTimeout(tick, Math.min(2_147_483_647, Math.max(0, Math.ceil(next.at - performance.now()))));
}
function tick() {
  const started = performance.now();
  // Both per-instance rule work and the shard turn are bounded. Late timers
  // retain their original wall/simulation mapping, never shift periodic rules.
  while (wakes.size && wakes.peek()!.at <= performance.now() && performance.now() - started < 5) {
    const wake = wakes.pop()!, resident = residents.get(wake.instanceId);
    if (!resident) continue;
    if (resident.quiesced || resident.fault || performance.now() >= resident.expiresAt) continue;
    try {
      const target = Math.max(resident.runtime.wallAt, wallTime(resident));
      const result = resident.runtime.advance(target, 10);
      schedule(wake.instanceId, resident, !result.complete);
    } catch (error) { resident.fault = (error as Error).message; }
  }
  arm();
}
port.on('message', ({id, operation: op}: WorkerRequest) => {
  let response: WorkerResponse;
  try {
    let result: unknown;
    if (op.kind === 'admit' || op.kind === 'restore') {
      const duration = lease(op.leaseMs);
      const instanceId = op.kind === 'admit' ? op.admission.instanceId : op.checkpoint.instanceId;
      if (residents.has(instanceId)) throw new Error('Instance already resident');
      const runtime = op.kind === 'admit' ? new ResidentInstance(op.admission) : ResidentInstance.restore(op.checkpoint, op.ownerEpoch);
      const origin = performance.now();
      const resident = {runtime, origin, wallAnchor: runtime.hasPresencePolicy ? Math.max(runtime.wallAt, Date.now()) : runtime.wallAt, expiresAt: origin + duration, realtime: op.realtime};
      residents.set(instanceId, resident);
      schedule(instanceId, resident);
      result = {instanceId, ownerEpoch: runtime.ownerEpoch};
    } else {
      // Removal must also work for quarantined/expired instances, but an old
      // epoch may never remove a replacement owner.
      const resident = op.kind === 'remove' ? residents.get(op.instanceId) : get(op.instanceId, op.ownerEpoch);
      if (!resident || resident.runtime.ownerEpoch !== op.ownerEpoch) throw new Error('Owner fenced');
      const runtime = resident.runtime;
      if (resident.quiesced && ['advance','input','project','presentation'].includes(op.kind))
        throw new Error('Instance quiesced for transfer');
      if (resident.realtime && op.kind === 'input') {
        validateSimulationInput(op.input);
        if (op.input.instanceId !== op.instanceId) throw new Error('Invalid input identity');
        presence(resident, op.accountId, op.input.actorId, op.input.controllerGeneration);
      } else if (resident.realtime && op.kind === 'presentation' && op.online) {
        presence(resident, op.accountId, op.actorId);
      }
      switch (op.kind) {
        case 'advance':
          if (resident.realtime) throw new Error('Explicit advancement requires offline mode');
          result = runtime.advance(op.until, op.maxTicks); break;
        case 'input': {
          const target = resident.realtime ? Math.max(runtime.wallAt, wallTime(resident)) : runtime.wallAt;
          // One bounded catch-up slice retains the immediate path for ordinary
          // online commands. Backlogs return a durable queued receipt instead
          // of occupying an RPC/IO mailbox until historical combat completes.
          const incomplete = resident.realtime && !runtime.advance(target, 10).complete;
          result = runtime.input(op.accountId, op.input, target);
          schedule(op.instanceId, resident, incomplete); break;
        }
        case 'quiesce':
          resident.quiesced = true; wakes.remove(op.instanceId); result = runtime.checkpoint(); break;
        case 'alignQuiesced':
          if (!resident.quiesced) throw new Error('Alignment requires a quiesced instance');
          integer(op.until,'transfer wall boundary',runtime.wallAt);
          if (resident.realtime && op.until>Math.max(runtime.wallAt,wallTime(resident))) throw new Error('Transfer boundary is in the future');
          // Use the same bounded rule slices as ordinary execution. Never
          // assign wallAt directly or skip queued inputs to align two rooms.
          result={...runtime.advance(op.until,10),pendingInputs:runtime.pendingInputCount};break;
        case 'resumeExecution':
          resident.quiesced = false; schedule(op.instanceId, resident); result = true; break;
        case 'confirmCheckpoint': runtime.confirmCheckpoint(op.accepted,op.applied); result=true; break;
        case 'checkpoint': result = runtime.checkpoint(); break;
        case 'project':
          result = runtime.project(op.serverTime, op.full, resident.realtime ? wallTime(resident) : undefined);
          schedule(op.instanceId, resident); break;
        case 'presentation':
          result = runtime.presentation(op.accountId, op.actorId, op.scope, resident.realtime ? wallTime(resident) : undefined);
          schedule(op.instanceId, resident); break;
        case 'renew':
          resident.expiresAt = performance.now() + lease(op.leaseMs);
          schedule(op.instanceId, resident); result = true; break;
        case 'remove':
          residents.delete(op.instanceId);
          wakes.remove(op.instanceId); result = true; break;
      }
    }
    response = {id, ok: true, result};
  } catch (error) { response = {id, ok: false, error: (error as Error).message}; }
  arm();
  port.postMessage(response);
});

// Module/data initialization and the command handler are installed.
port.postMessage({id:0,ok:true,result:true} satisfies WorkerResponse);
