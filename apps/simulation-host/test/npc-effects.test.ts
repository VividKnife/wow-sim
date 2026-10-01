import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {ensureNpcMatchSupply} from '../../../packages/game-domain/src/rules/npc-world.js';
import {rebaseSimulation} from '../../../packages/game-domain/src/simulation-clock.ts';
import {addPeriodicEffect,preparePeriodicEffects} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {addEnemyAura} from '../../../packages/game-domain/src/rules/enemy-aura-events.js';
import {tickClassEffects} from '../../../packages/game-domain/src/rules/class-mechanics.js';
import {advanceOwned} from '../../../packages/game-domain/src/rules/engine.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {combatMembers} from '../../../packages/game-domain/src/rules/combat-members.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {ResidentInstance} from '../src/instance.ts';
import {detachStandbyNpcs} from '../src/npc-transfer.ts';
import {composeDungeonCheckpoint} from '../src/dungeon-composition.ts';

async function fixture(remoteClock:number,ready=false){
 const {admission}=await residentPartyFixture(new MemoryStore(),1000);
 const states=[admission.state,admission.state.party[0]];
 for(const [i,state]of states.entries()){
  state.party=[];state.level=20;state.location=i?'goldshire':'deadmines';
  ensureNpcMatchSupply(state);rebaseSimulation(state,i?remoteClock:50000);
  if(i){
   state.party=state.npcWorld.residents.slice(0,3).map((p:Rules)=>structuredClone(p.unit));
   state.npcWorld.selection=state.party.map((p:Rules)=>p.id);
   for(const npc of state.party){
    npc.hp=stats(npc).maxHp-100;
    npc.cooldowns[139]=state.clock+12000;
    addPeriodicEffect(state,npc,'hots',{spell:139,name:'Renew',caster:npc.id,amount:10,next:state.clock+1000,interval:1000,until:state.clock+3000});
    addEnemyAura(state,npc,{spell:16403,type:3,amount:1,interval:1000,next:state.clock+1000,until:state.clock+3000,caster:npc.id,positive:false});
   }
  }
  state.hp=stats(state).maxHp-100;
  addPeriodicEffect(state,state,'hots',{spell:139,name:'Renew',caster:state.id,amount:10,next:state.clock+1000,interval:1000,until:state.clock+3000});
  if(ready){state.clock+=1000;state.nextTick=state.clock+100;preparePeriodicEffects(state);}
 }
 const sources=states.map((state,i)=>new ResidentInstance({instanceId:'effects:'+i,ownerEpoch:1,state,controllers:[admission.controllers[i]],presence:{offlineLimitMs:7200000,accounts:[[i?'bob':'alice',1000]]}}).checkpoint());
 const ids=states[1].party.map((a:Rules)=>a.id),roster={groupId:'effects:party',leaderId:states[0].id,dungeonId:'deadmines',members:[...states.map(s=>({id:s.id,npc:false})),...ids.map((id:string)=>({id,npc:true}))]};
 return {sources,ids,roster};
}
for(const remoteClock of [10000,90000])test(`NPC effects preserve remaining time from clock ${remoteClock}, without moving the source human or duplicating ticks`,async()=>{
 const {sources,ids,roster}=await fixture(remoteClock),before=structuredClone(sources);
 const detached=detachStandbyNpcs(sources[1],ids,{instanceId:'effects:outside',ownerEpoch:1});
 const room=composeDungeonCheckpoint([sources[0]],{instanceId:'effects:dungeon',ownerEpoch:1,primaryActorId:sources[0].state.id,roster,selectMatchedNpcs:true,npcArrivals:[detached.arrival]});
 assert.deepEqual(sources,before);
 assert.equal(detached.checkpoint.state.clock,remoteClock);assert.equal(detached.checkpoint.state.location,'goldshire');
 assert.equal(detached.checkpoint.state.party.length,0);
 assert.equal(Object.values(detached.checkpoint.state.simulationEvents.periodics).length,1);
 assert.equal(Object.values(detached.checkpoint.state.simulationEvents.enemyAuras).length,0);
 assert.equal(room.state.clock,Math.max(50000,remoteClock));
 assert.equal(room.controllers.length,1);assert.equal(room.state.party.length,3);
 for(const npc of room.state.party){
  assert.equal(npc.cooldowns[139]-room.state.clock,12000);
  assert.equal(npc.hots[0].next-room.state.clock,1000);assert.equal(npc.hots[0].until-room.state.clock,3000);
  assert.equal(npc.auras[0].next-room.state.clock,1000);
 }
 for(const cp of [room,detached.checkpoint]){
  const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(cp)),2).checkpoint();
  for(const state of [cp.state,restored.state])advanceOwned(state,state.wallAt+3100);
  assert.deepEqual(cp.state,restored.state,'restart must execute identical ticks and RNG');
  const expected=cp===room?[cp.state.id,...ids]:[cp.state.id];
  for(const id of expected)assert.equal(cp.state.logs.filter((l:Rules)=>l.kind==='heal'&&l.actorId===id).length,3);
  if(cp!==room)assert.ok(cp.state.logs.every((l:Rules)=>!ids.includes(l.actorId)));
 }
});
test('already-ready NPC healing is applied exactly once after extraction and clock translation',async()=>{
 const {sources,ids,roster}=await fixture(10000,true);
 const {arrival}=detachStandbyNpcs(sources[1],ids,{instanceId:'effects:outside',ownerEpoch:1});
 const {state}=composeDungeonCheckpoint([sources[0]],{instanceId:'effects:dungeon',ownerEpoch:1,primaryActorId:sources[0].state.id,roster,selectMatchedNpcs:true,npcArrivals:[arrival]});
 const hp=state.party.map((a:Rules)=>a.hp);
 tickClassEffects(state,combatMembers(state),{});tickClassEffects(state,combatMembers(state),{});
 assert.deepEqual(state.party.map((a:Rules)=>a.hp),hp.map((n:number)=>n+10));
 assert.ok(state.party.every((a:Rules)=>a.hots[0].next===state.clock+1000));
});
test('unmatched wall boundaries and active casts reject NPC entry without changing sealed sources',async()=>{
 const {sources,ids,roster}=await fixture(10000);
 const {arrival}=detachStandbyNpcs(sources[1],ids,{instanceId:'effects:outside',ownerEpoch:1});
 arrival.wallAt++;
 assert.throws(()=>composeDungeonCheckpoint([sources[0]],{instanceId:'effects:dungeon',ownerEpoch:1,primaryActorId:sources[0].state.id,roster,selectMatchedNpcs:true,npcArrivals:[arrival]}),/common saved wall/);
 sources[1].state.party[0].cast={spell:139,until:sources[1].state.clock+3000};
 const before=structuredClone(sources[1]);
 assert.throws(()=>detachStandbyNpcs(sources[1],ids,{instanceId:'effects:outside',ownerEpoch:1}),/finish its active party/);
 assert.deepEqual(sources[1],before);
});

