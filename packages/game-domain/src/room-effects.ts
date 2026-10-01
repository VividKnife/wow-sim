import {rebaseSimulation} from './simulation-clock.ts';
import {combatMembers} from './rules/combat-members.js';
import type {Rules} from './model.ts';
import {EventQueue} from '../../combat-core/scheduling/event-queue.ts';

/** Boundary-only merge. Rewrites bindings on detached live units, retaining
 * target ownership, remaining deadlines and stable within-source order. */
export function mergeRoomEffects(sources:{storage:Rules;units:Rules[]}[],clock:number):Rules{
  const merged:Rules=new EventQueue().ownedState();
  merged.nowMs=clock; merged.phase=60;
  const storage: Rules = {queue:merged,ready:{friendly:[],enemy:[]},readySweepAt:-1};
  const groups = [['periodics','periodicSequence','periodicEventId'],['enemyAuras','enemyAuraSequence','enemyAuraEventId']] as const;
  for (const [table,sequence] of groups) { storage[table]={}; storage[sequence]=0; }
  for (const [table,sequence] of [['casts','castSequence'],['resources','resourceSequence'],['attacks','attackSequence'],['dots','dotSequence'],['grounds','groundSequence']]) {
    storage[table]={}; storage[sequence]=0;
  }
  for (const {storage:original,units} of sources) {
    if (['casts','resources','attacks','dots','grounds'].some(key=>Object.keys(original[key]).length) ||
      original.ready.friendly.length || original.ready.enemy.length)
      throw new Error('Non-portable events remain in source room');
    // Combat teardown retires these timers but leaves unit-side IDs behind.
    // They must not accidentally bind to another actor's new room timer.
    for (const actor of units) {delete actor.attackEventIds;delete actor.powerEventId;}
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
      for (const actor of units) for (const effect of table==='periodics'?[...(actor.hots||[]),...(actor.periodicClass||[])]:actor.auras||[]) {
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
  return storage;
}

/** Partition target-owned effects without canceling effects their caster has
 * already applied to somebody staying behind. Other event kinds stay local. */
export function takeRoomEffects(storage:Rules,ids:Set<string>):Rules{
  const taken=structuredClone(storage);
  for(const table of ['periodics','enemyAuras']){
    taken[table]=Object.fromEntries(Object.entries(taken[table]).filter(([,timer])=>ids.has((timer as Rules).targetId)));
    storage[table]=Object.fromEntries(Object.entries(storage[table]).filter(([,timer])=>!ids.has((timer as Rules).targetId)));
  }
  const belongs=(e:Rules)=>e.kind==='AuraPeriodic'&&[33,35].includes(e.phase)&&!!taken[e.phase===35?'periodics':'enemyAuras'][e.subjectId];
  taken.queue.events=taken.queue.events.filter(belongs);
  storage.queue.events=storage.queue.events.filter((e:Rules)=>!belongs(e));
  for(const table of ['casts','resources','attacks','dots','grounds'])taken[table]={};
  taken.ready={friendly:[],enemy:[]};
  return taken;
}

/** A matched NPC waiting outside the scene has no active rule pass. Store its
 * exact runtime and target-owned timers together; waking preserves remaining
 * durations instead of reviving bindings to a discarded room queue. */
export function suspendNpcEffects(profile:Rules,unit:Rules,storage:Rules,clock:number):void{
 profile.unit=structuredClone(unit);
 profile.standbyEffects={clock,simulationEvents:takeRoomEffects(storage,new Set<string>(combatMembers(unit).map((a:Rules)=>a.id)))};
}
export function resumeNpcEffects(profile:Rules,clock:number):Rules|null{
 if(!profile.standbyEffects)return null;
 const resumed=rebaseSimulation(structuredClone({...profile.standbyEffects,unit:profile.unit}),clock);
 profile.unit=resumed.unit;delete profile.standbyEffects;
 return resumed.simulationEvents;
}
