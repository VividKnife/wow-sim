import {ENEMY_AURA_PHASE,restoreEnemyAuraEvents,validEnemyAuraEvent,dispatchEnemyAuraEvent} from './enemy-aura-events.js';
import {restoreGroundEvents,validGroundEvent,dispatchGroundEvent} from './ground-events.js';
import {combatMembers} from './combat-members.js';
import {EventQueue} from '../../../combat-core/scheduling/event-queue.ts';

export const PROJECTILE_CAPACITY=4096;
export const CAST_CAPACITY=4096;
export const RESOURCE_CAPACITY=512;
export const ATTACK_CAPACITY=2048;
export const DOT_CAPACITY=8192;
export const PERIODIC_CAPACITY=4096;
export const GROUND_CAPACITY=2048;
export const ENEMY_AURA_CAPACITY=4096;
const PERIODIC_PHASE=35;
const EVENT_CAPACITY=PROJECTILE_CAPACITY+CAST_CAPACITY+RESOURCE_CAPACITY+ATTACK_CAPACITY+DOT_CAPACITY+PERIODIC_CAPACITY+2*GROUND_CAPACITY+ENEMY_AURA_CAPACITY;
export const projectilePhases={friendly:20,enemy:30};
const phases=projectilePhases;
const ENEMY_CAST_PHASE=60,ACTOR_CAST_PHASE=40;
const castPhase=timer=>timer.side==='enemy'?ENEMY_CAST_PHASE:ACTOR_CAST_PHASE;
const runtimes=new WeakMap();
// Scheduling owns the whole arena, while each team's rule pass sees its allies.
const eventActors=s=>s.arenaAllActors||combatMembers(s);
const dotTargets=s=>s.arenaAllActors||s.combat?.enemies||[];
export function simulationEventRuntime(s){
 const battle=s.combat;
 let storage=s.simulationEvents;
 if(!storage){
  if(battle?.projectiles?.length)throw new Error('Projectile records require their event queue');
  const queue=new EventQueue(EVENT_CAPACITY);
  storage=s.simulationEvents={queue:queue.ownedState(),ready:{friendly:[],enemy:[]},casts:{},castSequence:0,resources:{},resourceSequence:0,attacks:{},attackSequence:0,dots:{},dotSequence:0,periodics:{},periodicSequence:0,grounds:{},groundSequence:0,enemyAuras:{},enemyAuraSequence:0,readySweepAt:-1};
 }
 let owned=runtimes.get(storage);
 if(owned){if(battle&&owned.records!==battle.projectiles){if(owned.index.size)throw new Error('Previous encounter projectiles were not retired');owned.records=battle?(battle.projectiles??=[]):[];}return owned;}
 const queue=EventQueue.own(storage.queue,EVENT_CAPACITY),records=battle?(battle.projectiles??=[]):[];
 if(storage.queue.events.some(e=>!['ProjectileImpact','CastComplete','ChannelTick','ResourceRegen','AutoAttackReady','AuraPeriodic','GroundPulse','GroundExpire'].includes(e.kind)||e.kind==='AuraPeriodic'&&![PERIODIC_PHASE,ENEMY_CAST_PHASE,ENEMY_AURA_PHASE].includes(e.phase)))throw new Error('Unsupported combat event');
 if(!storage.casts||typeof storage.casts!=='object'||Array.isArray(storage.casts)||!Number.isSafeInteger(storage.castSequence)||storage.castSequence<0||!Number.isSafeInteger(storage.readySweepAt)||storage.readySweepAt< -1||storage.readySweepAt>queue.nowMs)throw new Error('Invalid cast event storage');
 if(!Array.isArray(records)||!Array.isArray(storage.ready?.friendly)||!Array.isArray(storage.ready?.enemy)||records.length+storage.ready.friendly.length+storage.ready.enemy.length>PROJECTILE_CAPACITY)throw new Error('Invalid projectile storage');
 const index=new Map();
 const scheduled=new Map();
 for(const event of storage.queue.events.filter(e=>e.kind==='ProjectileImpact')){
  if(scheduled.has(event.subjectId))throw new Error('Duplicate projectile event');
  scheduled.set(event.subjectId,event);
 }
 for(let i=0;i<records.length;i++){
  const p=records[i];if(!Number.isSafeInteger(p.sequence)||p.sequence<1||index.has(p.sequence)||!Object.hasOwn(phases,p.side)||p.id!==`${battle.id}:p${p.sequence}`||p.sequence>battle.projectileSequence||!Number.isSafeInteger(p.landsAt))throw new Error('Invalid projectile identity');
  const event=scheduled.get(p.sequence);
  if(!event||event.entitySlot!==0||event.phase!==phases[p.side]||event.entityGeneration!==1||event.subjectVersion!==1||event.atMs<p.landsAt||event.atMs-p.landsAt>=100)throw new Error('Projectile event does not match its record');
  index.set(p.sequence,i);
 }
 if(s.arenaAllActors)for(const p of [...records,...storage.ready.friendly,...storage.ready.enemy])if(![0,1].includes(p.teamId))throw new Error('Arena projectile requires its originating team');
 const identities=new Set(index.keys());
 for(const side of Object.keys(phases))for(const p of storage.ready[side]){
  if(p.side!==side||!Number.isSafeInteger(p.sequence)||p.sequence<1||identities.has(p.sequence)||scheduled.has(p.sequence)||p.id!==`${battle.id}:p${p.sequence}`||p.sequence>battle.projectileSequence)throw new Error('Invalid pending projectile identity');
  identities.add(p.sequence);
 }
 const casts=Object.values(storage.casts),castEvents=new Map();
 if(casts.length>CAST_CAPACITY)throw new Error('Cast capacity exceeded');
 for(const event of storage.queue.events.filter(e=>e.kind==='CastComplete'||e.kind==='ChannelTick')){
  if(castEvents.has(event.subjectId))throw new Error('Duplicate cast event');
  castEvents.set(event.subjectId,event);
 }
 const readyCasts=new Set();
 for(const [key,cast] of Object.entries(storage.casts)){
  if(String(cast.id)!==key||!Number.isSafeInteger(cast.id)||cast.id<1||cast.id>storage.castSequence||!['actor','enemy'].includes(cast.side)||typeof cast.actorId!=='string'||!Number.isSafeInteger(cast.slot)||cast.slot<0||!Number.isFinite(cast.until)||cast.until<0||!Number.isSafeInteger(cast.atMs)||cast.atMs<cast.until||cast.atMs-cast.until>=100||typeof cast.ready!=='boolean'||typeof cast.channel!=='boolean'||!Number.isSafeInteger(cast.eventSequence)||cast.eventSequence<0)throw new Error('Invalid cast timer identity');
  if(cast.eventSequence>=storage.queue.nextSequence||cast.channel&&(cast.side!=='actor'||!Number.isFinite(cast.endAt)||!Number.isFinite(cast.nextAt)||cast.nextAt<0))throw new Error('Invalid channel timer');
  const event=castEvents.get(cast.id);
  if(cast.ready){if(event||cast.atMs>queue.nowMs||cast.atMs===queue.nowMs&&storage.queue.phase<castPhase(cast))throw new Error('Invalid ready cast cursor');readyCasts.add(cast.id);}
  else if(!event||event.sequence!==cast.eventSequence||event.kind!==(cast.channel?'ChannelTick':'CastComplete')||event.phase!==castPhase(cast)||event.entitySlot!==cast.slot||event.entityGeneration!==1||event.subjectVersion!==1||event.atMs!==cast.atMs)throw new Error('Cast event does not match its timer');
 }
 for(const event of castEvents.values())if(!storage.casts[event.subjectId])throw new Error('Cast event requires its timer');
 for(const [slot,enemy] of (battle?.enemies||[]).entries())if(enemy.cast&&!battle.pvp){const timer=storage.casts[enemy.cast.eventId];if(!timer||timer.side!=='enemy'||timer.actorId!==enemy.id||timer.slot!==slot||timer.until!==enemy.cast.until)throw new Error('Cast object does not match its timer');}
 const actors=eventActors(s);
 for(const actor of actors)if(actor.cast&&battle){const cast=actor.cast,timer=storage.casts[cast.eventId];if(!timer||timer.side!=='actor'||timer.actorId!==actor.id||timer.channel!==!!cast.channel||!Number.isFinite(cast.until)||(!cast.channel&&cast.until<timer.until)||cast.channel&&(!validChannel(cast)||cast.until!==timer.endAt||cast.next!==timer.nextAt))throw new Error('Actor cast does not match its timer');}
 const resources=Object.values(storage.resources||{}),resourceEvents=new Map();
 if(!storage.resources||typeof storage.resources!=='object'||Array.isArray(storage.resources)||resources.length>RESOURCE_CAPACITY||!Number.isSafeInteger(storage.resourceSequence)||storage.resourceSequence<0)throw new Error('Invalid resource event storage');
 for(const event of storage.queue.events.filter(e=>e.kind==='ResourceRegen')){if(resourceEvents.has(event.subjectId))throw new Error('Duplicate resource event');resourceEvents.set(event.subjectId,event);}
 const readyResources=new Set();
 for(const [key,timer]of Object.entries(storage.resources)){
  if(String(timer.id)!==key||!Number.isSafeInteger(timer.id)||timer.id<1||timer.id>storage.resourceSequence||typeof timer.actorId!=='string'||!Number.isFinite(timer.until)||timer.until<0||!Number.isSafeInteger(timer.atMs)||timer.atMs<timer.until||!timer.ready&&timer.atMs-timer.until>=100||typeof timer.ready!=='boolean'||timer.eventSequence!==null&&(!Number.isSafeInteger(timer.eventSequence)||timer.eventSequence<0||timer.eventSequence>=storage.queue.nextSequence))throw new Error('Invalid resource timer');
  const event=resourceEvents.get(timer.id);
  if(timer.ready){if(event||timer.atMs>queue.nowMs||timer.atMs===queue.nowMs&&storage.queue.phase<ACTOR_CAST_PHASE)throw new Error('Invalid ready resource cursor');readyResources.add(timer.id);}
  else if(timer.eventSequence===null||!event||event.sequence!==timer.eventSequence||event.phase!==ACTOR_CAST_PHASE||event.entitySlot!==0||event.entityGeneration!==1||event.subjectVersion!==1||event.atMs!==timer.atMs)throw new Error('Resource event does not match timer');
 }
 for(const event of resourceEvents.values())if(!storage.resources[event.subjectId])throw new Error('Resource event requires timer');
 for(const actor of actors){const timer=storage.resources[actor.powerEventId];if(timer&&(timer.actorId!==actor.id||timer.until!==actor.nextPowerRegen))throw new Error('Actor resource does not match timer');}
 const attacks=Object.values(storage.attacks||{}),attackEvents=new Map();
 if(!storage.attacks||typeof storage.attacks!=='object'||Array.isArray(storage.attacks)||attacks.length>ATTACK_CAPACITY||!Number.isSafeInteger(storage.attackSequence)||storage.attackSequence<0)throw new Error('Invalid attack event storage');
 for(const event of storage.queue.events.filter(e=>e.kind==='AutoAttackReady')){if(attackEvents.has(event.subjectId))throw new Error('Duplicate attack event');attackEvents.set(event.subjectId,event);}
 const readyAttacks=new Set();
 for(const [key,timer]of Object.entries(storage.attacks)){
  if(String(timer.id)!==key||!Number.isSafeInteger(timer.id)||timer.id<1||timer.id>storage.attackSequence||!['actor','enemy'].includes(timer.side)||!Object.hasOwn(attackFields[timer.side],timer.hand)||typeof timer.actorId!=='string'||!Number.isSafeInteger(timer.slot)||timer.slot<0||timer.side==='actor'&&timer.slot!==0||!Number.isFinite(timer.until)||timer.until<0||!Number.isSafeInteger(timer.atMs)||timer.atMs<timer.until||!timer.ready&&timer.atMs-timer.until>=100||typeof timer.ready!=='boolean'||timer.eventSequence!==null&&(!Number.isSafeInteger(timer.eventSequence)||timer.eventSequence<0||timer.eventSequence>=storage.queue.nextSequence))throw new Error('Invalid attack timer');
  const event=attackEvents.get(timer.id);
  if(timer.ready){if(event||timer.atMs>queue.nowMs||timer.atMs===queue.nowMs&&storage.queue.phase<castPhase(timer))throw new Error('Invalid ready attack cursor');readyAttacks.add(timer.id);}
  else if(timer.eventSequence===null||!event||event.sequence!==timer.eventSequence||event.phase!==castPhase(timer)||event.entitySlot!==timer.slot||event.entityGeneration!==1||event.subjectVersion!==1||event.atMs!==timer.atMs)throw new Error('Attack event does not match timer');
 }
 for(const event of attackEvents.values())if(!storage.attacks[event.subjectId])throw new Error('Attack event requires timer');
 // Rule scripts can legitimately reset a swing between wakes. A stale deadline
 // is retired at dispatch; an ID bound to another unit or hand is corruption.
 const checkAttackBindings=(units,side)=>{for(const [slot,unit]of units.entries())for(const [hand,id]of Object.entries(unit.attackEventIds||{})){const timer=storage.attacks[id];if(timer&&(timer.actorId!==unit.id||timer.side!==side||timer.hand!==hand||side==='enemy'&&timer.slot!==slot))throw new Error('Unit attack does not match timer');}};
 checkAttackBindings(actors,'actor');if(!battle?.pvp)checkAttackBindings(battle?.enemies||[],'enemy');
 const dots=Object.values(storage.dots||{}),dotEvents=new Map(),dotBindings=new Map(),readyDots=new Set(),dotsByTarget=new Map(),readyDotsByTarget=new Map();
 if(!storage.dots||typeof storage.dots!=='object'||Array.isArray(storage.dots)||dots.length>DOT_CAPACITY||!Number.isSafeInteger(storage.dotSequence)||storage.dotSequence<0)throw new Error('Invalid periodic damage storage');
 for(const event of storage.queue.events.filter(e=>e.kind==='AuraPeriodic'&&e.phase===ENEMY_CAST_PHASE)){if(dotEvents.has(event.subjectId))throw new Error('Duplicate periodic damage event');dotEvents.set(event.subjectId,event);}
 const targets=new Map(dotTargets(s).map(unit=>[unit.id,unit]));
 for(const [key,timer]of Object.entries(storage.dots)){
  if(String(timer.id)!==key||!Number.isSafeInteger(timer.id)||timer.id<1||timer.id>storage.dotSequence||typeof timer.targetId!=='string'||!Number.isFinite(timer.next)||timer.next<0||!Number.isSafeInteger(timer.atMs)||timer.atMs<timer.next||!timer.ready&&timer.atMs-timer.next>=100||typeof timer.ready!=='boolean'||timer.eventSequence!==null&&(!Number.isSafeInteger(timer.eventSequence)||timer.eventSequence<0||timer.eventSequence>=storage.queue.nextSequence))throw new Error('Invalid periodic damage timer');
  const event=dotEvents.get(timer.id);
  if(timer.ready){if(event||timer.atMs>queue.nowMs||timer.atMs===queue.nowMs&&storage.queue.phase<ENEMY_CAST_PHASE)throw new Error('Invalid ready periodic damage cursor');readyDots.add(timer.id);if(!readyDotsByTarget.has(timer.targetId))readyDotsByTarget.set(timer.targetId,new Set());readyDotsByTarget.get(timer.targetId).add(timer.id);}
  else if(!event||timer.eventSequence===null||event.sequence!==timer.eventSequence||event.phase!==ENEMY_CAST_PHASE||event.entitySlot!==0||event.entityGeneration!==1||event.subjectVersion!==1||event.atMs!==timer.atMs)throw new Error('Periodic damage event does not match timer');
  const target=targets.get(timer.targetId),dot=target?.dots?.find(d=>d.dotEventId===timer.id);
  if(dot){if(dot.next!==timer.next||!validDot(dot))throw new Error('Periodic damage object does not match timer');dotBindings.set(timer.id,{target,dot});}
  if(!dotsByTarget.has(timer.targetId))dotsByTarget.set(timer.targetId,new Set());dotsByTarget.get(timer.targetId).add(timer.id);
 }
 for(const event of dotEvents.values())if(!storage.dots[event.subjectId])throw new Error('Periodic damage event requires timer');
 const boundDots=new Set();
 for(const target of targets.values())for(const dot of target.dots||[])if(dot.remaining>0){const timer=storage.dots[dot.dotEventId];if(!timer||timer.targetId!==target.id||boundDots.has(dot.dotEventId))throw new Error('Periodic damage requires its own timer');boundDots.add(dot.dotEventId);}
 const periodics=Object.values(storage.periodics||{}),periodicEvents=new Map(),periodicBindings=new Map(),readyPeriodics=new Set(),periodicsByTarget=new Map(),readyPeriodicsByTarget=new Map();
 if(!storage.periodics||typeof storage.periodics!=='object'||Array.isArray(storage.periodics)||periodics.length>PERIODIC_CAPACITY||!Number.isSafeInteger(storage.periodicSequence)||storage.periodicSequence<0)throw new Error('Invalid persistent periodic storage');
 for(const event of storage.queue.events.filter(e=>e.kind==='AuraPeriodic'&&e.phase===PERIODIC_PHASE)){if(periodicEvents.has(event.subjectId))throw new Error('Duplicate persistent periodic event');periodicEvents.set(event.subjectId,event);}
 const members=new Map(actors.map(c=>[c.id,c]));
 for(const [key,timer]of Object.entries(storage.periodics)){
  if(String(timer.id)!==key||!Number.isSafeInteger(timer.id)||timer.id<1||timer.id>storage.periodicSequence||typeof timer.targetId!=='string'||!['hots','periodicClass'].includes(timer.container)||!Number.isFinite(timer.next)||timer.next<0||!Number.isFinite(timer.until)||timer.until<0||!Number.isSafeInteger(timer.atMs)||timer.atMs<Math.min(timer.next,timer.until)||!timer.ready&&timer.atMs-Math.min(timer.next,timer.until)>=100||typeof timer.ready!=='boolean'||timer.eventSequence!==null&&(!Number.isSafeInteger(timer.eventSequence)||timer.eventSequence<0||timer.eventSequence>=storage.queue.nextSequence))throw new Error('Invalid persistent periodic timer');
  const event=periodicEvents.get(timer.id);
  if(timer.ready){if(event||timer.atMs>queue.nowMs||timer.atMs===queue.nowMs&&storage.queue.phase<PERIODIC_PHASE)throw new Error('Invalid ready persistent periodic cursor');readyPeriodics.add(timer.id);if(!readyPeriodicsByTarget.has(timer.targetId))readyPeriodicsByTarget.set(timer.targetId,new Set());readyPeriodicsByTarget.get(timer.targetId).add(timer.id);}
  else if(!event||timer.eventSequence===null||event.sequence!==timer.eventSequence||event.phase!==PERIODIC_PHASE||event.entitySlot!==0||event.entityGeneration!==1||event.subjectVersion!==1||event.atMs!==timer.atMs)throw new Error('Persistent periodic event does not match timer');
  const target=members.get(timer.targetId),effect=target?.[timer.container]?.find(p=>p.periodicEventId===timer.id);
  if(effect){if(!validPeriodic(effect)||effect.next!==timer.next||effect.until!==timer.until)throw new Error('Persistent periodic object does not match timer');periodicBindings.set(timer.id,{target,effect});}
  if(!periodicsByTarget.has(timer.targetId))periodicsByTarget.set(timer.targetId,new Set());periodicsByTarget.get(timer.targetId).add(timer.id);
 }
 for(const event of periodicEvents.values())if(!storage.periodics[event.subjectId])throw new Error('Persistent periodic event requires timer');
 const boundPeriodics=new Set();
 for(const target of actors)for(const container of ['hots','periodicClass'])for(const effect of target[container]||[]){const timer=storage.periodics[effect.periodicEventId];if(!timer||timer.targetId!==target.id||timer.container!==container||boundPeriodics.has(timer.id))throw new Error('Persistent periodic requires its own timer');boundPeriodics.add(timer.id);}
 const ground=restoreGroundEvents(s,storage,queue);
 owned={enemyAuras:restoreEnemyAuraEvents(s,storage,queue),ground,queue,records,index,readyCasts,castCount:casts.length,readyResources,resourceCount:resources.length,readyAttacks,attackCount:attacks.length,readyDots,dotBindings,dotsByTarget,readyDotsByTarget,dotCount:dots.length,periodicBindings,readyPeriodics,periodicsByTarget,readyPeriodicsByTarget,periodicCount:periodics.length};runtimes.set(storage,owned);
 return owned;
}
function removeProjectile(owned,sequence){
 const index=owned.index.get(sequence);if(index===undefined)return null;
 const p=owned.records[index],last=owned.records.pop();owned.index.delete(sequence);
 if(index<owned.records.length){owned.records[index]=last;owned.index.set(last.sequence,index);}
 return p;
}
// Preserve the existing 100ms rule boundary, including nonzero clock origins.
// The renderer keeps the exact flight time; impact authority uses this boundary.
export function combatDeadline(s,landsAt){
 const anchor=Number.isSafeInteger(s.nextTick)?s.nextTick:s.clock+100;
 return anchor+Math.max(0,Math.ceil((landsAt-anchor)/100))*100;
}

