import type {TransferBoundary} from '../../../packages/persistence/src/simulation.ts';
import {authorizeDungeonEntry,bindDungeonEntry,requestDungeonEntry,type DungeonEntryRequest} from '../../../packages/game-domain/src/dungeon-entry.ts';
import {transferResidentClaims} from '../../../packages/game-domain/src/resident-store.ts';
import type {CharacterAdmission,Residency} from '../../../packages/game-domain/src/resident-characters.ts';
import {composeDungeonCheckpoint} from './dungeon-composition.ts';
import type {InstanceCheckpoint} from './instance.ts';
import {runtimeVersion} from './version.ts';
import {createHash} from 'node:crypto';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import {saveDungeonInput} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {recordDungeonInput} from './dungeon-input.ts';

/** A matched run admits humans independently. Retries of one arrival use the
 * same durable identity; a different arrival must not reuse its receipt. */
export const dungeonEntryTransferId=(request:DungeonEntryRequest)=>'entry:'+createHash('sha256')
  .update(JSON.stringify([request.groupId,request.entryId,request.actorId])).digest('hex');

/** Pure runtime composition and ordinary domain writes within the repository's
 * existing transfer transaction. No Worker calls or additional transaction. */
export function dungeonTransferBoundary(request:DungeonEntryRequest,now:()=>number=Date.now,input?:SimulationInput):TransferBoundary<InstanceCheckpoint>{
  return async(tx,{transferId,destination,sources})=>{
    const group=await authorizeDungeonEntry(tx,request);
    if(transferId!==dungeonEntryTransferId(request))throw new Error('Transfer does not match dungeon entry consent');
    const existing=group.instanceId?sources.find(s=>s.owner.id===group.instanceId):undefined;
    if(group.instanceId&&!existing)throw new Error('Existing dungeon must participate in arrival transfer');
    if(!sources.some(s=>s!==existing&&s.checkpoint.state.id===request.actorId))throw new Error('Requesting human must be a new arrival');
    const checkpoint=composeDungeonCheckpoint(sources.map(source=>source.checkpoint),{
      instanceId:destination.id,ownerEpoch:destination.epoch,primaryActorId:existing?.checkpoint.state.id??request.actorId,selectMatchedNpcs:!!input,
      roster:{groupId:group.id,leaderId:group.leaderId,dungeonId:group.entry!.dungeonId,members:group.members.map(m=>({id:m.id,npc:m.npc}))}});
    if(input){
      const source=sources.find(s=>s.checkpoint.state.id===input.actorId);
      if(!source)throw new Error('Arrival input source missing');
      const receipt=recordDungeonInput(source.checkpoint,checkpoint,request.accountId,input);
      await requestDungeonEntry(tx,request);
      await saveDungeonInput(tx,request.accountId,input,receipt);
    }
    await bindDungeonEntry(tx,request,checkpoint,now(),group.instanceId??null);
    const {state,controllers,presence}=checkpoint;
    const admission:CharacterAdmission={instanceId:destination.id,state,controllers,presence:presence!};
    const residency:Residency={id:destination.id,characterId:state.id,accountId:controllers.find(c=>c.actorId===state.id)!.accountId,...runtimeVersion,
      participants:controllers.map(c=>({characterId:c.actorId,accountId:c.accountId})),encodedAdmission:JSON.stringify(admission)};
    await transferResidentClaims(tx,transferId,sources.map(source=>source.owner),residency);
    return checkpoint;
  };
}
