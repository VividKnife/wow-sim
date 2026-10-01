import test from 'node:test';
import assert from 'node:assert/strict';
import {rebaseSimulation} from '../src/simulation-clock.ts';
import {createGame, advanceOwned, stats} from '../src/rules/engine.js';
import {classDefinitions} from '../src/rules/catalog.js';
import {startCombat} from '../src/rules/combat.js';
import {addPeriodicEffect, simulationEventRuntime, preparePeriodicEffects} from '../src/rules/simulation-events.js';
import {tickClassEffects} from '../src/rules/class-mechanics.js';
import type {Rules} from '../src/model.ts';

function fixture(): Rules {
  const s = createGame('入本前恢复', 283, 9000, {classId:5, raceId:1, characterId:'healer'});
  s.level=60; s.hp=100; s.mana=0; s.rules=[];
  addPeriodicEffect(s,s,'hots',{spell:139,name:'Renew',caster:s.id,amount:10,next:1000,interval:1000,until:3000});
  return s;
}

test('clock transfer preserves actual out-of-combat healing, final pulse, RNG and restore behavior',()=>{
  const original=fixture(), shifted=structuredClone(original);
  const oldQueue=shifted.simulationEvents.queue;
  // Attach a runtime before translation: its cached bindings must not survive.
  simulationEventRuntime(shifted);
  rebaseSimulation(shifted,1234567);
  assert.notEqual(shifted.simulationEvents.queue,oldQueue);
  assert.equal(shifted.simulationEvents.readySweepAt,-1);
  assert.equal(shifted.simulationEvents.queue.events[0].atMs,1235567);
  assert.equal(shifted.simulationEvents.periodicSequence,original.simulationEvents.periodicSequence);
  assert.equal(shifted.simulationEvents.queue.nextSequence,original.simulationEvents.queue.nextSequence);
  assert.doesNotThrow(()=>simulationEventRuntime(shifted));
  const restored=JSON.parse(JSON.stringify(shifted));
  for(const state of [original,shifted,restored])advanceOwned(state,14000);
  for(const state of [shifted,restored]){
    rebaseSimulation(state,original.clock);
    assert.deepEqual(state,original);
  }
  assert.equal(original.logs.filter((l:Rules)=>l.kind==='heal').length,3);
});

test('a dispatched periodic effect resumes once on the destination clock',()=>{
  const s=fixture();s.clock=1000;preparePeriodicEffects(s);
  assert.equal(s.simulationEvents.periodics[1].ready,true);
  rebaseSimulation(s,8000);
  const restored=structuredClone(s);
  for(const state of [s,restored]){
    tickClassEffects(state,[state],{});tickClassEffects(state,[state],{});
    assert.equal(state.hp,110);
    assert.equal(state.hots[0].next,9000);
  }
  assert.deepEqual(s,restored);
});

test('wall-clock NPC recruitment, creation and dungeon limits stay fixed; cooldowns and auction time translate',()=>{
  const s:Rules={clock:1000,wallAt:9000,createdAt:8000,nextTick:1100,
    cooldowns:{116:1800,133:0},globalCooldowns:{133:2500},itemCooldowns:{'item:1':1300},
    categoryCooldowns:{1:{spellId:116,until:4000}},hearthReady:0,
    quests:{1:{acceptedAt:0,expiresAt:0}},dungeonEntries:[8500,8900],
    auctions:[{createdAt:0,endsAt:30000,item:{id:1,count:2}}],
    npcWorld:{board:{refreshAt:10000},residents:[{lastProgressWall:7000,unit:{lastManaUse:-5000,buffs:{armor:{until:2000}}}}]},
    combat:{policy:{slots:{healer:{next:1200,reaction:1100,dirty:1050,inflight:0,sequence:2}}}},
    serverBuffs:[{startsAt:0,until:5000}],movementTask:{receivedAt:0,updatedAt:0,retryAt:0},
    rngState:283,itemSequence:7};
  rebaseSimulation(s,10000);
  assert.equal(s.wallAt,9000);assert.equal(s.createdAt,8000);
  assert.equal(s.npcWorld.board.refreshAt,10000);assert.equal(s.npcWorld.residents[0].lastProgressWall,7000);
  assert.deepEqual(s.dungeonEntries,[8500,8900]);
  assert.deepEqual(s.globalCooldowns,{133:11500});assert.deepEqual(s.itemCooldowns,{'item:1':10300});
  assert.equal(s.categoryCooldowns[1].until,13000);assert.equal(s.cooldowns[133],0);assert.equal(s.hearthReady,0);
  assert.deepEqual(s.quests[1],{acceptedAt:9000,expiresAt:0});
  assert.equal(s.auctions[0].createdAt,9000);assert.equal(s.auctions[0].endsAt,39000);
  assert.equal(s.npcWorld.residents[0].unit.lastManaUse,4000);
  assert.deepEqual(s.serverBuffs,[{startsAt:9000,until:14000}]);
  assert.deepEqual(s.movementTask,{receivedAt:9000,updatedAt:9000,retryAt:0});
  assert.deepEqual(s.combat.policy.slots.healer,{next:10200,reaction:10100,dirty:10050,inflight:9000,sequence:2});
  assert.equal(s.rngState,283);assert.equal(s.itemSequence,7);
});

test('shared object references shift only once, and invalid ranges leave the entire input unchanged',()=>{
  const aura={until:3000},s:Rules={clock:1000,buffs:{aura},auras:[aura]};
  rebaseSimulation(s,2000);assert.equal(aura.until,4000);
  const bad=fixture();bad.cooldowns={116:Number.MAX_SAFE_INTEGER};
  const before=structuredClone(bad);
  assert.throws(()=>rebaseSimulation(bad,2000),/clock range/);assert.deepEqual(bad,before);
  for(const target of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>rebaseSimulation(bad,target),/clock/);
});

for (const definition of classDefinitions) test(`class ${definition.id}: translating an active combat preserves continuation and recorded presentation`,()=>{
  const original:Rules=createGame('clock',283,0,{classId:definition.id,raceId:definition.races[0]});
  original.level=20;original.hp=stats(original).maxHp;original.mana=stats(original).maxMana;
  startCombat(original,[299]);advanceOwned(original,1000);
  const shifted=structuredClone(original);rebaseSimulation(shifted,1000000);
  assert.doesNotThrow(()=>simulationEventRuntime(shifted));
  for(const state of [original,shifted])advanceOwned(state,3000);
  rebaseSimulation(shifted,original.clock);
  assert.deepEqual(shifted,original);
});
