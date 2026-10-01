import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick} from '../src/rules/combat.js';
import {addCombatDot,simulationEventRuntime,dueCombatDots} from '../src/rules/simulation-events.js';
import {dispelSpellAuras} from '../src/rules/spell-aura-lifecycle.js';

function fixture(){
 const s=createGame('周期事件',283,0,{classId:9,raceId:1});s.id='actor';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.learned=[];s.rules=[];
 startCombat(s,[299]);s.nextAction=s.nextSwing=1e9;s.rootUntil=1e9;
 Object.assign(s.combat.enemies[0],{hp:10000,maxHp:10000,level:60,position:20,positionY:0,armor:0,nextAttack:1e9,nextSpell:1e9,rootUntil:1e9,ai:{nextCheck:1e9}});
 return s;
}
function add(s,extra={}){return addCombatDot(s,s.combat.enemies[0],{caster:s.id,spellId:703,amount:10,school:0,next:s.clock+1000,interval:1000,remaining:3,label:'测试流血',dispel:1,...extra});}
function step(s,at){s.clock=at;combatTick(s,{pvpTeam:true});}
const queued=s=>s.simulationEvents.queue.events.filter(e=>e.kind==='AuraPeriodic');

test('periodic damage keeps its final tick, exact RNG and event cursor across JSON restoration',()=>{
 const s=fixture();add(s);step(s,900);assert.equal(s.combat.enemies[0].hp,10000);assert.equal(queued(s).length,1);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){for(const at of [1000,2000,3000,4000])step(x,at);assert.equal(x.combat.enemies[0].hp,9970);assert.equal(x.combat.enemies[0].dots.length,0);assert.deepEqual(x.simulationEvents.dots,{});}
 assert.deepEqual(s,restored);
});

test('refresh at the original deadline replaces its precise holder and cancels the old pulse',()=>{
 const s=fixture(),e=s.combat.enemies[0],old=add(s);s.clock=1000;e.dots=e.dots.filter(d=>d!==old);const fresh=add(s,{amount:30});
 assert.notEqual(fresh.dotEventId,old.dotEventId);assert.equal(queued(s).length,1);assert.equal(s.simulationEvents.dots[old.dotEventId],undefined);
 step(s,1000);assert.equal(e.hp,10000);const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){step(x,2000);assert.equal(x.combat.enemies[0].hp,9970);}
 assert.deepEqual(s,restored);
});

test('same-time dispel of a dispatched effect prevents its damage without consuming random numbers',()=>{
 const s=fixture(),e=s.combat.enemies[0];add(s);s.clock=1000;assert.equal(dueCombatDots(s,e).length,1);const rng=s.rngState;
 assert.equal(dispelSpellAuras(e,[1],1,s,'negative'),1);const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){step(x,1000);assert.equal(x.combat.enemies[0].hp,10000);assert.equal(x.rngState,rng);step(x,1100);assert.deepEqual(x.simulationEvents.dots,{});}
 assert.deepEqual(s,restored);
});

test('caster death does not cancel an already applied periodic effect on a living recipient',()=>{
 const s=fixture();add(s);s.hp=0;const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){step(x,1000);assert.equal(x.combat.enemies[0].hp,9990);assert.equal(x.hp,0);}
 assert.deepEqual(s,restored);
});

test('recipient death stops later same-time pulses and clears only that recipient effects',()=>{
 const s=fixture(),e=s.combat.enemies[0];e.hp=5;add(s);add(s,{spell:133,effect:1,amount:20,label:'不应执行'});const rng=s.rngState;step(s,1000);assert.equal(s.rngState,rng,'a later spell pulse must not roll damage against the dead target');
 assert.equal(e.hp,0);assert.equal(s.logs.filter(l=>l.kind==='damage').length,1);assert.equal(s.logs.some(l=>l.action==='不应执行'),false);
 const restored=JSON.parse(JSON.stringify(s));for(const x of [s,restored]){step(x,1100);assert.deepEqual(x.simulationEvents.dots,{});assert.deepEqual(x.combat.enemies[0].dots,[]);simulationEventRuntime(JSON.parse(JSON.stringify(x)));}
 assert.deepEqual(s,restored);
});

test('late progression retains one pulse per combat pass, including a saved ready backlog',()=>{
 const s=fixture();add(s);step(s,3500);assert.equal(s.combat.enemies[0].hp,9990);
 const restored=JSON.parse(JSON.stringify(s));for(const x of [s,restored]){step(x,3500);assert.equal(x.combat.enemies[0].hp,9980);step(x,3500);assert.equal(x.combat.enemies[0].hp,9970);step(x,3500);assert.equal(x.combat.enemies[0].hp,9970);}
 assert.deepEqual(s,restored);
});

test('mana drain and leech use the same scheduling while applying their separate resource rules',()=>{
 const s=fixture(),e=s.combat.enemies[0];s.mana=0;s.hp=100;e.mana=25;add(s,{manaDrain:true,manaReturn:.5,amount:20});add(s,{leech:1,amount:10});
 step(s,1000);assert.equal(e.mana,5);assert.equal(s.mana,10);assert.equal(s.hp,110);assert.equal(e.hp,9990);
 const restored=JSON.parse(JSON.stringify(s));for(const x of [s,restored]){step(x,2000);assert.equal(x.combat.enemies[0].mana,0);assert.equal(x.mana,12.5);assert.equal(x.hp,120);}
 assert.deepEqual(s,restored);
});

test('replacement of a recipient with the same ID cannot receive its previous effects',()=>{
 const s=fixture(),old=s.combat.enemies[0];add(s);s.combat.enemies[0]={...old,dots:[]};const replacement=add(s,{amount:30});
 assert.equal(queued(s).length,1);assert.equal(Object.keys(s.simulationEvents.dots).length,1);
 step(s,1000);assert.equal(s.combat.enemies[0].hp,9970);assert.equal(old.hp,10000);assert.equal(s.combat.enemies[0].dots[0],replacement);
});

test('repeated refreshes keep one event; corrupt timer linkage cannot be restored',()=>{
 const s=fixture(),e=s.combat.enemies[0];for(let i=0;i<2000;i++){e.dots=[];add(s);}
 assert.equal(queued(s).length,1);assert.equal(Object.keys(s.simulationEvents.dots).length,1);
 for(const mutate of [x=>x.simulationEvents.queue.events.pop(),x=>x.simulationEvents.dotSequence=0,x=>x.combat.enemies[0].dots[0].dotEventId++,x=>x.combat.enemies[0].dots[0].next++,x=>x.simulationEvents.dots[x.combat.enemies[0].dots[0].dotEventId].ready=true]){
  const bad=JSON.parse(JSON.stringify(s));mutate(bad);assert.throws(()=>simulationEventRuntime(bad),/periodic|Periodic/);
 }
});
