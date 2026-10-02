import {type NpcArrival} from './npc-residency.ts';
import {mergeRoomEffects,suspendNpcEffects,resumeNpcEffects} from './room-effects.ts';
import type {Rules} from './model.ts';
import {rebaseSimulation} from './simulation-clock.ts';
import {combatMembers} from './rules/combat-members.js';
import {advanceSimulationEvents, simulationEventRuntime} from './rules/simulation-events.js';
import {isDeepStrictEqual} from 'node:util';
import {validateDungeonRoster,validateDungeonOccupants,type DungeonRoster} from './dungeon-roster.ts';
import {syncNpcWorld} from './rules/npc-world.js';

/** Boundary composition only. Live owners must already be quiesced and saved.
 * The caller supplies the agreed party, never a client-authored character. */
export function composeRoomBoundary(sources: readonly Rules[], primaryActorId: string, roster: DungeonRoster, selectMatchedNpcs=false,npcArrivals:readonly NpcArrival[]=[]): Rules {
  validateDungeonRoster(roster);
  if (sources.length < 1 || sources.length > 5 || new Set(sources.map(s => s.id)).size !== sources.length)
    throw new Error('Invalid source party');
  const ordered = [...sources].sort((a,b) => a.id === primaryActorId ? -1 : b.id === primaryActorId ? 1 : a.id<b.id?-1:1);
  if (ordered[0].id !== primaryActorId) throw new Error('Primary actor missing');
  const wallAt = ordered[0].wallAt;
  for (const source of ordered) {
    const existing=source===ordered[0]&&!!source.dungeon;
    if(existing){
      validateDungeonOccupants(source);
      if(source.dungeon.id!==roster.dungeonId||!isDeepStrictEqual(source.dungeonRoster,roster))throw new Error('Existing dungeon roster changed');
    }
    if (source.wallAt !== wallAt) throw new Error('Party sources require a common saved wall boundary');
    if (source.combat || source.dungeon&&!existing || source.goldRaid?.active || source.arena&&source.arena.phase!=='finished' || source.battleground&&source.battleground.phase!=='finished' ||
      source.escort || source.activity?.type !== 'idle' || source.groupLoot?.pending?.length ||
      !existing&&source.party.some((c: Rules) => !c.npcPlayer) || [source,...source.party].some((c: Rules) => c.hp <= 0 || c.cast))
      throw new Error('Party source is not ready to enter');
    if (source.groundEffects?.length) throw new Error('Scene-bound ground effects must finish before transfer');
  }
  if (!selectMatchedNpcs&&ordered.reduce((n,s) => n + 1 + s.party.length,0) > 5) throw new Error('Dungeon has more than five occupants');
  const ids = new Set<string>();
  for (const source of ordered) for (const actor of combatMembers(source)) {
    if (typeof actor.id !== 'string' || !actor.id || ids.has(actor.id)) throw new Error('Duplicate party entity');
    ids.add(actor.id);
  }
  // Rebase remaining deadlines, not creation dates, wallet values or item IDs.
  for(const arrival of npcArrivals)if(arrival.wallAt!==wallAt)throw new Error('NPC sources require a common saved wall boundary');
  const clock = Math.max(...ordered.map(s => s.clock),...npcArrivals.map(s=>s.clock));
  const rooms = ordered.map(s => rebaseSimulation(structuredClone(s),clock));
  const destination = rooms[0];
  const arrivals=npcArrivals.map(arrival=>rebaseSimulation(structuredClone(arrival),clock) as NpcArrival);
  for(const room of rooms)advanceSimulationEvents(room,60);
  let storage=mergeRoomEffects([
    ...rooms.map(room=>({storage:room.simulationEvents,units:combatMembers(room)})),
    ...arrivals.map(arrival=>({storage:arrival.simulationEvents,units:arrival.guests.flatMap(g=>combatMembers(g.profile.unit))}))
  ],clock);
  const guests=[...rooms.flatMap(room=>room.npcGuests??[]),...arrivals.flatMap(a=>a.guests)];
  for(const room of rooms)delete room.npcGuests;
  // Persistent profiles are snapshots, not aliases to live units: JSON restore
  // must have the same object ownership as the newly composed runtime.
  let members=[...rooms.flatMap(room=>[room,...room.party]),...arrivals.flatMap(a=>a.guests.map(g=>structuredClone(g.profile.unit)))];
  if(guests.length)destination.npcGuests=guests;
  if(selectMatchedNpcs){
    // Bench only at this saved idle boundary. Preserve permanent equipment and
    // growth before choosing the matched cohort; existing active units retain
    // their live effects and timer bindings.
    for(const room of rooms)if(!room.dungeon)syncNpcWorld(room);
    const humans=members.filter(actor=>!actor.npcPlayer),leaderPresent=humans.some(actor=>actor.id===roster.leaderId);
    const selected=(leaderPresent||destination.dungeonPresentNpcIds)?roster.members.filter(m=>m.npc).flatMap(member=>{
      const live=members.find(actor=>actor.id===member.id&&actor.npcPlayer);
      if(live)return [live];
      const profiles=[...humans.flatMap(actor=>(actor.npcWorld?.residents??[]).filter((p:Rules)=>p.id===member.id)),...(destination.npcGuests??[]).filter((g:Rules)=>g.profile.id===member.id).map((g:Rules)=>g.profile)];
      if(!profiles.length&&destination.dungeonPresentNpcIds)return [];
      if(profiles.length!==1)throw new Error('匹配 NPC 尚未完成实例归属交接，请稍后进入');
      const resumed=resumeNpcEffects(profiles[0],clock);
      if(resumed)storage=mergeRoomEffects([{storage,units:members.flatMap(a=>combatMembers({...a,party:[]}))},{storage:resumed,units:combatMembers(profiles[0].unit)}],clock);
      return [structuredClone(profiles[0].unit)];
    }):[];
    for(const npc of members.filter(a=>a.npcPlayer&&!selected.some(chosen=>chosen.id===a.id))){
      const profile=[...humans.flatMap(a=>a.npcWorld?.residents??[]),...(destination.npcGuests??[]).map((g:Rules)=>g.profile)].find(p=>p.id===npc.id);
      if(!profile)throw new Error('NPC standby identity missing');
      suspendNpcEffects(profile,npc,storage,clock);
    }
    members=[...humans,...selected];
    for(const actor of humans)if(actor.npcWorld)actor.npcWorld.selection=selected.filter(npc=>actor.npcWorld.residents.some((p:Rules)=>p.id===npc.id)).map(npc=>npc.id);
  }
  for (const room of rooms.slice(1)) {room.party=[];delete room.simulationEvents;}
  destination.party=members.filter(actor=>actor!==destination);
  destination.dungeonRoster=structuredClone(roster);
  if(destination.dungeonPresentNpcIds)destination.dungeonPresentNpcIds=members.filter(actor=>actor.npcPlayer).map(actor=>actor.id);
  destination.sharedParty={leaderId:roster.leaderId,participantIds:members.filter(actor=>!actor.npcPlayer).map(actor=>actor.id)};
  destination.simulationEvents=storage;
  validateDungeonOccupants(destination);
  // Joining establishes one room cadence. Absolute aura deadlines are retained;
  // subsequent pulses use this room's existing 100ms quantization.
  simulationEventRuntime(destination);
  return destination;
}
