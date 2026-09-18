import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {spells,classDefinitions} from '../../../packages/game-domain/src/rules/catalog.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {strategyAllows,waitingForPull} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {positionPartyMember,rescueTarget} from '../../../packages/game-domain/src/rules/combat-positioning.js';
import {petTick} from '../../../packages/game-domain/src/rules/class-mechanics.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {distance} from '../../../packages/sim-core/src/geometry.js';

function group(classId=8){
 let s=createGame('等待开怪',747,0,{classId,raceId:classDefinitions.find(c=>c.id===classId).races[0]});s.level=20;if(classId===8)s.learned.push(116);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s=recruitForTest(s,{type:'recruit',id:'warrior'},0);startCombat(s,[636,636],true);
 const tank=s.party[0];tank.rules=[];tank.nextAction=tank.nextSwing=100000;tank.position=28;tank.positionY=0;
 for(const [i,e] of s.combat.enemies.entries()){e.position=30;e.positionY=i;e.hp=e.maxHp=100000;e.target=tank.id;e.threat={[tank.id]:1000};e.rootUntil=e.nextAttack=e.nextSpell=100000;}
 return s;
}
const casts=s=>s.logs.filter(l=>l.actorId===s.id&&l.kind==='cast');
test('team DPS cannot begin a cast until three seconds even when tank threat is already positive',()=>{
 const s=group();s.rules=[{spell:116,condition:'always',value:0,enabled:true}];
 for(s.clock=0;s.clock<3000;s.clock+=100)combatTick(s);
 assert.equal(casts(s).length,0);assert.equal(s.cast,null);combatTick(s);assert.equal(s.cast?.spell,116);assert.equal(s.cast.startedAt,3000);
});
test('automatic ranged shots, mainhand and offhand attacks also observe the pull hold',()=>{
 for(const classId of [3,4]){const s=group(classId);s.rules=[];s.position=classId===3?5:27;for(s.clock=0;s.clock<3000;s.clock+=100)combatTick(s);assert.equal(s.logs.some(l=>l.actorId===s.id&&l.kind==='damage'),false);}
});
test('time alone cannot release an unheld target or unsafe splash target',()=>{
 const s=group(),[held,loose]=s.combat.enemies;s.clock=3000;const sp=spellInfo(s,2120);
 loose.threat={};assert.equal(strategyAllows(s,s,held,sp),false);loose.threat={[s.party[0].id]:100};loose.target=s.id;assert.equal(strategyAllows(s,s,held,sp),false);
 loose.target=s.party[0].id;assert.equal(strategyAllows(s,s,held,sp),true);
});
test('healing can start immediately while damage waits',()=>{
 const s=group(5);s.party[0].hp=1;s.learned.push(2050);s.rules=[{spell:2050,condition:'allyHealthBelow',value:50,enabled:true}];combatTick(s);
 assert.equal(s.cast?.target,s.party[0].id);assert.equal(spells[s.cast?.spell]?.SpellName,'Lesser Heal');
});
test('solo, absent tank, dead tank and explicit opt-out do not stall damage',()=>{
 const s=group(),e=s.combat.enemies[0],sp=spellInfo(s,116);s.strategyPolicy={waitForTank:false};assert.equal(strategyAllows(s,s,e,sp),true);
 delete s.strategyPolicy;s.party[0].hp=0;assert.equal(strategyAllows(s,s,e,sp),true);
 s.party[0].hp=100;s.party[0].strategyPolicy={role:'melee'};assert.equal(strategyAllows(s,s,e,sp),true);
 s.party=[];assert.equal(strategyAllows(s,s,e,sp),true);
});
test('pull timing survives serialization and resets on each encounter',()=>{
 const s=group();s.clock=2500;const restored=JSON.parse(JSON.stringify(s));assert.equal(waitingForPull(restored,restored),true);restored.clock=3000;assert.equal(waitingForPull(restored,restored),false);
 startCombat(restored,[636],true);assert.equal(waitingForPull(restored,restored),true);
});
test('pets wait with their owner before moving or attacking',()=>{
 const s=group(3),pet={id:'pet',ownerId:s.id,hp:100,petUnit:true,position:0,positionY:0,mode:'attack',cast:null};s.pet=pet;
 const before=pet.position;let attacks=0;petTick(s,pet,[s,...s.party,pet],()=>attacks++);assert.equal(attacks,0);assert.equal(pet.position,before);
});
test('a fresh team pull targets the tank without granting fake threat',()=>{
 const s=group();startCombat(s,[636],true);const e=s.combat.enemies[0];assert.equal(e.target,s.party[0].id);assert.deepEqual(e.threat,{});
});
test('a ranged actor with aggro brings the enemy toward the tank and stays nearby',()=>{
 const s=group(),tank=s.party[0],e=s.combat.enemies[0];s.clock=4000;s.position=-15;e.position=-10;e.target=s.id;
 const before=distance(s,tank);positionPartyMember(s,s,e);assert.ok(distance(s,tank)<before);
 s.position=24;s.positionY=0;e.position=23;e.positionY=0;assert.equal(positionPartyMember(s,s,e),false);assert.equal(s.position,24);
});
test('tank rotates to untagged enemies after establishing the first target',()=>{
 const s=group(),tank=s.party[0],[held,untagged]=s.combat.enemies;untagged.threat={};assert.equal(rescueTarget(s,tank,[held,untagged]),untagged);
});
test('opening delay validates and survives strategy/client projection',()=>{
 const s=group();const next=act(s,{type:'strategy',rules:[],policy:{waitForTank:true,protectCC:true,pullDelaySeconds:5}},0);
 const result=projectClientSnapshot(next,view(next));assert.equal(result.view.strategyMembers[0].policy.pullDelaySeconds,5);
 next.clock=4999;assert.equal(waitingForPull(next,next),true);next.clock=5000;assert.equal(waitingForPull(next,next),false);
 for(const value of [-1,11,1.5,NaN,'3',null])assert.throws(()=>act(s,{type:'strategy',rules:[],policy:{waitForTank:true,protectCC:true,pullDelaySeconds:value}},0),/策略/);
});

