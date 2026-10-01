import {addCombatAura} from '../../../sim-core/src/combat-auras.js';
import {combatMembers} from './combat-members.js';
import {simulationEventRuntime,advanceSimulationEvents,combatDeadline,ENEMY_AURA_CAPACITY} from './simulation-events.js';

export const ENEMY_AURA_PHASE=33;
export const isEnemyPeriodicAura=a=>a.interval>0&&(a.type===3||a.type===23&&!!a.trigger);
const units=s=>s.arenaAllActors||[...combatMembers(s,null),...(s.combat?.enemies||[])];
const validAura=a=>isEnemyPeriodicAura(a)&&Number.isFinite(a.interval)&&Number.isFinite(a.next)&&a.next>=0&&Number.isFinite(a.until)&&a.until>=0;
const empty=Object.freeze([]);
function markReady(index,t){if(!index.ready.has(t.targetId))index.ready.set(t.targetId,new Set());index.ready.get(t.targetId).add(t.id);}
function unmarkReady(index,t){const ids=index.ready.get(t.targetId);ids?.delete(t.id);if(!ids?.size)index.ready.delete(t.targetId);}
function matches(index,t,target){const b=index.bindings.get(t.id);return !!b&&b.target===target&&target.auras?.includes(b.aura)&&b.aura.next===t.next&&b.aura.until===t.until;}
function retire(storage,owned,id){
 const t=storage.enemyAuras[id];if(!t)return;
 if(t.eventSequence!==null)owned.queue.cancel(t.eventSequence);
 const index=owned.enemyAuras;unmarkReady(index,t);index.bindings.delete(id);index.count--;delete storage.enemyAuras[id];
 const ids=index.byTarget.get(t.targetId);ids?.delete(id);if(!ids?.size)index.byTarget.delete(t.targetId);
}
function bind(index,t,target,aura){
 if(target&&aura)index.bindings.set(t.id,{target,aura});
 if(!index.byTarget.has(t.targetId))index.byTarget.set(t.targetId,new Set());index.byTarget.get(t.targetId).add(t.id);index.count++;
}
// Full scans are restricted to checkpoint adoption. A removed aura can leave a
// stale timer, but a live periodic aura must always own exactly one timer.
export function restoreEnemyAuraEvents(s,storage,queue){
 const timers=storage.enemyAuras,index={bindings:new Map(),byTarget:new Map(),ready:new Map(),count:0};
 if(!timers||typeof timers!=='object'||Array.isArray(timers)||Object.keys(timers).length>ENEMY_AURA_CAPACITY||!Number.isSafeInteger(storage.enemyAuraSequence)||storage.enemyAuraSequence<0)throw new Error('Invalid enemy aura storage');
 const events=new Map(),targets=new Map(units(s).map(u=>[u.id,u]));
 for(const e of storage.queue.events)if(e.kind==='AuraPeriodic'&&e.phase===ENEMY_AURA_PHASE){if(events.has(e.subjectId))throw new Error('Duplicate enemy aura event');events.set(e.subjectId,e);}
 for(const [key,t]of Object.entries(timers)){
  if(String(t.id)!==key||!Number.isSafeInteger(t.id)||t.id<1||t.id>storage.enemyAuraSequence||typeof t.targetId!=='string'||!Number.isFinite(t.next)||t.next<0||!Number.isFinite(t.until)||t.until<0||!Number.isSafeInteger(t.atMs)||t.atMs<Math.min(t.next,t.until)||!t.ready&&t.atMs-Math.min(t.next,t.until)>=100||typeof t.ready!=='boolean'||t.eventSequence!==null&&(!Number.isSafeInteger(t.eventSequence)||t.eventSequence<0||t.eventSequence>=storage.queue.nextSequence))throw new Error('Invalid enemy aura timer');
  const e=events.get(t.id);
  if(t.ready){if(e||t.eventSequence!==null||t.atMs>queue.nowMs||t.atMs===queue.nowMs&&storage.queue.phase<ENEMY_AURA_PHASE)throw new Error('Invalid ready enemy aura cursor');markReady(index,t);}
  else if(!e||e.sequence!==t.eventSequence||e.atMs!==t.atMs||e.entitySlot!==0||e.entityGeneration!==1||e.subjectVersion!==1)throw new Error('Enemy aura event does not match timer');
  const target=targets.get(t.targetId),aura=target?.auras?.find(a=>a.enemyAuraEventId===t.id);
  if(aura&&(!validAura(aura)||aura.next!==t.next||aura.until!==t.until))throw new Error('Enemy aura does not match timer');
  bind(index,t,target,aura);
 }
 for(const e of events.values())if(!timers[e.subjectId])throw new Error('Enemy aura event requires timer');
 const seen=new Set();
 for(const target of targets.values())for(const aura of target.auras||[])if(isEnemyPeriodicAura(aura)){
  const t=timers[aura.enemyAuraEventId];if(!t||t.targetId!==target.id||seen.has(t.id))throw new Error('Enemy periodic aura requires its own timer');seen.add(t.id);
 }
 return index;
}
export function validEnemyAuraEvent(s,owned,event){
 const t=s.simulationEvents.enemyAuras[event.subjectId],target=t&&units(s).find(u=>u.id===t.targetId);
 if(t&&matches(owned.enemyAuras,t,target))return true;
 retire(s.simulationEvents,owned,event.subjectId);return false;
}
export function dispatchEnemyAuraEvent(storage,owned,event){const t=storage.enemyAuras[event.subjectId];t.ready=true;t.eventSequence=null;markReady(owned.enemyAuras,t);}
function arm(s,owned,t){
 t.ready=false;t.atMs=combatDeadline(s,Math.min(t.next,t.until));
 t.eventSequence=owned.queue.schedule({kind:'AuraPeriodic',atMs:t.atMs,phase:ENEMY_AURA_PHASE,entitySlot:0,entityGeneration:1,subjectId:t.id,subjectVersion:1}).sequence;
}
export function addEnemyAura(s,target,aura){
 // Nonperiodic modifiers retain their ordinary aura semantics and cleanup.
 if(!isEnemyPeriodicAura(aura))return addCombatAura(target,aura,s.clock);
 if(!validAura(aura)||aura.next<=s.clock||aura.until<=s.clock)throw new Error('Enemy aura requires future deadlines');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents;
 const applied=addCombatAura(target,aura,s.clock);if(!applied)return;
 // Repeated refreshes cancel their exact old event instead of filling the heap.
 for(const id of owned.enemyAuras.byTarget.get(target.id)||[]){const t=storage.enemyAuras[id];if(!matches(owned.enemyAuras,t,target))retire(storage,owned,id);}
 if(owned.enemyAuras.count>=ENEMY_AURA_CAPACITY)throw new Error('Enemy aura capacity exceeded');
 const id=storage.enemyAuraSequence+1;if(!Number.isSafeInteger(id))throw new Error('Enemy aura sequence exhausted');
 const t={id,targetId:target.id,next:applied.next,until:applied.until,atMs:0,ready:false,eventSequence:null};
 arm(s,owned,t);storage.enemyAuraSequence=id;storage.enemyAuras[id]=t;applied.enemyAuraEventId=id;bind(owned.enemyAuras,t,target,applied);return applied;
}
export function prepareEnemyAuras(s){
 if(!s.simulationEvents)return;
 const owned=advanceSimulationEvents(s,ENEMY_AURA_PHASE);
 // An already-ready recipient may leave the party before its rules pass.
 // Sweep ready targets only; inactive members still belonging to this owner
 // retain their cursor until the existing rule path visits them again.
 if(!owned.enemyAuras.ready.size)return;
 const targets=new Map(units(s).map(u=>[u.id,u]));
 for(const [targetId,ids]of owned.enemyAuras.ready)for(const id of ids){const t=s.simulationEvents.enemyAuras[id];if(!matches(owned.enemyAuras,t,targets.get(targetId)))retire(s.simulationEvents,owned,id);}
}
export function dueEnemyAuras(s,target,type){
 if(!s.simulationEvents)return empty;
 const owned=simulationEventRuntime(s),ids=owned.enemyAuras.ready.get(target.id);if(!ids)return empty;
 const due=[];
 for(const id of ids){const t=s.simulationEvents.enemyAuras[id];if(!matches(owned.enemyAuras,t,target)){retire(s.simulationEvents,owned,id);continue;}const aura=owned.enemyAuras.bindings.get(id).aura;if(aura.type===type)due.push(aura);}
 return due.sort((a,b)=>a.enemyAuraEventId-b.enemyAuraEventId);
}
export function continueEnemyAura(s,target,aura){
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,t=storage.enemyAuras[aura.enemyAuraEventId];
 if(!t)return; // A nested trigger may have replaced and retired this aura.
 if(!t.ready||owned.enemyAuras.bindings.get(t.id)?.aura!==aura)throw new Error('Enemy aura must be ready before rescheduling');
 if(!target.auras?.includes(aura)||aura.until<=s.clock){retire(storage,owned,t.id);return;}
 // A trigger with an unavailable caster remains ready until it can execute or
 // expires, preserving the existing rule without repeatedly allocating events.
 t.next=aura.next;
 if(aura.next<=s.clock&&aura.next<=aura.until){t.atMs=s.clock;return;}
 unmarkReady(owned.enemyAuras,t);arm(s,owned,t);
}
