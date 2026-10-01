import {ResidentInstance,type InstanceCheckpoint} from './instance.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {participantPresentationState} from '../../../packages/game-domain/src/resident-participants.ts';
import {combatMembers} from '../../../packages/game-domain/src/rules/combat-members.js';
import {advanceSimulationEvents,simulationEventRuntime} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {leaveDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {syncNpcWorld} from '../../../packages/game-domain/src/rules/npc-world.js';

type Destination={instanceId:string;ownerEpoch:number};
/** Split an idle, sealed room. Permanent NPC cohorts follow their owning human;
 * the social roster and remaining dungeon progress stay intact. No database or
 * random draws occur here. The transfer transaction installs the destinations. */
export function splitDungeonCheckpoint(source:InstanceCheckpoint,actorId:string,personal:Destination,remaining?:Destination):InstanceCheckpoint[]{
 ResidentInstance.restore(source,source.ownerEpoch);
 if(!source.state.dungeon||!source.state.dungeonRoster)throw new Error('Not a shared dungeon');
 if(source.inputSequence!==source.appliedInputSequence||source.recentInputs.some(row=>row.receipt.status==='queued'))throw new Error('Apply accepted inputs before leaving');
 if(!source.controllers.some(c=>c.actorId===actorId))throw new Error('Dungeon participant missing');
 if(!!remaining!==(source.controllers.length>1)||personal.instanceId===source.instanceId||remaining?.instanceId===source.instanceId||remaining?.instanceId===personal.instanceId)throw new Error('Invalid departure destinations');
 const room=structuredClone(source.state);
 if(room.combat||room.activity.type!=='idle'||[room,...room.party].some((a:Rules)=>a.cast)||room.groupLoot?.pending?.length)throw new Error('请先结束当前战斗、施法或战利品分配再离开副本');
 if(room.groundEffects?.length)throw new Error('请等待地面效果结束再离开副本');
 advanceSimulationEvents(room,60);
 const storage=room.simulationEvents;
 if(['casts','resources','attacks','dots','grounds'].some(key=>Object.keys(storage[key]).length)||storage.ready.friendly.length||storage.ready.enemy.length||
  storage.queue.events.some((event:Rules)=>event.kind!=='AuraPeriodic'||![33,35].includes(event.phase)))throw new Error('Non-portable events remain in dungeon');
 const members=[room,...room.party],humans=members.filter(a=>!a.npcPlayer);
 const ownerOf=new Map<string,string>();
 for(const human of humans)for(const npc of human.npcWorld?.residents??[]){if(ownerOf.has(npc.id))throw new Error('Duplicate NPC identity');ownerOf.set(npc.id,human.id);}
 for(const actor of members.filter(a=>a.npcPlayer))if(!ownerOf.has(actor.id))throw new Error('NPC owner missing');
 const leavingIds=new Set([actorId,...members.filter(a=>a.npcPlayer&&ownerOf.get(a.id)===actorId).map(a=>a.id)]);
 const outputs:InstanceCheckpoint[]=[];
 for(const destination of [personal,...(remaining?[remaining]:[])]){
  const outside=destination===personal;
  const selected=members.filter(a=>leavingIds.has(a.id)===outside);
  const primary=outside?selected.find(a=>a.id===actorId)!:selected.find(a=>a.id===room.id)||selected.find(a=>!a.npcPlayer)!;
  const presentation=participantPresentationState(room,primary.id);
  const state=structuredClone({...primary,party:selected.filter(a=>a!==primary).map(a=>({...a,party:a.npcPlayer?a.party:[]})),
   clock:room.clock,wallAt:room.wallAt,nextTick:room.nextTick,nextRegen:room.nextRegen,location:room.location,
   activity:room.activity,dungeon:room.dungeon,lastCombat:room.lastCombat,groupLoot:room.groupLoot,groundEffects:room.groundEffects,
   logs:presentation.logs,logSequence:Math.max(room.logSequence,primary.logSequence),rngState:room.rngState,
   nextPull:room.nextPull,dungeonSequence:room.dungeonSequence,dungeonRoster:room.dungeonRoster,
   sharedParty:{leaderId:room.sharedParty.leaderId,participantIds:selected.filter(a=>!a.npcPlayer).map(a=>a.id)}});
  // Each retained human keeps only their own permanent cohort in npcWorld.
  for(const human of [state,...state.party].filter(a=>!a.npcPlayer)){
   const own=state.party.filter((a:Rules)=>a.npcPlayer&&ownerOf.get(a.id)===human.id);
   syncNpcWorld({...human,party:own,clock:room.clock,wallAt:room.wallAt});
  }
  state.dungeonPresentNpcIds=selected.filter(a=>a.npcPlayer).map(a=>a.id);
  if(outside){
   leaveDungeon(state);
   // The shared run stays in the remaining room or is parked on the group
   // by the transfer transaction. Never duplicate it into a personal save.
   delete state.dungeonSaves[room.dungeon.id];
   delete state.dungeonRoster;delete state.sharedParty;delete state.dungeonPresentNpcIds;
  }
  const ids=new Set(combatMembers(state,null).map((a:Rules)=>a.id)),events=structuredClone(storage);
  for(const table of ['periodics','enemyAuras'])events[table]=Object.fromEntries(Object.entries(events[table]).filter(([,timer])=>ids.has((timer as Rules).targetId)));
  events.queue.events=events.queue.events.filter((event:Rules)=>events[event.phase===35?'periodics':'enemyAuras'][event.subjectId]);
  state.simulationEvents=events;
  for(const actor of combatMembers(state,null)){delete actor.attackEventIds;delete actor.powerEventId;}
  simulationEventRuntime(state);
  const controllers=source.controllers.filter(c=>selected.some(a=>a.id===c.actorId)).map(c=>({...c,generation:c.generation+1,canPause:outside||c.canPause}));
  const accounts=new Set(controllers.map(c=>c.accountId)),actorIds=new Set(controllers.map(c=>c.actorId));
  const recentInputs=source.recentInputs.filter(row=>actorIds.has(row.input.actorId)).map(row=>({...structuredClone(row),input:{...structuredClone(row.input),instanceId:destination.instanceId,controllerGeneration:controllers.find(c=>c.actorId===row.input.actorId)!.generation}}));
  const sequence=recentInputs.at(-1)?.receipt.inputSequence??0;
  const checkpoint:InstanceCheckpoint={...source,...destination,state,controllers,
   presence:source.presence?{offlineLimitMs:source.presence.offlineLimitMs,accounts:source.presence.accounts.filter(([id])=>accounts.has(id))}:null,
   recentInputs,cursors:source.cursors.filter(([id])=>actorIds.has(id)),inputSequence:sequence,appliedInputSequence:sequence};
  outputs.push(ResidentInstance.restore(checkpoint,destination.ownerEpoch).checkpoint());
 }
 return outputs;
}
