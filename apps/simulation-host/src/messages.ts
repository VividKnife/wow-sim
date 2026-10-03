import type {Admission, InstanceCheckpoint} from './instance.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';

export type WorkerOperation =
  | {kind:'contentPhase';instanceId:string;ownerEpoch:number;phase:number}
  | {kind: 'admit'; admission: Admission; leaseMs: number; realtime: boolean}
  | {kind: 'restore'; checkpoint: InstanceCheckpoint; ownerEpoch: number; leaseMs: number; realtime: boolean}
  | {kind: 'advance'; instanceId: string; ownerEpoch: number; until: number; maxTicks: number}
  | {kind: 'alignQuiesced'; instanceId: string; ownerEpoch: number; until: number}
  | {kind: 'input'; instanceId: string; ownerEpoch: number; accountId: string; input: SimulationInput}
  | {kind: 'project'; instanceId: string; ownerEpoch: number; full: boolean; serverTime: number}
  | {kind: 'presentation'; instanceId: string; ownerEpoch: number; accountId:string; actorId:string; scope:'full'|'combat'; online:boolean}
  | {kind: 'checkpoint' | 'remove' | 'quiesce' | 'resumeExecution'; instanceId: string; ownerEpoch: number}
  | {kind: 'confirmCheckpoint'; instanceId:string; ownerEpoch:number; accepted:number; applied:number}
  | {kind: 'renew'; instanceId: string; ownerEpoch: number; leaseMs: number};
export type WorkerRequest = {id: number; operation: WorkerOperation};
export type WorkerResponse = {id: number; ok: true; result: unknown} | {id: number; ok: false; error: string};