test('NPCs waiting for the leader freeze their live effects and resume the same remaining durations after a later arrival',async()=>{
 const {sources,ids,roster}=await fixture(10000);
 sources[1].state.location='deadmines';
 const waiting=composeDungeonCheckpoint([sources[1]],{instanceId:'effects:waiting',ownerEpoch:1,primaryActorId:sources[1].state.id,roster,selectMatchedNpcs:true});
 assert.equal(waiting.state.party.length,0);
 for(const id of ids){
  const profile=waiting.state.npcWorld.residents.find((p:Rules)=>p.id===id);
  assert.ok(profile.standbyEffects);assert.equal(profile.unit.hots[0].until-profile.standbyEffects.clock,3000);
 }
 advanceOwned(waiting.state,waiting.state.wallAt+5000);
 assert.ok(waiting.state.logs.every((l:Rules)=>!ids.includes(l.actorId)));
 sources[0].state.wallAt=waiting.state.wallAt;
 const joined=composeDungeonCheckpoint([waiting,sources[0]],{instanceId:'effects:joined',ownerEpoch:1,primaryActorId:waiting.state.id,roster,selectMatchedNpcs:true});
 for(const npc of joined.state.party.filter((a:Rules)=>a.npcPlayer)){
  assert.equal(npc.hots[0].next-joined.state.clock,1000);assert.equal(npc.hots[0].until-joined.state.clock,3000);
  assert.equal(npc.cooldowns[139]-joined.state.clock,12000);
 }
 assert.ok(joined.state.npcWorld.residents.filter((p:Rules)=>ids.includes(p.id)).every((p:Rules)=>!p.standbyEffects));
 const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(joined)),2).checkpoint();
 for(const cp of [joined,restored])advanceOwned(cp.state,cp.state.wallAt+3100);
 assert.deepEqual(joined.state,restored.state);
 for(const id of ids)assert.equal(joined.state.logs.filter((l:Rules)=>l.kind==='heal'&&l.actorId===id).length,3);
});

test('a frozen NPC can transfer to another room without reviving an obsolete queue binding',async()=>{
 const {sources,ids,roster}=await fixture(10000);sources[1].state.location='deadmines';
 const waiting=composeDungeonCheckpoint([sources[1]],{instanceId:'effects:waiting',ownerEpoch:1,primaryActorId:sources[1].state.id,roster,selectMatchedNpcs:true});
 advanceOwned(waiting.state,waiting.state.wallAt+5000);
 sources[0].state.wallAt=waiting.state.wallAt;
 const {arrival,checkpoint}=detachStandbyNpcs(waiting,ids,{instanceId:'effects:still-waiting',ownerEpoch:1});
 const joined=composeDungeonCheckpoint([sources[0]],{instanceId:'effects:elsewhere',ownerEpoch:1,primaryActorId:sources[0].state.id,roster,selectMatchedNpcs:true,npcArrivals:[arrival]});
 assert.equal(checkpoint.state.dungeon.runId,waiting.state.dungeon.runId);assert.equal(checkpoint.state.party.length,0);
 for(const npc of joined.state.party){assert.equal(npc.hots[0].until-joined.state.clock,3000);assert.equal(npc.cooldowns[139]-joined.state.clock,12000);}
 advanceOwned(joined.state,joined.state.wallAt+3100);
 for(const id of ids)assert.equal(joined.state.logs.filter((l:Rules)=>l.kind==='heal'&&l.actorId===id).length,3);
});
