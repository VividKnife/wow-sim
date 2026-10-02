import {npcFixture} from '../../../packages/game-domain/test/support/npc-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {addPeriodicEffect} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {addEnemyAura} from '../../../packages/game-domain/src/rules/enemy-aura-events.js';
import {advanceOwned} from '../../../packages/game-domain/src/rules/engine.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {ResidentInstance} from '../src/instance.ts';
import {composeDungeonCheckpoint} from '../src/dungeon-composition.ts';
import {splitDungeonCheckpoint} from '../src/dungeon-departure.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
async function fixture(){
 const {admission,ids}=await residentPartyFixture(new MemoryStore(),1000);
 const states=[admission.state,admission.state.party[0]],sources=[];
 for(const [i,state]of states.entries()){
  state.party=[];state.level=20;state.location='deadmines';state.hp=stats(state).maxHp-100;
  npcFixture(state,i*100);state.party=state.npcWorld.residents.slice(0,i?1:2).map((p:Rules)=>structuredClone(p.unit));
  state.npcWorld.selection=state.party.map((a:Rules)=>a.id);
  addPeriodicEffect(state,state,'hots',{spell:139,caster:state.id,name:'Renew',amount:10,next:state.clock+1000,interval:1000,until:state.clock+3000});
  addEnemyAura(state,state,{spell:16403,type:3,amount:1,interval:1000,next:state.clock+1000,until:state.clock+3000,caster:state.id,positive:false});
  const runtime=new ResidentInstance({instanceId:'personal:'+i,ownerEpoch:1,state,controllers:[admission.controllers[i]],presence:{offlineLimitMs:7200000,accounts:[[i?'bob':'alice',1000]]}});
  runtime.input(i?'bob':'alice',{instanceId:runtime.instanceId,actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'settings',command:{kind:'action',action:{type:'settings',health:50,mana:50}}});
  sources.push(runtime.checkpoint());
 }
 const roster={groupId:'party:test',leaderId:ids[0],dungeonId:'deadmines',members:sources.flatMap(s=>[s.state,...s.state.party].map((a:Rules)=>({id:a.id,npc:!!a.npcPlayer})))};
 const source=composeDungeonCheckpoint(sources,{instanceId:'dungeon:first',ownerEpoch:1,primaryActorId:ids[0],roster});
 source.state.dungeon.cleared={test:true};return {source,ids};
}
for(const index of [0,1])test(`${index?'member':'leader'} departure preserves the other human, the public NPCs, periodic effects and dungeon progress`,async()=>{
 const {source,ids}=await fixture(),before=structuredClone(source);
 const [personal,remaining]=splitDungeonCheckpoint(source,ids[index],{instanceId:'personal:left',ownerEpoch:1},{instanceId:'dungeon:remaining',ownerEpoch:1});
 assert.deepEqual(source,before,'composition cannot mutate a live source');
 assert.equal(personal.state.id,ids[index]);assert.equal(personal.state.dungeon,undefined);assert.equal(personal.state.dungeonRoster,undefined);
 assert.equal(personal.state.dungeonSaves.deadmines,undefined,'cannot clone progress from an active shared run');
 assert.equal(remaining.state.id,ids[1-index]);assert.deepEqual(remaining.state.dungeon,source.state.dungeon);
 assert.equal(remaining.state.sharedParty.leaderId,ids[0],'leaving the scene is not leaving the social party');
 const all=[personal.state,...personal.state.party,remaining.state,...remaining.state.party];
 assert.deepEqual(all.map(a=>a.id).sort(),[source.state,...source.state.party].map(a=>a.id).sort());
 assert.equal(new Set(all.map(a=>a.id)).size,5);
 for(const cp of [personal,remaining]){
  const original=[source.state,...source.state.party].find(a=>a.id===cp.state.id)!;
  for(const key of ['bag','bank','money','itemSequence','quests','completed','strategyProfiles'])assert.deepEqual(cp.state[key],original[key],key);
  assert.deepEqual(cp.state.party.map((a:Rules)=>a.id).sort(),cp===personal?[]:source.state.party.filter((a:Rules)=>a.npcPlayer).map((a:Rules)=>a.id).sort());
  assert.equal(cp.controllers.length,1);assert.equal(cp.controllers[0].generation,3);
  assert.equal(cp.presence!.accounts.length,1);assert.equal(cp.presence!.accounts[0][0],cp.controllers[0].accountId);
  assert.ok(Object.values(cp.state.simulationEvents.periodics).every((t:any)=>t.targetId===cp.state.id));
  assert.ok(Object.values(cp.state.simulationEvents.enemyAuras).every((t:any)=>t.targetId===cp.state.id));
  const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(cp)),2);
  for(const row of cp.recentInputs)assert.deepEqual(restored.input(row.accountId,row.input),row.receipt);
  const clone=structuredClone(cp.state);advanceOwned(cp.state,cp.state.wallAt+3100);advanceOwned(clone,clone.wallAt+3100);assert.deepEqual(cp.state,clone);
  assert.equal(cp.state.logs.filter((l:Rules)=>l.kind==='heal'&&l.actorId===cp.state.id).length,3);
 }
});
test('the last human releases the public NPC cohort without duplicating shared progress',async()=>{
 const {source,ids}=await fixture();const [,remaining]=splitDungeonCheckpoint(source,ids[1],{instanceId:'personal:bob',ownerEpoch:1},{instanceId:'dungeon:alice',ownerEpoch:1});
 const [personal]=splitDungeonCheckpoint(remaining,ids[0],{instanceId:'personal:alice',ownerEpoch:1});
 assert.equal(personal.state.dungeon,undefined);assert.equal(personal.state.dungeonSaves.deadmines,undefined);
});
test('departure rejects unsupported active boundaries and missing identities without mutation',async()=>{
 const {source,ids}=await fixture(),before=structuredClone(source),personal={instanceId:'personal:outside',ownerEpoch:1},remaining={instanceId:'dungeon:inside',ownerEpoch:1};
 assert.throws(()=>splitDungeonCheckpoint(source,'stranger',personal,remaining),/participant missing/);
 assert.throws(()=>splitDungeonCheckpoint(source,ids[0],personal),/destinations/);
 source.state.activity={type:'travel'};assert.throws(()=>splitDungeonCheckpoint(source,ids[0],personal,remaining),/当前/);
 source.state.activity=before.state.activity;assert.deepEqual(source,before);
});

