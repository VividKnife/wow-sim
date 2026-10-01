import type {Rules} from './model.ts';

/** The social roster can contain humans still travelling outside the room.
 * Only occupants appear in state.party and execute combat or receive loot. */
export type DungeonRoster={groupId:string;dungeonId:string;leaderId:string;members:{id:string;npc:boolean}[]};
export function validateDungeonRoster(roster:DungeonRoster):void{
  const id=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=200;
  if(!roster||!id(roster.groupId)||!id(roster.dungeonId)||!id(roster.leaderId)||!Array.isArray(roster.members)||roster.members.length!==5||
    new Set(roster.members.map(m=>m?.id)).size!==5||roster.members.some(m=>!m||!id(m.id)||typeof m.npc!=='boolean')||
    !roster.members.some(m=>m.id===roster.leaderId&&!m.npc))throw new Error('Invalid dungeon roster');
}
export function validateDungeonOccupants(state:Rules):void{
  const roster=state.dungeonRoster as DungeonRoster;validateDungeonRoster(roster);
  const actors=[state,...state.party];
  if(actors.length>5||new Set(actors.map(a=>a.id)).size!==actors.length||state.npcPlayer||
    actors.some(a=>!roster.members.some(m=>m.id===a.id&&m.npc===(a.npcPlayer===true)))||
    state.sharedParty?.leaderId!==roster.leaderId||
    state.dungeon&&state.dungeon.id!==roster.dungeonId)throw new Error('Dungeon occupants do not match roster');
  const humanIds=actors.filter(a=>!a.npcPlayer).map(a=>a.id),participants=state.sharedParty?.participantIds;
  if(!Array.isArray(participants)||participants.length!==humanIds.length||new Set(participants).size!==participants.length||
    participants.some(id=>!humanIds.includes(id)))throw new Error('Dungeon participant presence mismatch');
  const leaderPresent=humanIds.includes(roster.leaderId),npcCount=actors.filter(a=>a.npcPlayer).length;
  const present=state.dungeonPresentNpcIds;
  if(present!==undefined){
    if(!Array.isArray(present)||new Set(present).size!==present.length||present.some(id=>!roster.members.some(m=>m.npc&&m.id===id))||
      present.length!==npcCount||actors.some(a=>a.npcPlayer&&!present.includes(a.id)))throw new Error('Dungeon NPC presence mismatch');
  }else if(npcCount!==(leaderPresent?roster.members.filter(m=>m.npc).length:0))
    throw new Error('Dungeon NPCs must enter together with the party leader');
}
