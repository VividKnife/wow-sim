import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advanceOwned} from '../src/rules/engine.js';
import {talents,spells} from '../src/rules/catalog.js';
import {onTalentEvent,executeTalentActive} from '../src/rules/talent-runtime.js';
import {startCombat} from '../src/rules/combat.js';
import {finishCombat} from '../src/rules/combat-metrics.js';
import {tickClassEffects} from '../src/rules/class-mechanics.js';
import {addPeriodicEffect,simulationEventRuntime,preparePeriodicEffects,addCombatDot} from '../src/rules/simulation-events.js';

function fixture(){const s=createGame('持续恢复',283,0,{classId:5,raceId:1});s.id='actor';s.level=60;s.hp=100;s.mana=0;s.rules=[];return s;}
function add(s,extra={},container='hots',target=s){return addPeriodicEffect(s,target,container,{spell:139,name:'Renew',caster:s.id,amount:10,next:s.clock+1000,interval:1000,until:s.clock+3000,...extra});}
function step(s,at){s.clock=at;tickClassEffects(s,[s,...s.party],{});}
const clone=s=>JSON.parse(JSON.stringify(s));
const timers=s=>Object.values(s.simulationEvents.periodics);

test('healing retains its final pulse and exact state after out-of-combat restoration',()=>{
 const s=fixture();add(s);step(s,900);assert.equal(s.hp,100);const restored=clone(s);
 for(const x of [s,restored]){for(const at of [1000,2000,3000,4000])step(x,at);assert.equal(x.hp,130);assert.deepEqual(timers(x),[]);assert.deepEqual(x.hots,[]);}
 assert.deepEqual(s,restored);
});

test('encounter boundaries retire combat deadlines while preserving healing and lifetime sequences',()=>{
 const s=fixture();startCombat(s,[299]);add(s);addCombatDot(s,s.combat.enemies[0],{caster:s.id,spellId:703,amount:10,school:0,next:1000,interval:1000,remaining:3,label:'测试流血'});
 const storage=s.simulationEvents;step(s,1000);const sequence=storage.queue.nextSequence;finishCombat(s);
 assert.equal(s.simulationEvents,storage);assert.deepEqual(storage.dots,{});assert.equal(storage.queue.events.length,1);assert.equal(storage.queue.nextSequence,sequence);
 const restored=clone(s);for(const x of [s,restored]){step(x,2000);startCombat(x,[299]);step(x,3000);assert.equal(x.hp,130);assert.deepEqual(timers(x),[]);assert.ok(x.simulationEvents.queue.nextSequence>sequence);}
 assert.deepEqual(s,restored);
});

test('effect survives the last pulse until its separate expiry deadline',()=>{
 const s=fixture();add(s,{until:2500});step(s,2000);assert.equal(s.hp,120);assert.equal(s.hots.length,1);assert.equal(s.simulationEvents.queue.events[0].atMs,2500);
 const restored=clone(s);for(const x of [s,restored]){step(x,2500);assert.equal(x.hp,120);assert.deepEqual(x.hots,[]);}assert.deepEqual(s,restored);
});

test('refresh cancels the exact old timer and preserves a bounded heap',()=>{
 const s=fixture();let first;for(let i=0;i<2000;i++){s.hots=[];const effect=add(s);first??=effect.periodicEventId;}
 assert.equal(timers(s).length,1);assert.equal(s.simulationEvents.queue.events.length,1);assert.notEqual(s.hots[0].periodicEventId,first);step(s,1000);assert.equal(s.hp,110);
});