test('healing applied by the other human survives separation into independently restored instances',async()=>{
 const {source,ids}=await fixture(),actors=[source.state,source.state.party.find((a:Rules)=>a.id===ids[1])];
 for(const [i,target]of actors.entries()){
  target.hp=stats(target).maxHp-200;
  addPeriodicEffect(source.state,target,'hots',{spell:139,name:'Renew from teammate',caster:actors[1-i].id,amount:10,next:source.state.clock+1000,interval:1000,until:source.state.clock+3000});
 }
 const outputs=splitDungeonCheckpoint(source,ids[0],{instanceId:'personal:cross-heal',ownerEpoch:1},{instanceId:'dungeon:cross-heal',ownerEpoch:1});
 for(const cp of outputs){
  const otherId=ids.find(id=>id!==cp.state.id)!;
  assert.ok(cp.controllers.every(c=>c.actorId!==otherId));assert.ok(cp.state.party.every((a:Rules)=>a.id!==otherId));
  const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(cp)),2).checkpoint();
  for(const state of [cp.state,restored.state])advanceOwned(state,state.wallAt+3100);
  assert.deepEqual(JSON.parse(JSON.stringify(cp.state)),restored.state);
  const heals=cp.state.logs.filter((l:Rules)=>l.kind==='heal'&&l.actorId===otherId&&l.targetId===cp.state.id);
  assert.equal(heals.length,3);assert.equal(heals.reduce((n:number,l:Rules)=>n+l.amount,0),30);
 }
});
