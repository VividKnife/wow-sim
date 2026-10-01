import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,commandCombatCast,combatTick} from '../src/rules/combat.js';
import {combatCommandAction} from '../src/rules/combat-command.js';
import {castEnemySpell,tickEnemySpell} from '../src/rules/enemy-spells.js';
import {beginEnemyCast,advanceSimulationEvents,simulationEventRuntime,CAST_CAPACITY} from '../src/rules/simulation-events.js';
import {launchProjectile,takeImpacts} from '../src/rules/combat-projectiles.js';

function fixture(){
 const s=createGame('事件读条法师',281,0,{classId:8,raceId:1});s.id='mage';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];s.learned.push(2139);
 startCombat(s,[636],true);delete s.combat.pull;
 const e=s.combat.enemies[0];Object.assign(e,{hp:50000,maxHp:50000,mana:10000,maxMana:10000,position:10,positionY:0,nextAction:0});
 s.position=0;s.positionY=0;s.nextAction=0;
 return {s,e};
}
const cast=(s,e)=>assert.equal(castEnemySpell(s,e,s,133,[s],()=>{}),true);
const finish=(s,e)=>tickEnemySpell(s,e,[s],()=>{});

test('real enemy casts share the projectile heap and complete once at the original rule boundary',()=>{
 const {s,e}=fixture();cast(s,e);const until=e.cast.until,eventId=e.cast.eventId;
 const events=s.simulationEvents.queue.events;assert.equal(events.length,1);assert.equal(events[0].kind,'CastComplete');
 s.clock=until-1;finish(s,e);assert.equal(e.cast.eventId,eventId);assert.equal(s.combat.projectiles.length,0);
 s.clock=until;takeImpacts(s,'friendly');assert.equal(s.simulationEvents.casts[eventId].ready,false,'projectile phase cannot complete later cast phase');
 finish(s,e);assert.equal(e.cast,null);assert.equal(s.combat.projectiles.length,1);assert.equal(Object.keys(s.simulationEvents.casts).length,0);
 finish(s,e);assert.equal(s.combat.projectiles.length,1);
 assert.ok(s.simulationEvents.queue.events.every(event=>event.kind==='ProjectileImpact'));
});

test('same-time player interruption invalidates the precise cast without additional scheduler RNG or projectile effects',()=>{
 const {s,e}=fixture();cast(s,e);s.clock=e.cast.until;
 commandCombatCast(s,s,2139,e.id);assert.equal(e.cast,null);const rng=s.rngState;
 advanceSimulationEvents(s,60);finish(s,e);
 assert.equal(s.rngState,rng);assert.equal(s.combat.projectiles.length,0);assert.deepEqual(s.simulationEvents.casts,{});
});

test('queued player interruption in the same combat pass precedes enemy completion',()=>{
 const {s,e}=fixture();cast(s,e);s.clock=e.cast.until;
 e.nextAttack=e.nextSpell=999999;
 combatCommandAction(s,{order:'cast',encounterId:s.combat.id,memberId:s.id,spellId:2139,targetId:e.id});
 combatTick(s);
 assert.equal(e.cast,null);assert.equal(s.combat.projectiles.length,0);
 assert.ok(e.schoolLockouts[2]>s.clock,'the interrupted fire school is locked');
 assert.equal(s.combat.command.results.at(-1).status,'started');
 assert.deepEqual(s.simulationEvents.casts,{});
});

test('checkpoint between deadline dispatch and effect resolution restores the identical ready cast and sequence',()=>{
 const {s,e}=fixture();cast(s,e);s.clock=e.cast.until;advanceSimulationEvents(s,60);
 const restored=JSON.parse(JSON.stringify(s));assert.ok(s.simulationEvents.casts[e.cast.eventId].ready);
 for(const state of [s,restored]){
  const caster=state.combat.enemies[0];finish(state,caster);state.clock+=100;caster.nextAction=0;caster.cooldowns={};caster.categoryCooldowns={};caster.globalCooldowns={};cast(state,caster);
 }
 assert.deepEqual(s,restored);assert.equal(e.cast.eventId,2);
});

test('death and reuse of the enemy slot cannot execute an earlier cast',()=>{
 const {s,e}=fixture();cast(s,e);const first=e.cast.eventId,until=e.cast.until;
 const replacement={...e,cast:null,cooldowns:{},categoryCooldowns:{},globalCooldowns:{},nextAction:0};
 s.combat.enemies[0]=replacement;s.clock=100;cast(s,replacement);assert.notEqual(replacement.cast.eventId,first);
 s.clock=until;advanceSimulationEvents(s,60);assert.equal(s.simulationEvents.casts[first],undefined);assert.equal(s.combat.projectiles.length,0);
 replacement.hp=0;s.clock=replacement.cast.until;finish(s,replacement);advanceSimulationEvents(s,60);
 assert.equal(s.combat.projectiles.length,0);assert.deepEqual(s.simulationEvents.casts,{});
});

test('cold adoption rejects missing timers, early readiness, wrong phase and changed cast metadata',()=>{
 const {s,e}=fixture();cast(s,e);
 for(const alter of [x=>{delete x.simulationEvents.casts[e.cast.eventId];},x=>{x.simulationEvents.queue.events[0].phase=20;},x=>{x.combat.enemies[0].cast.until++;},x=>{x.simulationEvents.queue.events=[];x.simulationEvents.casts[e.cast.eventId].ready=true;}]){
  const bad=JSON.parse(JSON.stringify(s));alter(bad);assert.throws(()=>simulationEventRuntime(bad),/cast|Cast/);
 }
 const missing=JSON.parse(JSON.stringify(s));delete missing.simulationEvents;assert.throws(()=>finish(missing,missing.combat.enemies[0]),/requires its scheduled event/);
});

test('cancelled long casts consume bounded capacity and are retired at their deadline without blocking projectiles',()=>{
 const {s,e}=fixture();
 for(let n=0;n<CAST_CAPACITY;n++){e.cast=null;beginEnemyCast(s,e,{spell:133,target:s.id,until:1000});}
 e.cast=null;assert.throws(()=>beginEnemyCast(s,e,{spell:133,target:s.id,until:1000}),/capacity/);
 assert.equal(s.simulationEvents.castSequence,CAST_CAPACITY);
 launchProjectile(s,s,e,{Id:133,Speed:100,SpellName:'Fireball',School:2});
 s.clock=100;assert.equal(takeImpacts(s,'friendly').length,1);
 s.clock=1000;advanceSimulationEvents(s,60);assert.deepEqual(s.simulationEvents.casts,{});
 beginEnemyCast(s,e,{spell:133,target:s.id,until:2000});assert.equal(e.cast.eventId,CAST_CAPACITY+1);
});