function castMatches(caster,timer){
 return caster?.id===timer.actorId&&caster.hp>0&&!caster.removed&&caster.cast?.eventId===timer.id&&
  (timer.channel?caster.cast.channel&&caster.cast.until===timer.endAt&&caster.cast.next===timer.nextAt:timer.side==='actor'?caster.cast.until>=timer.until:caster.cast.until===timer.until);
}
// Non-channel pushback only postpones completion. Re-arm at the earlier wake,
// so damage from another arena team never needs to mutate this owner's heap.
function postponeCast(s,owned,timer,cast){
 timer.until=cast.until;timer.atMs=combatDeadline(s,cast.until);timer.ready=false;owned.readyCasts.delete(timer.id);
 timer.eventSequence=owned.queue.schedule({kind:'CastComplete',atMs:timer.atMs,phase:castPhase(timer),entitySlot:timer.slot,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}
function retireCast(storage,owned,id){if(storage.casts[id]){delete storage.casts[id];owned.castCount--;owned.readyCasts.delete(id);}}
export function advanceSimulationEvents(s,phase){
 const battle=s.combat,owned=simulationEventRuntime(s),storage=s.simulationEvents;
 // These dispatchers only retire deadlines; new casts and flights are strictly
 // future events. Multiple casters can therefore reuse a finished rule phase.
 if(storage.queue.nowMs===s.clock&&storage.queue.phase>=phase)return owned;
 let actors;const caster=timer=>timer.side==='enemy'?battle?.enemies?.[timer.slot]:(actors??=new Map(eventActors(s).map(c=>[c.id,c]))).get(timer.actorId);
 const result=owned.queue.advancePhase(s.clock,phase,EVENT_CAPACITY,
  e=>{
   if(e.kind==='GroundPulse'||e.kind==='GroundExpire')return validGroundEvent(s,owned,e);
   if(e.kind==='ProjectileImpact')return e.entityGeneration===1&&e.subjectVersion===1&&owned.index.has(e.subjectId);
   if(e.kind==='AuraPeriodic'&&e.phase===ENEMY_AURA_PHASE)return validEnemyAuraEvent(s,owned,e);
   if(e.kind==='AuraPeriodic'&&e.phase===PERIODIC_PHASE){
    const timer=storage.periodics[e.subjectId],target=(actors??=new Map(eventActors(s).map(c=>[c.id,c]))).get(timer?.targetId);
    if(periodicMatches(owned,e.subjectId,target,timer))return true;
    retirePeriodic(storage,owned,e.subjectId);return false;
   }
   if(e.kind==='AuraPeriodic'){
    if(dotMatches(s,owned,e.subjectId))return true;
    retireDot(storage,owned,e.subjectId);return false;
   }
   if(e.kind==='AutoAttackReady'){
    const timer=storage.attacks[e.subjectId];
    if(timer&&attackMatches(caster(timer),timer))return true;
    retireAttack(storage,owned,e.subjectId);return false;
   }
   if(e.kind==='ResourceRegen'){
    const timer=storage.resources[e.subjectId],actor=(actors??=new Map(eventActors(s).map(c=>[c.id,c]))).get(timer?.actorId);
    if(resourceMatches(actor,timer))return true;
    retireResource(storage,owned,e.subjectId);return false;
   }
   const timer=storage.casts[e.subjectId];
   if(timer&&castMatches(caster(timer),timer))return true;
   retireCast(storage,owned,e.subjectId);return false;
  },
  e=>{
   if(e.kind==='GroundPulse'||e.kind==='GroundExpire')dispatchGroundEvent(storage,owned,e);
   else if(e.kind==='ProjectileImpact'){const p=removeProjectile(owned,e.subjectId);storage.ready[p.side].push(p);}
   else if(e.kind==='AuraPeriodic'&&e.phase===ENEMY_AURA_PHASE)dispatchEnemyAuraEvent(storage,owned,e);
   else if(e.kind==='AuraPeriodic'&&e.phase===PERIODIC_PHASE){storage.periodics[e.subjectId].ready=true;markPeriodicReady(owned,storage.periodics[e.subjectId]);}
   else if(e.kind==='AuraPeriodic'){storage.dots[e.subjectId].ready=true;markDotReady(owned,storage.dots[e.subjectId]);}
   else if(e.kind==='AutoAttackReady'){storage.attacks[e.subjectId].ready=true;owned.readyAttacks.add(e.subjectId);}
   else if(e.kind==='ResourceRegen'){storage.resources[e.subjectId].ready=true;owned.readyResources.add(e.subjectId);}
   else{const timer=storage.casts[e.subjectId],cast=caster(timer).cast;if(timer.side==='actor'&&!timer.channel&&cast.until>s.clock)postponeCast(s,owned,timer,cast);else{timer.ready=true;owned.readyCasts.add(e.subjectId);}}
  });
 if(!result.complete)throw new Error('Incomplete combat rule phase');
 // Sweep once per rule instant, not once for every caster. The cursor is
 // durable so cloning between phases does not change cleanup order.
 if(storage.readySweepAt!==s.clock){
  storage.readySweepAt=s.clock;
  for(const id of owned.readyPeriodics){const timer=storage.periodics[id],target=(actors??=new Map(eventActors(s).map(c=>[c.id,c]))).get(timer.targetId);if(!periodicMatches(owned,id,target,timer))retirePeriodic(storage,owned,id);}
  for(const id of owned.readyDots)if(!dotMatches(s,owned,id))retireDot(storage,owned,id);
  for(const id of owned.readyAttacks){const timer=storage.attacks[id];if(!attackMatches(caster(timer),timer))retireAttack(storage,owned,id);}
  for(const id of owned.readyResources){const timer=storage.resources[id],actor=(actors??=new Map(eventActors(s).map(c=>[c.id,c]))).get(timer.actorId);if(!resourceMatches(actor,timer))retireResource(storage,owned,id);}
  for(const id of owned.readyCasts)if(!castMatches(caster(storage.casts[id]),storage.casts[id]))retireCast(storage,owned,id);
 }
 return owned;
}
function beginCast(s,c,cast,side){
 if(c.cast)throw new Error('Caster already has a cast');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,slot=side==='enemy'?s.combat.enemies.indexOf(c):0,id=storage.castSequence+1;
 if(slot<0||side==='actor'&&(!combatMembers(s).includes(c)||cast.channel&&!validChannel(cast))||!Number.isFinite(cast.until)||cast.until<=s.clock)throw new Error('Invalid cast');
 if(owned.castCount>=CAST_CAPACITY)throw new Error('Cast capacity exceeded');
 if(!Number.isSafeInteger(id))throw new Error('Cast sequence exhausted');
 const channel=!!cast.channel,until=channel?Math.min(cast.next,cast.until):cast.until,atMs=combatDeadline(s,until);
 const event=owned.queue.schedule({kind:channel?'ChannelTick':'CastComplete',atMs,phase:side==='enemy'?ENEMY_CAST_PHASE:ACTOR_CAST_PHASE,entitySlot:slot,entityGeneration:1,subjectId:id,subjectVersion:1});
 storage.castSequence=id;storage.casts[id]={id,side,slot,actorId:c.id,channel,until,atMs,ready:false,eventSequence:event.sequence,...(channel?{endAt:cast.until,nextAt:cast.next}:{})};owned.castCount++;
 c.cast={...cast,eventId:id};return c.cast;
}
export const beginEnemyCast=(s,c,cast)=>beginCast(s,c,cast,'enemy');
export const beginActorCast=(s,c,cast)=>beginCast(s,c,cast,'actor');
const noCasts=new Set();
export function prepareActorCasts(s){if(s.simulationEvents)advanceSimulationEvents(s,ACTOR_CAST_PHASE);}
export function takeActorCastReady(s,c){
 if(!c.cast?.eventId||!s.simulationEvents)throw new Error('Actor cast requires its scheduled event');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,timer=storage.casts[c.cast.eventId];
 if(!timer||timer.side!=='actor'||timer.actorId!==c.id)throw new Error('Actor cast timer missing');
 if(!timer.ready)return false;
 if(c.cast.until>s.clock){postponeCast(s,owned,timer,c.cast);return false;}
 retireCast(storage,owned,timer.id);return true;
}
function validChannel(cast){return Number.isFinite(cast.until)&&Number.isFinite(cast.next)&&cast.next>=0&&Number.isFinite(cast.interval)&&cast.interval>0;}
function armChannel(s,owned,timer,cast){
 timer.until=Math.min(cast.next,cast.until);if(timer.until<=s.clock)timer.until=s.clock+100;timer.endAt=cast.until;timer.nextAt=cast.next;
 // Repeated test/late calls still execute at most one periodic effect per rule
 // step. The stored periodic deadline advances from its old value, never now.
 timer.atMs=combatDeadline(s,timer.until);if(timer.atMs<=s.clock)timer.atMs=s.clock+100;
 timer.ready=false;owned.readyCasts.delete(timer.id);
 timer.eventSequence=owned.queue.schedule({kind:'ChannelTick',atMs:timer.atMs,phase:ACTOR_CAST_PHASE,entitySlot:timer.slot,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}
export function shortenCombatChannel(s,c,until){
 const cast=c.cast;
 if(!cast||!eventActors(s).includes(c))throw new Error('Channel requires its owning event runtime');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,timer=storage.casts[cast.eventId];
 if(!timer?.channel||timer.actorId!==c.id||!validChannel(cast)||!Number.isFinite(until)||until>cast.until)throw new Error('Invalid channel shortening');
 if(until===cast.until)return;
 cast.until=until;timer.endAt=until;
 if(timer.ready)return;
 const deadline=Math.max(s.clock,Math.min(cast.next,until)),atMs=deadline<=s.clock?s.clock:combatDeadline(s,deadline);
 // Most damage leaves the next periodic wake unchanged. Update the channel's
 // end, but do not reorder that already scheduled event unnecessarily.
 if(atMs===timer.atMs)return;
 if(!owned.queue.cancel(timer.eventSequence))throw new Error('Channel event missing');
 timer.until=deadline;timer.atMs=atMs;
 if(owned.queue.nowMs===s.clock&&storage.queue.phase>=ACTOR_CAST_PHASE){
  if(timer.atMs<=s.clock){timer.ready=true;owned.readyCasts.add(timer.id);return;}
 }
 timer.eventSequence=owned.queue.schedule({kind:'ChannelTick',atMs:timer.atMs,phase:ACTOR_CAST_PHASE,entitySlot:timer.slot,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}
export function channelProgress(s,c){
 simulationEventRuntime(s);const timer=s.simulationEvents.casts[c.cast?.eventId];
 if(!timer?.channel||timer.actorId!==c.id)throw new Error('Channel timer missing');
 return timer.ready?{tick:c.cast.next<=s.clock,end:c.cast.until<=s.clock}:null;
}
export function continueChannel(s,c,cast){
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,timer=storage.casts[cast.eventId];
 if(!timer?.ready)return;
 if(c.cast!==cast||c.hp<=0||cast.until<=s.clock){retireCast(storage,owned,timer.id);return;}
 armChannel(s,owned,timer,cast);
}
export function dueEnemyCastIds(s){return s.simulationEvents?advanceSimulationEvents(s,ENEMY_CAST_PHASE).readyCasts:noCasts;}
export function takeEnemyCastReady(s,c,prepared=false){
 if(!c.cast)return false;
 if(!c.cast.eventId||!s.simulationEvents)throw new Error('Enemy cast requires its scheduled event');
 const owned=prepared?simulationEventRuntime(s):advanceSimulationEvents(s,ENEMY_CAST_PHASE),storage=s.simulationEvents,timer=storage.casts[c.cast.eventId];
 if(!timer)throw new Error('Enemy cast timer missing');
 if(!timer.ready)return false;
 retireCast(storage,owned,timer.id);return true;
}
export function clearCombatEvents(s){
 if(!s.simulationEvents){if(s.combat)s.combat.projectiles=[];return;}
 const owned=simulationEventRuntime(s),storage=s.simulationEvents;
 for(const event of [...storage.queue.events])if(event.kind!=='GroundPulse'&&event.kind!=='GroundExpire'&&(event.kind!=='AuraPeriodic'||![PERIODIC_PHASE,ENEMY_AURA_PHASE].includes(event.phase)))owned.queue.cancel(event.sequence);
 storage.ready={friendly:[],enemy:[]};storage.casts={};storage.resources={};storage.attacks={};storage.dots={};
 owned.records=[];if(s.combat)s.combat.projectiles=owned.records;owned.index.clear();
 owned.readyCasts.clear();owned.castCount=0;owned.readyResources.clear();owned.resourceCount=0;owned.readyAttacks.clear();owned.attackCount=0;
 owned.readyDots.clear();owned.dotBindings.clear();owned.dotsByTarget.clear();owned.readyDotsByTarget.clear();owned.dotCount=0;
 // Clock and all monotonic sequences belong to the simulation lifetime.
}


function resourceMatches(actor,timer){return !!timer&&actor?.hp>0&&!actor.removed&&actor.id===timer.actorId&&actor.powerEventId===timer.id&&actor.nextPowerRegen===timer.until;}
function retireResource(storage,owned,id){if(storage.resources[id]){delete storage.resources[id];owned.resourceCount--;owned.readyResources.delete(id);}}
// Deadline readiness is separate from permission to consume a regeneration
// pulse. Control, pull preparation and PvP ordering retain their rule positions.
export function takePowerRegenReady(s,c,{pet=false}={}){
 if(!pet&&c.classId!==4&&c.classId!==11)return false;
 if(!Number.isFinite(c.nextPowerRegen)||c.hp<=0||c.removed)return false;
 const owned=simulationEventRuntime(s),storage=s.simulationEvents;
 let timer=storage.resources[c.powerEventId];
 if(timer&&timer.actorId!==c.id)timer=null;
 if(timer&&!resourceMatches(c,timer)){
  if(!timer.ready)owned.queue.cancel(timer.eventSequence);
  retireResource(storage,owned,timer.id);timer=null;
 }
 if(!timer){
  advanceSimulationEvents(s,ACTOR_CAST_PHASE);
  if(owned.resourceCount>=RESOURCE_CAPACITY)throw new Error('Resource capacity exceeded');
  const id=storage.resourceSequence+1;if(!Number.isSafeInteger(id))throw new Error('Resource sequence exhausted');
  storage.resourceSequence=id;c.powerEventId=id;
  timer={id,actorId:c.id,until:c.nextPowerRegen,atMs:0,ready:false,eventSequence:null};
  storage.resources[id]=timer;owned.resourceCount++;
  armResource(s,owned,timer);
 }
 if(!timer.ready){advanceSimulationEvents(s,ACTOR_CAST_PHASE);if(!timer.ready)return false;}
 c.nextPowerRegen=pet?s.clock+2000:c.nextPowerRegen+2000;
 timer.until=c.nextPowerRegen;armResource(s,owned,timer);
 return true;
}
function armResource(s,owned,timer){
 owned.readyResources.delete(timer.id);
 // A late eligible actor may still owe another pulse. Preserve the existing
 // at-most-one-per-call semantics without inserting into a completed phase.
 if(timer.until<=s.clock){
  timer.atMs=s.clock;timer.ready=true;owned.readyResources.add(timer.id);
  timer.eventSequence=null;return;
 }
 timer.atMs=combatDeadline(s,timer.until);timer.ready=false;
 timer.eventSequence=owned.queue.schedule({kind:'ResourceRegen',atMs:timer.atMs,phase:ACTOR_CAST_PHASE,entitySlot:0,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}


const attackFields={actor:{main:'nextSwing',off:'nextOffhand',ranged:'nextRanged'},enemy:{main:'nextAttack',off:'nextOffhand'}};
function attackDeadline(unit,side,hand){return unit[attackFields[side][hand]]??0;}
function attackMatches(unit,timer){return !!unit&&unit.hp>0&&!unit.removed&&unit.id===timer.actorId&&unit.attackEventIds?.[timer.hand]===timer.id&&attackDeadline(unit,timer.side,timer.hand)===timer.until;}
function retireAttack(storage,owned,id){if(storage.attacks[id]){delete storage.attacks[id];owned.attackCount--;owned.readyAttacks.delete(id);}}
function armAttack(s,owned,timer){
 owned.readyAttacks.delete(timer.id);
 // Readiness can wait for range, control or a new target. Do not poll it by
 // scheduling another event every 100ms, or insert into a completed phase.
 if(timer.until<=s.clock){timer.atMs=s.clock;timer.ready=true;timer.eventSequence=null;owned.readyAttacks.add(timer.id);return;}
 timer.atMs=combatDeadline(s,timer.until);timer.ready=false;
 timer.eventSequence=owned.queue.schedule({kind:'AutoAttackReady',atMs:timer.atMs,phase:castPhase(timer),entitySlot:timer.slot,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}
// The queue records eligibility, not damage. The existing ordered rule phase
// still validates the target and resolves each attack and its immediate procs.
export function autoAttackReady(s,unit,hand='main',side='actor'){
 if(!Object.hasOwn(attackFields,side)||!Object.hasOwn(attackFields[side],hand))throw new Error('Invalid attack hand');
 const until=attackDeadline(unit,side,hand);
 if(unit.hp<=0||unit.removed||!Number.isFinite(until)||until<0)return false;
 const owned=simulationEventRuntime(s),storage=s.simulationEvents;
 let timer=storage.attacks[unit.attackEventIds?.[hand]];
 if(timer&&(timer.actorId!==unit.id||timer.side!==side||timer.hand!==hand))throw new Error('Foreign attack timer');
 if(timer&&!attackMatches(unit,timer)){
  if(!timer.ready)owned.queue.cancel(timer.eventSequence);
  retireAttack(storage,owned,timer.id);timer=null;
 }
 if(!timer){
  advanceSimulationEvents(s,side==='enemy'?ENEMY_CAST_PHASE:ACTOR_CAST_PHASE);
  const slot=side==='enemy'?s.combat.enemies.indexOf(unit):0;
  if(slot<0||side==='actor'&&!combatMembers(s).includes(unit))throw new Error('Attack unit is not in this instance');
  if(owned.attackCount>=ATTACK_CAPACITY)throw new Error('Attack capacity exceeded');
  const id=storage.attackSequence+1;if(!Number.isSafeInteger(id))throw new Error('Attack sequence exhausted');
  storage.attackSequence=id;(unit.attackEventIds??={})[hand]=id;
  timer={id,side,slot,actorId:unit.id,hand,until,atMs:0,ready:false,eventSequence:null};
  storage.attacks[id]=timer;owned.attackCount++;armAttack(s,owned,timer);
 }
 if(!timer.ready)advanceSimulationEvents(s,castPhase(timer));
 return timer.ready;
}
export function scheduleAutoAttack(s,unit,hand,until,side='actor'){
 const owned=simulationEventRuntime(s),timer=s.simulationEvents.attacks[unit.attackEventIds?.[hand]];
 if(!timer||!timer.ready||timer.side!==side||timer.hand!==hand||!attackMatches(unit,timer)||!Number.isFinite(until)||until<0)throw new Error('Attack must be ready before scheduling its next swing');
 unit[attackFields[side][hand]]=until;timer.until=until;armAttack(s,owned,timer);
}


function validDot(dot){return Number.isFinite(dot.next)&&dot.next>=0&&Number.isFinite(dot.interval)&&dot.interval>0&&Number.isSafeInteger(dot.remaining)&&dot.remaining>=0;}
function dotMatches(s,owned,id){
 const binding=owned.dotBindings.get(id);return !!binding&&binding.target.hp>0&&!binding.target.removed&&dotTargets(s).includes(binding.target)&&binding.target.dots.includes(binding.dot)&&binding.dot.remaining>0&&binding.dot.dotEventId===id;
}
function retireDot(storage,owned,id){
 const timer=storage.dots[id];if(!timer)return;
 const binding=owned.dotBindings.get(id);if(binding&&(binding.target.hp<=0||binding.target.removed))binding.target.dots=binding.target.dots.filter(dot=>dot!==binding.dot);
 clearDotReady(owned,timer);delete storage.dots[id];owned.dotCount--;owned.dotBindings.delete(id);
 const ids=owned.dotsByTarget.get(timer.targetId);ids?.delete(id);if(!ids?.size)owned.dotsByTarget.delete(timer.targetId);
}
function markDotReady(owned,timer){owned.readyDots.add(timer.id);if(!owned.readyDotsByTarget.has(timer.targetId))owned.readyDotsByTarget.set(timer.targetId,new Set());owned.readyDotsByTarget.get(timer.targetId).add(timer.id);}
function clearDotReady(owned,timer){owned.readyDots.delete(timer.id);const ids=owned.readyDotsByTarget.get(timer.targetId);ids?.delete(timer.id);if(!ids?.size)owned.readyDotsByTarget.delete(timer.targetId);}
function armDot(s,owned,timer){
 clearDotReady(owned,timer);
 // Late ticks retain one-effect-per-combat-pass semantics. Do not combine
 // damage, consume RNG early or put an overdue pulse into a completed phase.
 if(timer.next<=s.clock){timer.atMs=s.clock;timer.ready=true;timer.eventSequence=null;markDotReady(owned,timer);return;}
 timer.atMs=combatDeadline(s,timer.next);timer.ready=false;
 timer.eventSequence=owned.queue.schedule({kind:'AuraPeriodic',atMs:timer.atMs,phase:ENEMY_CAST_PHASE,entitySlot:0,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}
export function addCombatDot(s,target,dot){
 if(!s.combat?.enemies.includes(target)||!validDot(dot)||dot.next<=s.clock)throw new Error('Periodic damage requires a combat target and a future pulse');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents;
 // Refresh/stacking rules already replaced their old objects. Prune only this
 // target's retired effects, so repeated refreshes cannot fill the heap.
 for(const id of owned.dotsByTarget.get(target.id)||[]){const timer=storage.dots[id];if(!dotMatches(s,owned,id)){if(!timer.ready)owned.queue.cancel(timer.eventSequence);retireDot(storage,owned,id);}}
 if(owned.dotCount>=DOT_CAPACITY)throw new Error('Periodic damage capacity exceeded');
 if(!dot.remaining)return dot;
 const id=storage.dotSequence+1;if(!Number.isSafeInteger(id))throw new Error('Periodic damage sequence exhausted');
 const timer={id,targetId:target.id,next:dot.next,atMs:0,ready:false,eventSequence:null};
 storage.dotSequence=id;dot.dotEventId=id;(target.dots??=[]).push(dot);storage.dots[id]=timer;owned.dotCount++;owned.dotBindings.set(id,{target,dot});
 if(!owned.dotsByTarget.has(target.id))owned.dotsByTarget.set(target.id,new Set());owned.dotsByTarget.get(target.id).add(id);
 armDot(s,owned,timer);return dot;
}
const noDots=Object.freeze([]);
export function dueCombatDots(s,target){
 if(!s.simulationEvents)return noDots;
 const owned=advanceSimulationEvents(s,ENEMY_CAST_PHASE),ready=owned.readyDotsByTarget.get(target.id);
 if(!ready?.size)return noDots;
 // Monotonic effect identities preserve insertion order even when deadlines
 // collide or effects are replaced. This list is fixed for the current pass.
 return [...ready].filter(id=>dotMatches(s,owned,id)).sort((a,b)=>a-b).map(id=>owned.dotBindings.get(id).dot);
}
export function continueCombatDot(s,target,dot){
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,timer=storage.dots[dot.dotEventId];
 if(!timer&&(!target.dots.includes(dot)||target.hp<=0||target.removed)){dot.remaining--;dot.next+=dot.interval;return;}
 if(!timer?.ready||owned.dotBindings.get(timer.id)?.dot!==dot)throw new Error('Periodic damage must be ready before advancing');
 dot.remaining--;dot.next+=dot.interval;
 if(!dot.remaining)target.dots=target.dots.filter(item=>item!==dot);
 if(!dotMatches(s,owned,timer.id)){retireDot(storage,owned,timer.id);return;}
 timer.next=dot.next;armDot(s,owned,timer);
}


function validPeriodic(p){return Number.isFinite(p.next)&&p.next>=0&&Number.isFinite(p.until)&&p.until>=0&&Number.isFinite(p.interval)&&p.interval>0;}
function periodicMatches(owned,id,target,timer){const binding=owned.periodicBindings.get(id);return !!binding&&target===binding.target&&target.hp>0&&!target.removed&&target[timer.container]?.includes(binding.effect)&&binding.effect.periodicEventId===id;}
function markPeriodicReady(owned,timer){owned.readyPeriodics.add(timer.id);if(!owned.readyPeriodicsByTarget.has(timer.targetId))owned.readyPeriodicsByTarget.set(timer.targetId,new Set());owned.readyPeriodicsByTarget.get(timer.targetId).add(timer.id);}
function clearPeriodicReady(owned,timer){owned.readyPeriodics.delete(timer.id);const ids=owned.readyPeriodicsByTarget.get(timer.targetId);ids?.delete(timer.id);if(!ids?.size)owned.readyPeriodicsByTarget.delete(timer.targetId);}
function retirePeriodic(storage,owned,id){
 const timer=storage.periodics[id];if(!timer)return;
 const binding=owned.periodicBindings.get(id);if(binding)binding.target[timer.container]=binding.target[timer.container].filter(p=>p!==binding.effect);
 clearPeriodicReady(owned,timer);delete storage.periodics[id];owned.periodicBindings.delete(id);owned.periodicCount--;
 const ids=owned.periodicsByTarget.get(timer.targetId);ids?.delete(id);if(!ids?.size)owned.periodicsByTarget.delete(timer.targetId);
}
function armPeriodic(s,owned,timer){
 clearPeriodicReady(owned,timer);const next=Math.min(timer.next,timer.until);
 if(next<=s.clock){timer.atMs=s.clock;timer.ready=true;timer.eventSequence=null;markPeriodicReady(owned,timer);return;}
 timer.atMs=combatDeadline(s,next);timer.ready=false;
 timer.eventSequence=owned.queue.schedule({kind:'AuraPeriodic',atMs:timer.atMs,phase:PERIODIC_PHASE,entitySlot:0,entityGeneration:1,subjectId:timer.id,subjectVersion:1}).sequence;
}
export function addPeriodicEffect(s,target,container,effect){
 if(!['hots','periodicClass'].includes(container)||!eventActors(s).includes(target)||!validPeriodic(effect))throw new Error('Periodic recovery requires a local target and valid deadlines');
 const owned=simulationEventRuntime(s),storage=s.simulationEvents;
 for(const id of owned.periodicsByTarget.get(target.id)||[]){const timer=storage.periodics[id];if(!periodicMatches(owned,id,target,timer)){if(!timer.ready)owned.queue.cancel(timer.eventSequence);retirePeriodic(storage,owned,id);}}
 if(effect.until<=s.clock||target.hp<=0)return effect;
 if(owned.periodicCount>=PERIODIC_CAPACITY)throw new Error('Persistent periodic capacity exceeded');
 const id=storage.periodicSequence+1;if(!Number.isSafeInteger(id))throw new Error('Persistent periodic sequence exhausted');
 const timer={id,targetId:target.id,container,next:effect.next,until:effect.until,atMs:0,ready:false,eventSequence:null};
 storage.periodicSequence=id;effect.periodicEventId=id;(target[container]??=[]).push(effect);storage.periodics[id]=timer;owned.periodicCount++;owned.periodicBindings.set(id,{target,effect});
 if(!owned.periodicsByTarget.has(target.id))owned.periodicsByTarget.set(target.id,new Set());owned.periodicsByTarget.get(target.id).add(id);
 armPeriodic(s,owned,timer);return effect;
}
export function preparePeriodicEffects(s){if(s.simulationEvents)advanceSimulationEvents(s,PERIODIC_PHASE);}
export function duePeriodicEffects(s,target,container){
 if(!s.simulationEvents)return noDots;
 const owned=simulationEventRuntime(s),ready=owned.readyPeriodicsByTarget.get(target.id);if(!ready?.size)return noDots;
 return [...ready].filter(id=>{const timer=s.simulationEvents.periodics[id];return timer.container===container&&periodicMatches(owned,id,target,timer);}).sort((a,b)=>a-b).map(id=>owned.periodicBindings.get(id).effect);
}
export function continuePeriodicEffect(s,target,effect){
 const owned=simulationEventRuntime(s),storage=s.simulationEvents,timer=storage.periodics[effect.periodicEventId];
 if(!timer?.ready||!periodicMatches(owned,timer.id,target,timer))throw new Error('Periodic recovery must be ready before continuing');
 effect.next+=effect.interval;timer.next=effect.next;
 if(effect.until<=s.clock&&effect.next>effect.until){retirePeriodic(storage,owned,timer.id);return;}
 armPeriodic(s,owned,timer);
}
export function expirePeriodicEffect(s,effect){
 if(effect.until>s.clock)return;
 const owned=simulationEventRuntime(s);retirePeriodic(s.simulationEvents,owned,effect.periodicEventId);
}
