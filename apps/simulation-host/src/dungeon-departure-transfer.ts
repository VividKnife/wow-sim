import {createHash} from 'node:crypto';
import type {TransferBoundary} from '../../../packages/persistence/src/simulation.ts';
import {authorizeDungeonDeparture,type DungeonEntryRequest} from '../../../packages/game-domain/src/dungeon-entry.ts';
import {transferResidentClaims} from '../../../packages/game-domain/src/resident-store.ts';
import type {CharacterAdmission,Residency} from '../../../packages/game-domain/src/resident-characters.ts';
import {saveDungeonInput} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import type {InstanceCheckpoint} from './instance.ts';
import {splitDungeonCheckpoint} from './dungeon-departure.ts';
import {recordDungeonInput} from './dungeon-input.ts';
import {runtimeVersion} from './version.ts';

export const dungeonDepartureTransferId=(accountId:string,input:SimulationInput)=>'exit:'+createHash('sha256')
 .update(JSON.stringify([accountId,input.actorId,input.requestId])).digest('hex');

/** Keep the group binding, both actor claims and acknowledgement in the same
 * existing transfer transaction. An empty dungeon parks only encounter state;
 * human/NPC assets always remain in their resident character checkpoints. */
export function dungeonDepartureBoundary(request:DungeonEntryRequest,input:SimulationInput,now:()=>number=Date.now):TransferBoundary<InstanceCheckpoint>{
 return async(tx,{transferId,destinations,sources})=>{
  const group=await authorizeDungeonDeparture(tx,request);
  if(input.command.kind!=='action'||input.command.action.type!=='leaveDungeon'||input.actorId!==request.actorId||
    transferId!==dungeonDepartureTransferId(request.accountId,input)||sources.length!==1||sources[0].owner.id!==group.instanceId)
   throw new Error('Invalid dungeon departure');
  const source=sources[0].checkpoint;
  if(destinations.length!==(source.controllers.length>1?2:1))throw new Error('Invalid departure destinations');
  const checkpoints=splitDungeonCheckpoint(source,request.actorId,{instanceId:destinations[0].id,ownerEpoch:destinations[0].epoch},
   destinations[1]?{instanceId:destinations[1].id,ownerEpoch:destinations[1].epoch}:undefined);
  const receipt=recordDungeonInput(source,checkpoints[0],request.accountId,input);
  await saveDungeonInput(tx,request.accountId,input,receipt);
  group.entry!.requested=group.entry!.requested.filter(id=>id!==request.actorId);
  if(checkpoints[1])group.instanceId=checkpoints[1].instanceId;
  else{
   delete group.instanceId;
   group.entry!.parked={clock:source.state.clock,dungeon:{...structuredClone(source.state.dungeon),autoAdvance:false,advanceReason:''}};
  }
  group.updatedAt=now();await tx.put('social_groups',group);
  const residencies:Residency[]=checkpoints.map(checkpoint=>{
   const {state,controllers,presence,instanceId}=checkpoint;
   const admission:CharacterAdmission={instanceId,state,controllers,presence:presence!};
   return {id:instanceId,characterId:state.id,accountId:controllers.find(c=>c.actorId===state.id)!.accountId,...runtimeVersion,
    participants:controllers.map(c=>({characterId:c.actorId,accountId:c.accountId})),encodedAdmission:JSON.stringify(admission)};
  });
  await transferResidentClaims(tx,transferId,sources.map(s=>s.owner),residencies);
  return checkpoints;
 };
}
