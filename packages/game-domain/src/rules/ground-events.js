import {simulationEventRuntime,advanceSimulationEvents,combatDeadline,GROUND_CAPACITY} from './simulation-events.js';

const pulsePhases={friendly:21,enemy:31,extended:36};
const modeOf=area=>area.extended?'extended':area.side==='friendly'?'friendly':'enemy';
const scopeOf=s=>s.arenaGroundTeams?s.teamId:-1;
const expiryPhase=scope=>scope===-1?32:37;
const validArea=a=>typeof a.caster==='string'&&Number.isFinite(a.next)&&a.next>=0&&Number.isFinite(a.until)&&a.until>=0&&Number.isFinite(a.interval)&&a.interval>=0;
function collections(s){return s.arenaGroundTeams?s.arenaGroundTeams.map((team,index)=>({scope:index,areas:index===s.teamId?s.groundEffects:team.groundEffects})): [{scope:-1,areas:s.groundEffects||[]}];}
function matches(s,ground,id){const b=ground.bindings.get(id);return !!b&&collections(s).some(c=>c.scope===b.scope&&c.areas?.includes(b.area));}
const noEffects=Object.freeze([]);

// Only boundary adoption scans all effects. The hot path visits ready IDs;
// replacements and scene changes explicitly remove their indexed deadlines.
export function restoreGroundEvents(s,storage,queue){
 const timers=storage.grounds;
 if(!timers||typeof timers!=='object'||Array.isArray(timers)||!Number.isSafeInteger(storage.groundSequence)||storage.groundSequence<0||Object.keys(timers).length>GROUND_CAPACITY)throw new Error('Invalid ground event storage');
 const ground={bindings:new Map(),ready:new Set(),expired:new Set(),count:0};
 const events=new Map();
 for(const e of storage.queue.events)if(e.kind==='GroundPulse'||e.kind==='GroundExpire'){
  const key=`${e.kind}:${e.subjectId}`;if(events.has(key))throw new Error('Duplicate ground event');events.set(key,e);
 }
 for(const {scope,areas}of collections(s))for(const area of areas||[]){
  const id=area.groundEventId,timer=timers[id];
  if(!timer||timer.scope!==scope||ground.bindings.has(id)||!validArea(area)||modeOf(area)!==timer.mode||area.next!==timer.next||area.until!==timer.until)throw new Error('Ground effect does not match timer');
  ground.bindings.set(id,{scope,area});
 }
 for(const [key,t]of Object.entries(timers)){
  if(String(t.id)!==key||!Number.isSafeInteger(t.id)||t.id<1||t.id>storage.groundSequence||![-1,0,1].includes(t.scope)||!Object.hasOwn(pulsePhases,t.mode)||!ground.bindings.has(t.id)||typeof t.ready!=='boolean'||typeof t.expired!=='boolean'||!Number.isFinite(t.next)||!Number.isFinite(t.until)||!Number.isSafeInteger(t.expireAt)||t.expireAt<t.until||t.expireAt-t.until>=100)throw new Error('Invalid ground timer');
  const area=ground.bindings.get(t.id).area;
  for(const [kind,sequence,ready,atMs,phase,required]of [
   ['GroundPulse',t.pulseSequence,t.ready,t.atMs,pulsePhases[t.mode],area.interval>0&&t.next<=t.until],
   ['GroundExpire',t.expireSequence,t.expired,t.expireAt,expiryPhase(t.scope),true],
  ]){
   const e=events.get(`${kind}:${t.id}`);
   if(sequence!==null&&(!Number.isSafeInteger(sequence)||sequence<0||sequence>=storage.queue.nextSequence))throw new Error('Invalid ground event sequence');
   if(ready){if(sequence!==null||e||!required||atMs>queue.nowMs||atMs===queue.nowMs&&storage.queue.phase<phase)throw new Error('Invalid ready ground cursor');}
   else if(required){if(!e||e.sequence!==sequence||e.atMs!==atMs||e.phase!==phase||e.entitySlot!==0||e.entityGeneration!==1||e.subjectVersion!==1)throw new Error('Ground event does not match timer');}
   else if(e||sequence!==null)throw new Error('Unexpected ground pulse');
  }
  if(area.interval>0&&t.next<=t.until&&(!Number.isSafeInteger(t.atMs)||t.atMs<t.next||t.atMs-t.next>=100))throw new Error('Invalid ground pulse time');
  if(t.ready)ground.ready.add(t.id);if(t.expired)ground.expired.add(t.id);ground.count++;
 }
 for(const e of events.values())if(!timers[e.subjectId])throw new Error('Ground event requires timer');
 return ground;
}
export function validGroundEvent(s,owned,event){return matches(s,owned.ground,event.subjectId);}
export function dispatchGroundEvent(storage,owned,event){
 const t=storage.grounds[event.subjectId];
 if(event.kind==='GroundPulse'){t.ready=true;t.pulseSequence=null;owned.ground.ready.add(t.id);}
 else{t.expired=true;t.expireSequence=null;owned.ground.expired.add(t.id);}
}
function remove(s,owned,id){
 const storage=s.simulationEvents,t=storage.grounds[id];if(!t)return;
 for(const sequence of [t.pulseSequence,t.expireSequence])if(sequence!==null)owned.queue.cancel(sequence);
 owned.ground.ready.delete(id);owned.ground.expired.delete(id);owned.ground.bindings.delete(id);owned.ground.count--;delete storage.grounds[id];
}
function schedule(owned,t,kind,atMs,phase){return owned.queue.schedule({kind,atMs,phase,entitySlot:0,entityGeneration:1,subjectId:t.id,subjectVersion:1}).sequence;}
export function addGroundEffect(s,area){
 if(!validArea(area)||area.until<=s.clock||area.interval>0&&area.next<=s.clock)throw new Error('Ground effect requires valid future deadlines');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,scope=scopeOf(s);
 if(owned.ground.count>=GROUND_CAPACITY)throw new Error('Ground effect capacity exceeded');
 const id=storage.groundSequence+1;if(!Number.isSafeInteger(id))throw new Error('Ground effect sequence exhausted');
 const t={id,scope,mode:modeOf(area),next:area.next,until:area.until,atMs:null,expireAt:combatDeadline(s,area.until),ready:false,expired:false,pulseSequence:null,expireSequence:null};
 t.expireSequence=schedule(owned,t,'GroundExpire',t.expireAt,expiryPhase(scope));
 if(area.interval>0&&area.next<=area.until){t.atMs=combatDeadline(s,area.next);t.pulseSequence=schedule(owned,t,'GroundPulse',t.atMs,pulsePhases[t.mode]);}
 storage.groundSequence=id;storage.grounds[id]=t;area.groundEventId=id;(s.groundEffects??=[]).push(area);owned.ground.bindings.set(id,{scope,area});owned.ground.count++;return area;
}
export function removeGroundEffects(s,predicate=()=>true){
 s.groundEffects??=[];if(!s.groundEffects.length)return;
 const owned=simulationEventRuntime(s);
 s.groundEffects=s.groundEffects.filter(area=>{if(!predicate(area))return true;remove(s,owned,area.groundEventId);return false;});
}
export function dueGroundEffects(s,mode){
 if(!Object.hasOwn(pulsePhases,mode))throw new Error('Unknown ground effect mode');
 if(!s.simulationEvents||!simulationEventRuntime(s).ground.count)return noEffects;
 const owned=advanceSimulationEvents(s,pulsePhases[mode]),scope=scopeOf(s);
 if(!owned.ground.ready.size)return noEffects;
 return [...owned.ground.ready].filter(id=>{const t=s.simulationEvents.grounds[id];return t.scope===scope&&t.mode===mode&&matches(s,owned.ground,id);}).sort((a,b)=>a-b).map(id=>owned.ground.bindings.get(id).area);
}
// Call after resolving all due pulses in their existing insertion order. Damage,
// RNG and target deaths are never batched across different rule instants.
export function continueGroundEffect(s,area){
 const owned=simulationEventRuntime(s),t=s.simulationEvents.grounds[area.groundEventId];
 if(!t?.ready||owned.ground.bindings.get(t.id)?.area!==area||t.scope!==scopeOf(s)||area.next<=s.clock&&area.next<=area.until)throw new Error('Ground pulse must finish before rescheduling');
 t.next=area.next;t.ready=false;owned.ground.ready.delete(t.id);
 if(area.interval>0&&area.next<=area.until){t.atMs=combatDeadline(s,area.next);t.pulseSequence=schedule(owned,t,'GroundPulse',t.atMs,pulsePhases[t.mode]);}
}
export function expireGroundEffects(s){
 s.groundEffects??=[];if(!s.simulationEvents||!simulationEventRuntime(s).ground.count)return;
 const scope=scopeOf(s),owned=advanceSimulationEvents(s,expiryPhase(scope));
 const expired=new Set([...owned.ground.expired].filter(id=>s.simulationEvents.grounds[id].scope===scope));
 if(expired.size)removeGroundEffects(s,area=>expired.has(area.groundEventId));
}
