import type {Rules} from './model.ts';

/** NPC identity belongs to its original world; its mutable profile belongs to
 * exactly one resident instance. Outside owners retain only this small marker. */
export type AwayNpc={id:string;index:number;name:string;classId:number;level:number};
export type GuestNpc={ownerCharacterId:string;ownerRaceId:number;profile:Rules};
export type NpcArrival={clock:number;wallAt:number;nextTick:number;guests:GuestNpc[];simulationEvents:Rules};
export function awayNpc(profile:Rules):AwayNpc{
 return {id:profile.id,index:profile.index,name:profile.unit.name,classId:profile.unit.classId,level:profile.unit.level};
}
export function residentNpcProfiles(state:Rules):{ownerCharacterId:string;profile:Rules}[]{
 const humans=[state,...state.party].filter(a=>!a.npcPlayer);
 return [...humans.flatMap(a=>(a.npcWorld?.residents??[]).map((profile:Rules)=>({ownerCharacterId:a.id,profile}))),
  ...(state.npcGuests??[]).map((g:GuestNpc)=>({ownerCharacterId:g.ownerCharacterId,profile:g.profile}))];
}
/** Only when both sides already participate in a sealed composition. Replace
 * the owner's away marker with the actual profile, never a stale DB copy. */
export function reuniteNpcProfiles(state:Rules):void{
 const humans=[state,...state.party].filter(a=>!a.npcPlayer),retained:GuestNpc[]=[];
 for(const guest of state.npcGuests??[]){
  const owner=humans.find(a=>a.id===guest.ownerCharacterId);
  if(!owner){retained.push(guest);continue;}
  const world=owner.npcWorld;
  if(!world||world.residents.some((p:Rules)=>p.id===guest.profile.id)||!world.away?.some((p:AwayNpc)=>p.id===guest.profile.id))
   throw new Error('NPC reunion ownership mismatch');
  world.away=world.away.filter((p:AwayNpc)=>p.id!==guest.profile.id);
  world.residents.push(guest.profile);world.residents.sort((a:Rules,b:Rules)=>a.index-b.index);
 }
 if(retained.length)state.npcGuests=retained;else delete state.npcGuests;
}
