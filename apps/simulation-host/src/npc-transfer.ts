import {syncNpcWorld} from '../../../packages/game-domain/src/rules/npc-world.js';
import {combatMembers} from '../../../packages/game-domain/src/rules/combat-members.js';
import {ResidentInstance,type InstanceCheckpoint} from './instance.ts';
import {awayNpc,type GuestNpc} from '../../../packages/game-domain/src/npc-residency.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';

/** Extract standby NPCs while their human keeps the complete personal runtime,
 * including travel/activity and pending scene events. No human teleport or DB
 * profile reload is used to manufacture the joining units. */
export function detachStandbyNpcs(source:InstanceCheckpoint,ids:string[],destination:{instanceId:string;ownerEpoch:number}):{checkpoint:InstanceCheckpoint;guests:GuestNpc[]}{
 ResidentInstance.restore(source,source.ownerEpoch);
 if(!ids.length||new Set(ids).size!==ids.length||source.instanceId===destination.instanceId)throw new Error('Invalid NPC transfer');
 if(source.inputSequence!==source.appliedInputSequence||source.recentInputs.some(r=>r.receipt.status==='queued'))throw new Error('Apply inputs before NPC transfer');
 const checkpoint=structuredClone(source),state=checkpoint.state,humans=[state,...state.party].filter(a=>!a.npcPlayer),guests:GuestNpc[]=[];
 syncNpcWorld(state);
 for(const id of ids){
  const active=state.party.find((a:Rules)=>a.id===id);
  if(active){
   if(state.combat||state.dungeon||state.goldRaid?.active||active.cast||state.activity.caster===id||state.activity.targets?.includes(id))
    throw new Error('NPC must finish its active party before transfer');
   const entities=new Set(combatMembers(state).filter((u:Rules)=>u.id===id||u.ownerId===id).map((u:Rules)=>u.id));
   const refers=(value:unknown):boolean=>typeof value==='string'?entities.has(value):!!value&&typeof value==='object'&&Object.values(value).some(refers);
   if(refers(state.simulationEvents))throw new Error('请等待 NPC 的持续技能结束后再进入');
  }
  const owner=humans.find(a=>a.npcWorld?.residents.some((p:Rules)=>p.id===id));
  const hosted=(state.npcGuests??[]).find((g:GuestNpc)=>g.profile.id===id);
  if(!!owner===!!hosted)throw new Error('NPC runtime identity missing or duplicated');
  if(owner){
   const world=owner.npcWorld,profile=world.residents.find((p:Rules)=>p.id===id)!;
   if(active)profile.unit=structuredClone(active);
   guests.push({ownerCharacterId:owner.id,ownerRaceId:owner.raceId,profile});
   world.residents=world.residents.filter((p:Rules)=>p.id!==id);
   world.away=[...(world.away??[]),awayNpc(profile)];
   world.selection=world.selection.filter((selected:string)=>selected!==id);
   world.board.ids=world.board.ids.filter((selected:string)=>selected!==id);
  }else{
   if(active)hosted.profile.unit=structuredClone(active);
   guests.push(hosted);state.npcGuests=state.npcGuests.filter((g:GuestNpc)=>g.profile.id!==id);
  }
  if(active)state.party=state.party.filter((a:Rules)=>a.id!==id);
 }
 if(!state.npcGuests?.length)delete state.npcGuests;
 Object.assign(checkpoint,destination);
 checkpoint.controllers=checkpoint.controllers.map(c=>({...c,generation:c.generation+1}));
 for(const row of checkpoint.recentInputs){row.input.instanceId=destination.instanceId;row.input.controllerGeneration=checkpoint.controllers.find(c=>c.actorId===row.input.actorId)!.generation;}
 return {checkpoint:ResidentInstance.restore(checkpoint,destination.ownerEpoch).checkpoint(),guests};
}
