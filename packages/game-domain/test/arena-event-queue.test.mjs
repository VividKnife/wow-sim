import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advanceOwned} from '../src/rules/engine.js';
import {hurtPlayer} from '../src/rules/combat.js';
import {tickClassEffects} from '../src/rules/class-mechanics.js';
import {talents} from '../src/rules/catalog.js';
import {arenaView} from '../src/rules/arena.js';
import {localScenarios} from './support/local-scenarios.ts';
import {launchProjectile,takeImpacts} from '../src/rules/combat-projectiles.js';
import {simulationEventRuntime,shortenCombatChannel,channelProgress,continueChannel,beginActorCast,prepareActorCasts,takeActorCastReady,addCombatDot,dueCombatDots,continueCombatDot} from '../src/rules/simulation-events.js';
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){return {clock:0,projectiles:[],projectileSequence:0,logs:[],units:[8,1].map((classId,teamId)=>{const unit=createGame('team '+teamId,283,0,{classId,raceId:1});unit.id='arena:'+teamId;unit.teamId=teamId;unit.pvp=true;unit.level=60;unit.hp=stats(unit).maxHp;unit.mana=stats(unit).maxMana;unit.position=teamId*20;unit.positionY=0;unit.dots=[];unit.threat={};return unit;})};}
function frame(data,teamId){const state=createGame('context',283,0);Object.assign(state,{teamId,clock:data.clock,nextTick:data.clock+100,logs:data.logs,simulationEvents:data.events,arenaAllActors:data.units,arenaActors:data.units.filter(c=>c.teamId===teamId),combat:{id:'match',pvp:true,projectiles:data.projectiles,projectileSequence:data.projectileSequence,enemies:data.units.filter(c=>c.teamId!==teamId),healing:{},damage:{},startedAt:0}});simulationEventRuntime(state);data.events=state.simulationEvents;return state;}
function commit(data,state){data.projectileSequence=state.combat.projectileSequence;}

test('both arena teams keep globally unique casts and consume only their own ready deadlines after restoration',()=>{
 const data=fixture();for(const team of [0,1]){const s=frame(data,team);beginActorCast(s,data.units[team],{spell:133,until:1000,target:data.units[1-team].id});}
 assert.notEqual(data.units[0].cast.eventId,data.units[1].cast.eventId);const restored=clone(data);
 for(const d of [data,restored]){d.clock=1000;const first=frame(d,0);prepareActorCasts(first);assert.equal(Object.values(d.events.casts).filter(t=>t.ready).length,2);const second=frame(d,1);assert.equal(takeActorCastReady(second,d.units[1]),true);d.units[1].cast=null;assert.equal(takeActorCastReady(first,d.units[0]),true);d.units[0].cast=null;assert.deepEqual(d.events.casts,{});}
 assert.deepEqual(data,restored);
});

test('periodic damage on both teams shares one heap without the opposite pass retiring its target',()=>{
 const data=fixture();for(const team of [0,1])addCombatDot(frame(data,team),data.units[1-team],{caster:data.units[team].id,spellId:703,next:1000,interval:1000,remaining:1,amount:10});
 const restored=clone(data);for(const d of [data,restored]){d.clock=1000;for(const team of [0,1]){const s=frame(d,team),target=d.units[1-team],due=dueCombatDots(s,target);assert.equal(due.length,1);continueCombatDot(s,target,due[0]);}assert.deepEqual(d.events.dots,{});}assert.deepEqual(data,restored);
});

test('a critical hit in the opposing team pass schedules the defender talent and heals through its own pass',()=>{
 const data=fixture(),victim=data.units[1];victim.hp=1000;const talent=Object.values(talents).find(t=>t.classId===1&&t.name==='Blood Craze');victim.talents[talent.id]=3;
 hurtPlayer(frame(data,0),data.units[0],victim,100,'critical',{critical:true,school:0});assert.ok(victim.hp<1000);assert.equal(victim.hots.length,1);const hp=victim.hp,amount=Math.round(victim.hots[0].amount),restored=clone(data);
 for(const d of [data,restored])for(const at of [2000,4000,6000]){d.clock=at;const s=frame(d,1);tickClassEffects(s,s.arenaActors,{});}
 assert.equal(victim.hp,hp+3*amount);assert.deepEqual(data,restored);
});

test('projectiles use globally unique identities and origin routing survives a removed launcher',()=>{
 const data=fixture();for(const team of [0,1]){const s=frame(data,team);assert.equal(launchProjectile(s,data.units[team],data.units[1-team],{Id:133,School:2,Speed:20}),true);commit(data,s);}
 assert.equal(new Set(data.projectiles.map(p=>p.id)).size,2);data.units=data.units.filter(c=>c.teamId===1);const restored=clone(data);
 for(const d of [data,restored]){d.clock=1000;assert.equal(takeImpacts(frame(d,1),'friendly').length,1);assert.equal(d.events.ready.friendly.length,1);assert.equal(takeImpacts(frame(d,0),'friendly').length,1);assert.equal(d.events.ready.friendly.length,0);assert.equal(d.projectiles.length,0);}assert.deepEqual(data,restored);
});

test('arena restoration rejects a projectile without valid originating team metadata',()=>{
 const data=fixture(),s=frame(data,0);launchProjectile(s,data.units[0],data.units[1],{Id:133,School:2,Speed:20});commit(data,s);const bad=clone(data);delete bad.projectiles[0].teamId;assert.throws(()=>frame(bad,0),/originating team/);
});

test('real five-versus-five execution has one queue and restores the same complete match state',()=>{
 const s=localScenarios().arena;advanceOwned(s,9000);assert.ok(s.arena.simulationEvents);assert.ok(s.arena.teams.every(t=>!Object.hasOwn(t,'simulationEvents')&&!Object.hasOwn(t,'projectiles')));
 const restored=clone(s);for(const x of [s,restored])advanceOwned(x,20000);assert.deepEqual(s,restored);assert.equal(JSON.stringify(arenaView(s)).includes('simulationEvents'),false);
});

test('opposing team channel shortening changes the shared timer and restores its exact completion',()=>{
 const data=fixture();beginActorCast(frame(data,0),data.units[0],{spell:5143,until:3000,next:1000,interval:1000,channel:true,target:data.units[1].id});data.clock=400;
 shortenCombatChannel(frame(data,1),data.units[0],450);assert.equal(data.events.queue.events[0].atMs,500);const restored=clone(data);
 for(const d of [data,restored]){d.clock=500;prepareActorCasts(frame(d,1));const own=frame(d,0);assert.deepEqual(channelProgress(own,d.units[0]),{tick:false,end:true});const cast=d.units[0].cast;d.units[0].cast=null;continueChannel(own,d.units[0],cast);assert.deepEqual(d.events.casts,{});}
 assert.deepEqual(data,restored);
});
