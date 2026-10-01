import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick} from '../src/rules/combat.js';
import {finishCombat} from '../src/rules/combat-metrics.js';
import {tickEnemyAuras} from '../src/rules/enemy-spells.js';
import {simulationEventRuntime} from '../src/rules/simulation-events.js';
import {addGroundEffect,removeGroundEffects,dueGroundEffects,continueGroundEffect,expireGroundEffects} from '../src/rules/ground-events.js';
const clone=s=>JSON.parse(JSON.stringify(s));
function fixture(){const s=createGame('地面事件',283,0,{classId:8,raceId:1});s.id='actor';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];return s;}
function add(s,extra={}){return addGroundEffect(s,{caster:'enemy',spell:11829,casterName:'敌人',position:0,positionY:0,radius:8,amount:10,school:2,interval:1000,next:s.clock+1000,until:s.clock+3000,...extra});}
function step(s,at){s.clock=at;tickEnemyAuras(s,[s],(_s,_e,target,damage)=>{target.hp=Math.max(0,target.hp-damage);});}
const timers=s=>Object.values(s.simulationEvents.grounds);

test('hostile ground pulses retain the final tick and survive cold restoration without a living source',()=>{
 const s=fixture(),hp=s.hp;s.position=0;s.positionY=0;add(s);step(s,900);assert.equal(s.hp,hp);const restored=clone(s);
 for(const x of [s,restored]){for(const at of [1000,2000,3000,4000])step(x,at);assert.equal(x.hp,hp-30);assert.deepEqual(x.groundEffects,[]);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('range and death are rechecked for each individual overdue pulse',()=>{
 const s=fixture();s.hp=15;s.position=100;add(s);step(s,1000);assert.equal(s.hp,15);s.position=0;const restored=clone(s);
 for(const x of [s,restored]){step(x,3500);assert.equal(x.hp,0);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('nonperiodic ground expires without scheduling a useless pulse',()=>{
 const s=fixture();add(s,{interval:0,next:0,until:2500});assert.deepEqual(s.simulationEvents.queue.events.map(e=>e.kind),['GroundExpire']);step(s,2400);assert.equal(s.groundEffects.length,1);step(s,2500);assert.deepEqual(timers(s),[]);
});

test('refresh cancels exact pulse and expiry identities and keeps heap bounded',()=>{
 const s=fixture();const other=add(s,{caster:'other'});let first;
 for(let i=0;i<2000;i++){removeGroundEffects(s,a=>a.caster==='enemy');const area=add(s);first??=area.groundEventId;}
 assert.equal(timers(s).length,2);assert.equal(s.simulationEvents.queue.events.length,4);assert.notEqual(first,s.groundEffects[1].groundEventId);assert.equal(s.groundEffects[0],other);
 const restored=clone(s);for(const x of [s,restored]){const hp=x.hp;step(x,1000);assert.equal(x.hp,hp-20);}assert.deepEqual(s,restored);
});

test('removing an already dispatched zone prevents damage and leaves no timer on restore',()=>{
 const s=fixture(),hp=s.hp;add(s);s.clock=1000;assert.equal(dueGroundEffects(s,'enemy').length,1);removeGroundEffects(s);const restored=clone(s);
 for(const x of [s,restored]){step(x,3000);assert.equal(x.hp,hp);assert.deepEqual(timers(x),[]);assert.equal(x.simulationEvents.queue.events.length,0);}assert.deepEqual(s,restored);
});

test('encounter completion removes friendly zones but retains hostile ground until expiry',()=>{
 const s=fixture();startCombat(s,[299]);add(s);add(s,{side:'friendly',caster:s.id});finishCombat(s);assert.equal(s.groundEffects.length,1);assert.equal(timers(s).length,1);
 const restored=clone(s);for(const x of [s,restored]){x.position=0;x.positionY=0;const hp=x.hp;step(x,3000);assert.equal(x.hp,hp-30);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

for(const extended of [false,true])test(`actual ${extended?'extended':'ordinary'} player ground preserves its existing expiry-phase damage rule`,()=>{
 const s=fixture();startCombat(s,[299]);const e=s.combat.enemies[0];e.hp=e.maxHp=100000;e.nextAttack=e.nextSpell=e.nextAction=1e9;e.rootUntil=1e9;s.nextSwing=s.nextAction=1e9;
 add(s,{side:'friendly',extended,caster:s.id,spell:extended?26573:2120,effect:2,position:e.position,positionY:e.positionY,amount:10});const restored=clone(s);
 for(const x of [s,restored]){for(const at of [1000,2000,3000]){x.clock=at;combatTick(x);}const hits=x.logs.filter(l=>l.periodic&&l.spellId===(extended?26573:2120));assert.equal(hits.length,extended?2:3);assert.deepEqual(x.groundEffects,[]);assert.deepEqual(timers(x),[]);}assert.deepEqual(s,restored);
});

test('ground deadlines preserve the nonzero 100ms rule lattice',()=>{
 const s=fixture();s.clock=17;s.nextTick=117;add(s,{next:1048,until:2548});assert.deepEqual(s.simulationEvents.queue.events.map(e=>e.atMs).sort((a,b)=>a-b),[1117,2617]);const hp=s.hp;step(s,1017);assert.equal(s.hp,hp);step(s,1117);assert.equal(s.hp,hp-10);
});

test('restoration rejects missing, foreign, duplicate and corrupted ground references',()=>{
 const s=fixture();add(s);
 for(const mutate of [x=>x.groundEffects[0].groundEventId++,x=>x.groundEffects[0].next++,x=>x.simulationEvents.groundSequence=0,x=>x.simulationEvents.queue.events.pop(),x=>x.simulationEvents.grounds[1].scope=1,x=>x.groundEffects.push({...x.groundEffects[0]}),x=>x.simulationEvents.grounds[1].ready=true]){const bad=clone(s);mutate(bad);assert.throws(()=>simulationEventRuntime(bad),/ground|Ground/);}
});

function arenaFrame(data,teamId){const s=fixture();Object.assign(s,{teamId,clock:data.clock,nextTick:data.clock+100,arenaGroundTeams:data.teams,groundEffects:data.teams[teamId].groundEffects,simulationEvents:data.events});simulationEventRuntime(s);data.events=s.simulationEvents;return s;}
function finishFrame(data,s){data.teams[s.teamId].groundEffects=s.groundEffects;}
test('both arena teams share IDs and restore their own pulses; expired areas are reclaimed after the final extended tick',()=>{
 const data={clock:0,teams:[{groundEffects:[]},{groundEffects:[]}]};for(const i of [0,1]){const s=arenaFrame(data,i);add(s,{side:'friendly',extended:true,caster:`team${i}`});finishFrame(data,s);}
 assert.notEqual(data.teams[0].groundEffects[0].groundEventId,data.teams[1].groundEffects[0].groundEventId);const restored=clone(data);
 for(const d of [data,restored])for(const at of [1000,2000,3000]){d.clock=at;for(const i of at===2000?[1,0]:[0,1]){const s=arenaFrame(d,i),due=dueGroundEffects(s,'extended');assert.equal(due.length,1);assert.equal(due[0].caster,`team${i}`);due[0].next+=due[0].interval;continueGroundEffect(s,due[0]);expireGroundEffects(s);finishFrame(d,s);}if(at===3000){assert.ok(d.teams.every(t=>!t.groundEffects.length));assert.deepEqual(d.events.grounds,{});assert.equal(d.events.queue.events.length,0);}}
 assert.deepEqual(data,restored);
});