test('offensive totems can be prepared but do not deal damage during the hold',()=>{
 const s=group(7);s.learned.push(3599);s.position=15;s.strategyPolicy={role:'melee'};s.rules=[{spell:3599,condition:'always',value:0,enabled:true}];
 for(s.clock=0;s.clock<3000;s.clock+=100)combatTick(s);
 assert.ok(s.totems?.fire);assert.equal(s.logs.some(l=>l.actorId===s.id&&l.spellId===3599&&l.kind==='damage'),false);
 for(;s.clock<=4500;s.clock+=100)combatTick(s);
 assert.ok(s.logs.some(l=>l.actorId===s.id&&l.spellId===3599&&l.kind==='damage'));
});


test('safe backline holds position regardless of distance to tank-held enemies',()=>{
 for(const classId of [8,5,3,9])for(const gap of [4,15,22,31,45]){
  const s=group(classId);s.clock=4000;const e=s.combat.enemies[0];
  s.position=e.position-gap;s.positionY=0;
  const before=[s.position,s.positionY];
  for(let tick=0;tick<50;tick++)assert.equal(positionPartyMember(s,s,e),false);
  assert.deepEqual([s.position,s.positionY],before);
 }
});
test('safe short-range caster attacks instead of alternating approach and retreat',()=>{
 const s=group();s.clock=4000;s.position=10;s.positionY=0;
 s.learned.push(2136);s.rules=[{spell:2136,condition:'always',value:0,enabled:true}];
 const before=[s.position,s.positionY];
 for(;s.clock<6000;s.clock+=100)combatTick(s);
 assert.deepEqual([s.position,s.positionY],before);
 assert.ok(s.logs.some(l=>l.actorId===s.id&&l.spellId===2136));
});