test('consuming a dispatched effect prevents its healing before and after restoration',()=>{
 const s=fixture();add(s);s.clock=1000;preparePeriodicEffects(s);s.hots=[];const restored=clone(s);
 for(const x of [s,restored]){step(x,1000);assert.equal(x.hp,100);step(x,1100);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('a dead source does not cancel applied healing, but a dead recipient cannot be revived by it',()=>{
 const s=fixture(),source=fixture();source.id='healer';source.hp=0;s.party=[source];add(s,{caster:source.id});step(s,1000);assert.equal(s.hp,110);
 s.hp=0;const restored=clone(s);for(const x of [s,restored]){step(x,2000);assert.equal(x.hp,0);assert.deepEqual(x.hots,[]);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('late healing catches up every legitimate pulse once',()=>{
 const s=fixture();add(s);s.clock=3500;preparePeriodicEffects(s);const restored=clone(s);
 for(const x of [s,restored]){step(x,3500);step(x,3500);assert.equal(x.hp,130);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('periodic mana recovery uses its own effect type and resource cap',()=>{
 const s=fixture();s.mana=stats(s).maxMana-15;add(s,{type:24},'periodicClass');step(s,1000);assert.equal(s.mana,stats(s).maxMana-5);
 const restored=clone(s);for(const x of [s,restored]){step(x,3000);assert.equal(x.mana,stats(x).maxMana);assert.deepEqual(x.periodicClass,[]);}assert.deepEqual(s,restored);
});

test('noncombat resurrection casts coexist with restored persistent recovery',()=>{
 const s=fixture();add(s);s.cast={spell:2006,target:'fallen',until:10000};const restored=clone(s);assert.doesNotThrow(()=>simulationEventRuntime(restored));step(restored,1000);assert.equal(restored.hp,110);assert.equal(restored.cast.spell,2006);
});

test('an idle advance cannot skip queued healing',()=>{
 const s=fixture();add(s);advanceOwned(s,5000);assert.equal(s.logs.filter(l=>l.kind==='heal').length,3);assert.deepEqual(timers(s),[]);
});

test('restoration rejects corrupt effect identity, deadline, sequence and event linkage',()=>{
 const s=fixture();add(s);for(const mutate of [x=>x.hots[0].periodicEventId++,x=>x.hots[0].next++,x=>x.simulationEvents.periodicSequence=0,x=>x.simulationEvents.queue.events.pop(),x=>x.simulationEvents.queue.events[0].phase=60]){const bad=clone(s);mutate(bad);assert.throws(()=>simulationEventRuntime(bad),/periodic|Periodic/);}
});

for(const [classId,name,spellId]of [[1,'Blood Craze',16491],[5,'Blessed Recovery',27813]])test(`${name} registers critical-hit healing and restores every pulse`,()=>{
 const s=createGame(name,283,0,{classId,raceId:1});s.id='actor';s.level=60;s.hp=100;s.rules=[];
 const talent=Object.values(talents).find(t=>t.classId===classId&&t.name===name);s.talents[talent.id]=3;
 onTalentEvent(s,s,{type:'incoming',critical:true,amount:300,spell:{School:0}}, {stats});
 assert.equal(s.hots.length,1);assert.ok(Number.isSafeInteger(s.hots[0].periodicEventId));
 const amount=Math.round(s.hots[0].amount),restored=clone(s);assert.doesNotThrow(()=>simulationEventRuntime(restored));
 for(const x of [s,restored]){step(x,1999);assert.equal(x.hp,100);for(const at of [2000,4000,6000])step(x,at);assert.equal(x.hp,100+3*amount);assert.equal(x.logs.filter(l=>l.kind==='heal'&&l.spellId===spellId).length,3);assert.deepEqual(timers(x),[]);}
 assert.deepEqual(s,restored);
});

test('Lightwell registers its ally effect, spends one charge and preserves healing through encounter completion',()=>{
 const s=fixture(),ally=fixture();ally.id='ally';s.hp=stats(s).maxHp;s.party=[ally];startCombat(s,[299]);s.combat.participantIds=[s.id,ally.id];
 executeTalentActive(s,s,s,spells[724],{actors:[s,ally],stats});onTalentEvent(s,s,{type:'tick'},{actors:[s,ally],stats});
 assert.equal(s.lightwell.charges,4);assert.equal(ally.hots.length,1);assert.ok(Number.isSafeInteger(ally.hots[0].periodicEventId));
 onTalentEvent(s,s,{type:'tick'},{actors:[s,ally],stats});assert.equal(s.lightwell.charges,4);
 const effect={...ally.hots[0]};finishCombat(s);const restored=clone(s);assert.doesNotThrow(()=>simulationEventRuntime(restored));
 for(const x of [s,restored]){step(x,effect.until);const pulses=Math.floor(effect.until/effect.interval);assert.equal(x.party[0].hp,Math.min(stats(x.party[0]).maxHp,100+pulses*Math.round(effect.amount)));assert.deepEqual(x.party[0].hots,[]);assert.equal(x.lightwell.charges,4);}
 assert.deepEqual(s,restored);
});
