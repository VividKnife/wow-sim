import {loadNpcResident,type NpcCharacter} from '../../../packages/game-domain/src/npc-characters.ts';
import {simulationEventRuntime} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {residentNpcProfiles,type NpcArrival} from '../../../packages/game-domain/src/npc-residency.ts';
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
  .update(JSON.stringify([request.groupId,request.entryId,request.actorId,request.visitId??null])).digest('hex');

/** Pure runtime composition and ordinary domain writes within the repository's
 * existing transfer transaction. No Worker calls or additional transaction. */
export function dungeonTransferBoundary(request:DungeonEntryRequest,now:()=>number=Date.now,input?:SimulationInput):TransferBoundary<InstanceCheckpoint>{
  return async(tx,{transferId,destinations,sources})=>{
    if(input&&(input.command.kind!=='action'||input.command.action.type!=='enterDungeon'))throw new Error('Invalid arrival command');
    const [destination]=destinations;
    const group=await authorizeDungeonEntry(tx,request);
    if(transferId!==dungeonEntryTransferId(request))throw new Error('Transfer does not match dungeon entry consent');
    const existing=group.instanceId?sources.find(s=>s.owner.id===group.instanceId):undefined;
    if(group.instanceId&&!existing)throw new Error('Existing dungeon must participate in arrival transfer');
    if(!sources.some(s=>s!==existing&&s.checkpoint.state.id===request.actorId))throw new Error('Requesting human must be a new arrival');
    // Direct multi-human compositions remain useful at the sealed boundary;
    // public input admits only its own human. Other sources lend NPCs and retain
    // every human, activity and event in a separate successor instance.
    const joining=sources;
    if(destinations.length!==1)throw new Error('Dungeon arrival destination coverage mismatch');
    const npcArrivals:NpcArrival[]=[],retained:InstanceCheckpoint[]=[],arrivals=joining.map(s=>structuredClone(s.checkpoint));
    if(arrivals.some(cp=>cp.state.id===group.leaderId)){
      const present=new Set(arrivals.flatMap(cp=>residentNpcProfiles(cp.state).map(p=>p.profile.id)));
      const state=arrivals[0].state,guests=[];
      for(const member of group.members.filter(m=>m.npc&&!present.has(m.id))){
        const row=await tx.get<NpcCharacter>('npc_characters',member.id);
        if(!row||await tx.get('simulation_characters',member.id))throw new Error('NPC 已被其他活动占用');
        const profile=await loadNpcResident(tx,row);profile.unit.time=state.clock;profile.unit.location=state.location;
        guests.push({profile});
      }
      if(guests.length){const empty:any={clock:state.clock};simulationEventRuntime(empty);npcArrivals.push({clock:state.clock,wallAt:state.wallAt,nextTick:state.nextTick,guests,simulationEvents:empty.simulationEvents});}
    }
    const checkpoint=composeDungeonCheckpoint(arrivals,{
      instanceId:destination.id,ownerEpoch:destination.epoch,primaryActorId:existing?.checkpoint.state.id??request.actorId,selectMatchedNpcs:true,
      parked:group.entry!.parked,npcArrivals,
      roster:{groupId:group.id,leaderId:group.leaderId,dungeonId:group.entry!.dungeonId,members:group.members.map(m=>({id:m.id,npc:m.npc}))}});
    if(input){
      const source=sources.find(s=>s.checkpoint.state.id===input.actorId);
      if(!source)throw new Error('Arrival input source missing');
      const receipt=recordDungeonInput(source.checkpoint,checkpoint,request.accountId,input);
      await requestDungeonEntry(tx,request);
      await saveDungeonInput(tx,request.accountId,input,receipt);
    }
    await bindDungeonEntry(tx,request,checkpoint,now(),group.instanceId??null);
    const checkpoints=[checkpoint,...retained];
    const residencies:Residency[]=checkpoints.map(cp=>{
      const {state,controllers,presence,instanceId}=cp;
      const admission:CharacterAdmission={instanceId,state,controllers,presence:presence!};
      return {id:instanceId,characterId:state.id,accountId:controllers.find(c=>c.actorId===state.id)!.accountId,...runtimeVersion,
        participants:controllers.map(c=>({characterId:c.actorId,accountId:c.accountId})),encodedAdmission:JSON.stringify(admission)};
    });
    await transferResidentClaims(tx,transferId,sources.map(source=>source.owner),residencies);
    return checkpoints;
  };
}
