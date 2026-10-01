import type {Rules} from './model.ts';
import {rebaseSimulation} from './simulation-clock.ts';
import {combatMembers} from './rules/combat-members.js';
import {advanceSimulationEvents, simulationEventRuntime} from './rules/simulation-events.js';
import {EventQueue} from '../../combat-core/scheduling/event-queue.ts';
import {isDeepStrictEqual} from 'node:util';
import {validateDungeonRoster,validateDungeonOccupants,type DungeonRoster} from './dungeon-roster.ts';
import {syncNpcWorld} from './rules/npc-world.js';

/** Boundary composition only. Live owners must already be quiesced and saved.
 * The caller supplies the agreed party, never a client-authored character. */
export function composeRoomBoundary(sources: readonly Rules[], primaryActorId: string, roster: DungeonRoster, selectMatchedNpcs=false): Rules {
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
  const clock = Math.max(...ordered.map(s => s.clock));
  const rooms = ordered.map(s => rebaseSimulation(structuredClone(s),clock));
  const destination = rooms[0], merged: Rules = new EventQueue().ownedState();
  // Every source finishes readiness dispatch at this same phase. This does not
  // apply damage/healing, consume RNG, or execute a queued player intention.
  merged.nowMs=clock; merged.phase=60;
  const storage: Rules = {queue:merged,ready:{friendly:[],enemy:[]},readySweepAt:-1};
  const groups = [['periodics','periodicSequence','periodicEventId'],['enemyAuras','enemyAuraSequence','enemyAuraEventId']] as const;
  for (const [table,sequence] of groups) { storage[table]={}; storage[sequence]=0; }
  for (const [table,sequence] of [['casts','castSequence'],['resources','resourceSequence'],['attacks','attackSequence'],['dots','dotSequence'],['grounds','groundSequence']]) {
    storage[table]={}; storage[sequence]=0;
  }
  for (const room of rooms) {
    advanceSimulationEvents(room,60);
    const original=room.simulationEvents;
    if (['casts','resources','attacks','dots','grounds'].some(key=>Object.keys(original[key]).length) ||
      original.ready.friendly.length || original.ready.enemy.length)
      throw new Error('Non-portable events remain in source room');
    // Combat teardown retires these timers but leaves unit-side IDs behind.
    // They must not accidentally bind to another actor's new room timer.
    for (const actor of combatMembers(room)) {delete actor.attackEventIds;delete actor.powerEventId;}
    const eventOffset=storage.queue.nextSequence;
    for (const [table,sequence,binding] of groups) {
      const offset=storage[sequence];
      if (!Number.isSafeInteger(offset+original[sequence])) throw new Error('Effect sequence exhausted');
      for (const timer of Object.values(original[table]) as Rules[]) {
        const next={...timer,id:timer.id+offset,eventSequence:timer.eventSequence===null?null:timer.eventSequence+eventOffset};
        storage[table][next.id]=next;
      }
      // Touch only live effect bindings. Private history and inactive NPC
      // records have their own identity space and must not be rewritten.
      for (const actor of combatMembers(room)) for (const effect of table==='periodics'?[...(actor.hots||[]),...(actor.periodicClass||[])]:actor.auras||[]) {
        if (effect[binding]!==undefined) effect[binding]+=offset;
      }
      for (const event of original.queue.events) if (event.kind==='AuraPeriodic' && event.phase===(table==='periodics'?35:33))
        storage.queue.events.push({...event,subjectId:event.subjectId+offset,sequence:event.sequence+eventOffset});
      storage[sequence]+=original[sequence];
    }
    if (original.queue.events.some((e: Rules)=>e.kind!=='AuraPeriodic'||![33,35].includes(e.phase)))
      throw new Error('Non-portable event kind');
    storage.queue.nextSequence+=original.queue.nextSequence;
    if (!Number.isSafeInteger(storage.queue.nextSequence)) throw new Error('Event sequence exhausted');
  }
  let members=rooms.flatMap(room=>[room,...room.party]);
  if(selectMatchedNpcs){
    // Bench only at this saved idle boundary. Preserve permanent equipment and
    // growth before choosing the matched cohort; existing active units retain
    // their live effects and timer bindings.
    for(const room of rooms)if(!room.dungeon)syncNpcWorld(room);
    const humans=members.filter(actor=>!actor.npcPlayer),leaderPresent=humans.some(actor=>actor.id===roster.leaderId);
    const selected=leaderPresent?roster.members.filter(m=>m.npc).map(member=>{
      const live=members.find(actor=>actor.id===member.id&&actor.npcPlayer);
      if(live)return live;
      const profiles=humans.flatMap(actor=>(actor.npcWorld?.residents??[]).filter((p:Rules)=>p.id===member.id));
      if(profiles.length!==1)throw new Error('匹配 NPC 尚未完成实例归属交接，请稍后进入');
      return structuredClone(profiles[0].unit);
    }):[];
    members=[...humans,...selected];
    for(const actor of humans)if(actor.npcWorld)actor.npcWorld.selection=selected.filter(npc=>actor.npcWorld.residents.some((p:Rules)=>p.id===npc.id)).map(npc=>npc.id);
  }
  for (const room of rooms.slice(1)) {room.party=[];delete room.simulationEvents;}
  destination.party=members.filter(actor=>actor!==destination);
  destination.dungeonRoster=structuredClone(roster);
  destination.sharedParty={leaderId:roster.leaderId,participantIds:members.filter(actor=>!actor.npcPlayer).map(actor=>actor.id)};
  destination.simulationEvents=storage;
  validateDungeonOccupants(destination);
  // Joining establishes one room cadence. Absolute aura deadlines are retained;
  // subsequent pulses use this room's existing 100ms quantization.
  simulationEventRuntime(destination);
  return destination;
}
