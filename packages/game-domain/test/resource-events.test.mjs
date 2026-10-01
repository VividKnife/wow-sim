import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick} from '../src/rules/combat.js';
import {simulationEventRuntime,prepareActorCasts,takePowerRegenReady} from '../src/rules/simulation-events.js';
import {summonClassPet,petSpellTick} from '../src/rules/class-spell-effects.js';
import {spellInfo} from '../src/rules/character.js';
function fixture(classId=4){
 const s=createGame('恢复事件',283,0,{classId,raceId:classId===11?4:1});s.id='actor';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.learned=[];s.rules=[];
 startCombat(s,[299]);s.nextSwing=1e9;s.energy=0;
 Object.assign(s.combat.enemies[0],{hp:100000,maxHp:100000,level:1,nextAttack:1e9,nextSpell:1e9,rootUntil:1e9,ai:{nextCheck:1e9}});
 return s;
}
function run(s,until){while(s.clock<until){s.clock+=100;combatTick(s);}}
test('energy uses one heap deadline and keeps the 2-second phase through JSON restoration',()=>{
 const s=fixture();run(s,1900);assert.equal(s.energy,0);
 assert.equal(s.simulationEvents.queue.events.filter(e=>e.kind==='ResourceRegen').length,1);
 const restored=JSON.parse(JSON.stringify(s));run(s,6100);run(restored,6100);
 assert.equal(s.energy,60);assert.equal(s.nextPowerRegen,8000);assert.deepEqual(s,restored);
});
test('PvE control delays consumption while PvP regenerates before control at the same deadline',()=>{
 for(const pvp of [false,true]){
  const s=fixture();s.pvp=pvp;run(s,100);s.stunUntil=2500;run(s,2100);
  assert.equal(s.energy,pvp?20:0);
  const restored=JSON.parse(JSON.stringify(s));run(s,4100);run(restored,4100);
  assert.equal(s.energy,40);assert.deepEqual(s,restored);
 }
});
test('late readiness preserves overdue pulse order without re-inserting a completed event phase',()=>{
 const s=fixture();assert.equal(takePowerRegenReady(s,s),false);
 s.clock=7100;prepareActorCasts(s);assert.equal(takePowerRegenReady(s,s),true);
 const restored=JSON.parse(JSON.stringify(s));simulationEventRuntime(restored);
 for(const x of [s,restored]){assert.equal(takePowerRegenReady(x,x),true);assert.equal(takePowerRegenReady(x,x),true);assert.equal(takePowerRegenReady(x,x),false);assert.equal(x.nextPowerRegen,8000);}
 assert.deepEqual(s,restored);
});
test('pet mana and focus regenerate once, and a replacement with the same public ID cannot inherit its timer',()=>{
 const s=fixture(9);summonClassPet(s,s,spellInfo(s,688));let pet=s.pet;pet.maxMana=100;pet.mana=0;pet.focus=0;
 const step=()=>petSpellTick(s,s.pet,s,s.combat.enemies[0],[s,s.pet],{});
 step();s.clock=2000;prepareActorCasts(s);step();assert.equal(pet.mana,5);assert.equal(pet.focus,24);
 const oldId=pet.powerEventId;s.clock=2500;summonClassPet(s,s,spellInfo(s,688));pet=s.pet;pet.maxMana=100;pet.mana=0;pet.focus=0;step();assert.notEqual(pet.powerEventId,oldId);
 s.clock=4000;prepareActorCasts(s);step();assert.equal(pet.mana,0);assert.equal(pet.focus,0);
 const restored=JSON.parse(JSON.stringify(s));for(const x of [s,restored]){x.clock=4500;prepareActorCasts(x);petSpellTick(x,x.pet,x,x.combat.enemies[0],[x,x.pet],{});assert.equal(x.pet.mana,5);assert.equal(x.pet.focus,24);}
 assert.deepEqual(s,restored);
});
test('unrelated actor classes create no empty resource events',()=>{
 const s=fixture(8);assert.equal(s.nextPowerRegen,undefined);assert.equal(takePowerRegenReady(s,s),false);assert.equal(s.simulationEvents,undefined);
});
test('restoration rejects missing, duplicate and early resource deadlines',()=>{
 const s=fixture();takePowerRegenReady(s,s);
 for(const alter of [x=>x.simulationEvents.queue.events.pop(),x=>x.simulationEvents.resources[x.powerEventId].atMs--,x=>x.simulationEvents.resources[x.powerEventId].ready=true,x=>x.simulationEvents.resourceSequence=0,x=>x.nextPowerRegen++,x=>x.simulationEvents.resources[x.powerEventId].actorId='foreign']){
  const invalid=JSON.parse(JSON.stringify(s));alter(invalid);assert.throws(()=>simulationEventRuntime(invalid),/resource|Resource|heap|Heap/);
 }
});

test('death retires its deadline and resurrection cannot duplicate the ready pulse',()=>{
 const s=fixture();takePowerRegenReady(s,s);const id=s.powerEventId;s.hp=0;s.clock=2000;prepareActorCasts(s);
 assert.equal(s.simulationEvents.resources[id],undefined);assert.equal(takePowerRegenReady(s,s),false);
 const restored=JSON.parse(JSON.stringify(s));for(const x of [s,restored]){x.hp=100;x.clock=2500;assert.equal(takePowerRegenReady(x,x),true);assert.notEqual(x.powerEventId,id);assert.equal(takePowerRegenReady(x,x),false);}
 assert.deepEqual(s,restored);
});
test('druid resource phase survives changing into cat form between pulses',()=>{
 const s=fixture(11);s.energy=0;run(s,2500);assert.equal(s.energy,0);assert.equal(s.nextPowerRegen,4000);
 s.form='cat';run(s,4100);assert.equal(s.energy,20);assert.equal(s.nextPowerRegen,6000);
});
