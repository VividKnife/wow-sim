import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat} from '../src/rules/combat.js';
import {finishCombat} from '../src/rules/combat-metrics.js';
import {castEnemySpell,tickEnemyAuras} from '../src/rules/enemy-spells.js';
import {simulationEventRuntime,clearCombatEvents} from '../src/rules/simulation-events.js';
import {addEnemyAura,prepareEnemyAuras} from '../src/rules/enemy-aura-events.js';
const clone=s=>JSON.parse(JSON.stringify(s));
function fixture(){const s=createGame('敌方光环事件',283,0,{classId:8,raceId:1});s.id='actor';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;}
function add(s,target=s,extra={}){return addEnemyAura(s,target,{spell:172,effect:1,type:3,amount:10,school:5,caster:'enemy',casterName:'敌人',interval:1000,next:s.clock+1000,until:s.clock+3000,...extra});}
function step(s,at,hurt=(_s,_e,target,amount)=>{target.hp=Math.max(0,target.hp-amount);}){s.clock=at;tickEnemyAuras(s,[s,...s.party],hurt);}
const timers=s=>Object.values(s.simulationEvents.enemyAuras);

test('last periodic hit occurs at expiry and cold restoration retains exact state',()=>{
 const s=fixture(),hp=s.hp;add(s);step(s,900);assert.equal(s.hp,hp);const restored=clone(s);
 for(const x of [s,restored]){for(const at of [1000,2000,3000,4000])step(x,at);assert.equal(x.hp,hp-30);assert.deepEqual(x.auras,[]);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});
test('damage survives caster death and encounter completion without a new reward or new aura identity',()=>{
 const s=fixture();startCombat(s,[299]);const enemy=s.combat.enemies[0],a=add(s,s,{caster:enemy.id});enemy.hp=0;const id=a.enemyAuraEventId;finishCombat(s);const restored=clone(s);
 for(const x of [s,restored]){const hp=x.hp;assert.equal(x.auras[0].enemyAuraEventId,id);step(x,3000);assert.equal(x.hp,hp-30);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});
test('same-time immunity is checked against each pulse time, before expiry cleanup',()=>{
 const s=fixture(),hp=s.hp;add(s);addEnemyAura(s,s,{spell:999,effect:1,type:39,misc:1<<5,positive:true,until:2000});step(s,3000);assert.equal(s.hp,hp-10);
});
test('refresh removes exact old events and keeps repeated refreshes bounded',()=>{
 const s=fixture();const other=add(s,s,{spell:980});let first;
 for(let i=0;i<2000;i++){const aura=add(s);first??=aura.enemyAuraEventId;}
 assert.equal(timers(s).length,2);assert.equal(s.simulationEvents.queue.events.length,2);assert.notEqual(s.auras[1].enemyAuraEventId,first);assert.equal(s.auras[0],other);
 const restored=clone(s);for(const x of [s,restored]){const hp=x.hp;step(x,1000);assert.equal(x.hp,hp-20);}assert.deepEqual(s,restored);
});
test('dispel before dispatch and after readiness suppresses only that aura',()=>{
 for(const ready of [false,true]){const s=fixture(),hp=s.hp;add(s);add(s,s,{spell:980});s.clock=1000;if(ready)prepareEnemyAuras(s);s.auras=s.auras.filter(a=>a.spell!==172);const restored=clone(s);
  for(const x of [s,restored]){step(x,1000);assert.equal(x.hp,hp-10);assert.equal(timers(x).length,1);}assert.deepEqual(s,restored);
 }
});
test('reusing a target id cannot deliver an old object aura to its replacement',()=>{
 const s=fixture(),member=fixture();member.id='companion';s.party=[member];add(s,member);const replacement=fixture();replacement.id=member.id;s.party=[replacement];const restored=clone(s);
 for(const x of [s,restored]){const hp=x.party[0].hp;step(x,3000);assert.equal(x.party[0].hp,hp);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});
test('damage stops on death instead of delivering all overdue pulses',()=>{
 const s=fixture();s.hp=15;add(s);let hits=0;step(s,3000,(_s,_e,target,amount)=>{hits++;target.hp=Math.max(0,target.hp-amount);});assert.equal(hits,2);assert.equal(s.hp,0);assert.deepEqual(timers(s),[]);
});
test('actual Whirlwind trigger restores and preserves RNG, damage order and expiry',()=>{
 const s=fixture();startCombat(s,[3975],true);const e=s.combat.enemies[0];s.position=e.position;s.positionY=e.positionY;
 assert.ok(castEnemySpell(s,e,e,8989,[s],()=>{},2));assert.ok(timers(s).length);const restored=clone(s),results=[];
 for(const x of [s,restored]){const hits=[];for(let t=100;t<=15000;t+=100)step(x,t,(_s,c,target,amount,label,detail)=>hits.push({at:x.clock,caster:c.id,target:target.id,amount,label,detail}));assert.ok(hits.length>0);results.push(hits);assert.deepEqual(timers(x),[]);}
 assert.deepEqual(results[0],results[1]);assert.deepEqual(s,restored);
});
test('temporarily absent caster preserves overdue trigger progress through restore',()=>{
 const s=fixture();startCombat(s,[3975],true);const e=s.combat.enemies[0];s.position=e.position;s.positionY=e.positionY;
 add(s,s,{type:23,trigger:15577,caster:e.id,until:5000});e.removed=true;step(s,1000,()=>assert.fail('missing caster'));assert.equal(timers(s)[0].ready,true);assert.equal(s.auras[0].next,1000);const restored=clone(s),results=[];
 for(const x of [s,restored]){x.combat.enemies[0].removed=false;const hits=[];step(x,2000,(_s,_e,_t,n)=>hits.push(n));assert.ok(hits.length>0);assert.equal(x.auras[0].next,3000);results.push(hits);}assert.deepEqual(results[0],results[1]);assert.deepEqual(s,restored);
});
test('unavailable trigger expires without accumulating new events',()=>{
 const s=fixture();add(s,s,{type:23,trigger:15577});step(s,1000);assert.equal(timers(s)[0].ready,true);assert.equal(s.simulationEvents.queue.events.length,0);const restored=clone(s);
 for(const x of [s,restored]){step(x,3000);assert.deepEqual(timers(x),[]);assert.deepEqual(x.auras,[]);}assert.deepEqual(s,restored);
});
test('expiry before first pulse does not fabricate periodic damage',()=>{
 const s=fixture(),hp=s.hp;add(s,s,{next:3000,until:1500});step(s,1500);assert.equal(s.hp,hp);assert.deepEqual(timers(s),[]);
});
test('deadlines retain the nonzero 100ms lattice',()=>{
 const s=fixture();s.clock=17;s.nextTick=117;add(s,s,{next:1048,until:2548});assert.equal(s.simulationEvents.queue.events[0].atMs,1117);const hp=s.hp;step(s,1017);assert.equal(s.hp,hp);step(s,1117);assert.equal(s.hp,hp-10);
});
test('hot idle aura pass does not inspect every aura type for periodic work',()=>{
 const s=fixture();add(s);let checks=0;
 for(let i=0;i<1000;i++)s.auras.push({spell:100000+i,until:10000,get type(){checks++;return 22;}});
 for(let t=100;t<1000;t+=100)step(s,t);assert.equal(checks,0);
});
test('restoration rejects missing, duplicate and corrupted aura identities and cursors',()=>{
 const s=fixture();add(s);
 for(const mutate of [x=>x.auras[0].enemyAuraEventId++,x=>x.auras[0].next++,x=>x.simulationEvents.enemyAuraSequence=0,x=>x.simulationEvents.queue.events.pop(),x=>x.auras.push({...x.auras[0]}),x=>x.simulationEvents.enemyAuras[1].ready=true,x=>x.simulationEvents.enemyAuras[1].targetId='other']){const bad=clone(s);mutate(bad);assert.throws(()=>simulationEventRuntime(bad),/aura|Aura/);}
});

test('death before expiry can checkpoint before the next pass clears the inert aura',()=>{
 const s=fixture();s.hp=15;add(s,s,{until:5000});step(s,2000);assert.equal(s.hp,0);assert.equal(s.auras.length,1);const restored=clone(s);
 for(const x of [s,restored]){simulationEventRuntime(x);step(x,2100);step(x,3000);assert.deepEqual(x.auras,[]);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('a nonparticipant retains its overdue aura until its owner resumes that unit',()=>{
 const s=fixture(),member=fixture();member.id='companion';s.party=[member];add(s,member);const hp=member.hp;
 startCombat(s,[299]);s.combat.participantIds=[s.id];s.clock=1000;tickEnemyAuras(s,[s],()=>assert.fail('nonparticipant cannot take damage in this rules pass'));
 const restored=clone(s);for(const x of [s,restored]){simulationEventRuntime(x);clearCombatEvents(x);x.combat=null;step(x,2000);assert.equal(x.party[0].hp,hp-20);assert.equal(x.party[0].auras[0].next,3000);}assert.deepEqual(s,restored);
});
test('departed recipients cannot leave a permanent ready timer behind',()=>{
 const s=fixture(),member=fixture();member.id='companion';s.party=[member];add(s,member);s.clock=1000;prepareEnemyAuras(s);s.party=[];const restored=clone(s);
 for(const x of [s,restored]){step(x,1100);assert.deepEqual(timers(x),[]);assert.equal(simulationEventRuntime(x).enemyAuras.ready.size,0);}assert.deepEqual(s,restored);
});
