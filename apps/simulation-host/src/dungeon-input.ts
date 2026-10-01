import type {SimulationInput,InputReceipt} from '../../../packages/protocol/src/simulation.ts';
import {validateDungeonInput} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import type {InstanceCheckpoint} from './instance.ts';

/** Acceptance is part of the sealed-source transfer, not an action applied to
 * the old room. Failed transactions leave its input cursor unchanged. */
export function recordDungeonInput(source:InstanceCheckpoint,target:InstanceCheckpoint,accountId:string,input:SimulationInput):InputReceipt{
 validateDungeonInput(input);
 const controller=source.controllers.find(c=>c.actorId===input.actorId&&c.accountId===accountId);
 if(input.instanceId!==source.instanceId||controller?.generation!==input.controllerGeneration)throw new Error('Controller fenced');
 if(input.clientSequence<=(source.cursors.find(([id])=>id===input.actorId)?.[1]??0))throw new Error('Stale client sequence');
 if(source.recentInputs.some(row=>row.accountId===accountId&&row.input.requestId===input.requestId))throw new Error('Request ID reused');
 const next=target.inputSequence+1;
 if(!Number.isSafeInteger(next))throw new Error('Input sequence exhausted');
 const destination=target.controllers.find(c=>c.actorId===input.actorId)!;
 const receipt:InputReceipt={requestId:input.requestId,inputSequence:next,effectiveWallAt:target.state.wallAt,simTime:target.state.clock,status:'applied'};
 target.inputSequence=next;target.appliedInputSequence=next;
 target.cursors=target.cursors.filter(([id])=>id!==input.actorId);target.cursors.push([input.actorId,input.clientSequence]);
 target.recentInputs.push({accountId,input:{...structuredClone(input),instanceId:target.instanceId,controllerGeneration:destination.generation},receipt});
 target.recentInputs=target.recentInputs.slice(-256);
 return receipt;
}
