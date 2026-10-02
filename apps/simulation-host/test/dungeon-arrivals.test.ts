import {npcFixture} from '../../../packages/game-domain/test/support/npc-fixture.ts';
import {splitDungeonCheckpoint} from '../src/dungeon-departure.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {rebaseSimulation} from '../../../packages/game-domain/src/simulation-clock.ts';
import {addPeriodicEffect} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {controllerAction} from '../../../packages/game-domain/src/controller-actions.ts';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import type {DungeonRoster} from '../../../packages/game-domain/src/dungeon-roster.ts';
import {ResidentInstance,type InstanceCheckpoint} from '../src/instance.ts';
import {composeDungeonCheckpoint} from '../src/dungeon-composition.ts';
import {participantPresentationState} from '../../../packages/game-domain/src/resident-participants.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context} from '../../../packages/game-domain/src/context.ts';
import type {Character} from '../../../packages/game-domain/src/model.ts';

async function fixture(humans=2){
  const store=new MemoryStore();
  const {admission}=await residentPartyFixture(store,1000);
  const states=[admission.state,admission.state.party[0]];
  const accounts=['alice','bob','charlie'];
  if(humans===3){
    const game=new GameService(store,{contentVersion:'arrivals',seed:()=>381,now:()=>1000});
    const created=await game.createAccount('charlie',{name:'Charlie',classId:8,raceId:1},'create');
    states.push(await store.transaction(async tx=>context(tx,(await tx.get<Character>('characters',created.state.id))!,1000,false)));
    admission.controllers.push({accountId:'charlie',actorId:created.state.id,generation:1,canPause:false});
  }
  for(const [index,state]of states.entries()){
    state.party=[];state.level=20;state.location=index?'deadmines':'goldshire';
    state.hp=stats(state).maxHp-100;state.mana=stats(state).maxMana;
    npcFixture(state,index*100);
    state.party=state.npcWorld.residents.slice(0,index===0?5-humans:0).map((p:Rules)=>structuredClone(p.unit));
    state.npcWorld.selection=state.party.map((p:Rules)=>p.id);
    rebaseSimulation(state,10000+index*10000);
    addPeriodicEffect(state,state,'hots',{spell:139,name:'Renew',caster:state.id,amount:10,next:state.clock+1000,interval:1000,until:state.clock+5000});
  }
  const roster:DungeonRoster={groupId:'group:arrivals',dungeonId:'deadmines',leaderId:states[0].id,
    members:states.flatMap(state=>[state,...state.party].map((a:Rules)=>({id:a.id,npc:!!a.npcPlayer})))};
  const sources=states.map((state,index)=>{
    const runtime=new ResidentInstance({instanceId:`personal:${index}`,ownerEpoch:1,state,controllers:[admission.controllers[index]],
      presence:{offlineLimitMs:7200000,accounts:[[accounts[index],1000]]}});
    runtime.input(accounts[index],{instanceId:runtime.instanceId,actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'settings',
      command:{kind:'action',action:{type:'settings',health:40,mana:40}}});
    return runtime.checkpoint();
  });
  return {sources,roster};
}
function firstRoom(sources:InstanceCheckpoint[],roster:DungeonRoster){
  return composeDungeonCheckpoint([sources[1]],{instanceId:'dungeon:first',ownerEpoch:1,primaryActorId:sources[1].state.id,roster});
}

test('a nonleader enters first alone; NPCs wait for the travelling leader outside the room runtime',async()=>{
  const {sources,roster}=await fixture(),before=structuredClone(sources);
  const checkpoint=firstRoom(sources,roster),state=checkpoint.state;
  assert.deepEqual(sources,before);assert.equal(sources[0].state.location,'goldshire');
  assert.equal(state.id,sources[1].state.id);assert.equal(state.sharedParty.leaderId,sources[0].state.id);
  assert.equal(state.party.length,0);assert.equal(state.dungeonRoster.members.length,5);
  assert.deepEqual(state.sharedParty.participantIds,[sources[1].state.id]);assert.equal(checkpoint.controllers.length,1);
  assert.equal(state.party.some((a:Rules)=>a.id===sources[0].state.id),false);
  const runtime=ResidentInstance.restore(checkpoint,2);
  assert.throws(()=>runtime.presentation('alice',sources[0].state.id,'full'),/access denied/);
  const scene=runtime.presentation('bob',state.id,'full').snapshot!.view.instanceScene as Rules;
  assert.ok(scene);
  assert.equal(scene.memberCount,1);
  assert.throws(()=>controllerAction(state,checkpoint.controllers,checkpoint.controllers[0],{kind:'action',action:{type:'strategy',target:roster.members.find(m=>m.npc)!.id}}),/Activity control|Member control/);
});

test('the leader brings all NPCs together; waiting for another human grants no personal-room lifecycle authority',async()=>{
  const {sources,roster}=await fixture();sources[0].state.location='deadmines';
  const first=composeDungeonCheckpoint([sources[0]],{instanceId:'dungeon:leader-first',ownerEpoch:1,primaryActorId:roster.leaderId,roster});
  assert.equal(first.state.party.length,3);assert.equal(first.controllers.length,1);
  const runtime=ResidentInstance.restore(first,1);
  const receipt=runtime.input('alice',{instanceId:first.instanceId,actorId:roster.leaderId,controllerGeneration:first.controllers[0].generation,
    clientSequence:2,requestId:'leave-without-group-boundary',command:{kind:'action',action:{type:'leaveDungeon'}}});
  assert.equal(receipt.status,'rejected');assert.match(receipt.reason!,/Shared activity control/);
  assert.deepEqual(runtime.checkpoint().state,first.state);
  const joined=composeDungeonCheckpoint([first,sources[1]],{instanceId:'dungeon:later-human-only',ownerEpoch:1,primaryActorId:first.state.id,roster});
  assert.equal(joined.state.party.length,4);
  for(const npc of joined.state.npcWorld.residents.filter((p:Rules)=>roster.members.some(m=>m.npc&&m.id===p.id)))assert.equal(npc.runs,1);
});

test('NPCs cannot precede the leader or enter as an incomplete cohort',async()=>{
  const {sources,roster}=await fixture();sources[0].state.location='deadmines';
  sources[1].state.party.push(sources[0].state.party.pop());
  assert.throws(()=>firstRoom(sources,roster),/NPCs must enter together/);
  assert.throws(()=>composeDungeonCheckpoint([sources[0]],{instanceId:'dungeon:missing-npc',ownerEpoch:1,primaryActorId:roster.leaderId,roster}),/NPCs must enter together/);
});

test('a later arrival preserves the existing dungeon, RNG, periodic effects and private inputs without restarting NPC participation',async()=>{
  const {sources,roster}=await fixture();
  const first=firstRoom(sources,roster),inside=ResidentInstance.restore(first,1);
  // The arrival fixture is now at the entrance; the live rule boundary still
  // rejects the unchanged travelling fixture in the negative cases below.
  sources[0].state.location='deadmines';
  const outside=ResidentInstance.restore(sources[0],1);
  while(!inside.advance(2000,10).complete){}while(!outside.advance(2000,10).complete){}
  const current=inside.checkpoint(),arrival=outside.checkpoint();
  current.state.dungeon.cursor=2;
  const spawn=Object.keys(current.state.dungeon.spawns).find(id=>current.state.dungeon.spawns[id]);
  current.state.dungeon.defeated[spawn!]=true;
  const before=structuredClone([current,arrival]);
  const joined=composeDungeonCheckpoint([arrival,current],{instanceId:'dungeon:joined',ownerEpoch:1,primaryActorId:current.state.id,roster});
  assert.deepEqual([current,arrival],before);
  assert.deepEqual(joined.state.dungeon,{...current.state.dungeon,admittedHumanIds:[...current.state.dungeon.admittedHumanIds,arrival.state.id],npcParticipants:joined.state.dungeon.npcParticipants});assert.equal(joined.state.rngState,current.state.rngState);
  assert.equal(joined.state.dungeonSequence,current.state.dungeonSequence);
  assert.equal(joined.state.party.length,4);assert.equal(joined.controllers.length,2);
  for(const source of [current,arrival]){
    const actor=[joined.state,...joined.state.party].find(c=>c.id===source.state.id)!;
    for(const field of ['money','bag','bank','itemSequence','quests','completed','dungeonEntries'])assert.deepEqual(actor[field],field==='dungeonEntries'&&source===arrival?[2000]:source.state[field],field);
    assert.equal(actor.hots[0].until-joined.state.clock,source.state.hots[0].until-source.state.clock);
    for(const npc of actor.npcWorld.residents.filter((p:Rules)=>joined.state.party.some((a:Rules)=>a.id===p.id)))assert.equal(npc.runs,1);
  }
  const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(joined)),2);
  for(const row of joined.recentInputs)assert.deepEqual(restored.input(row.accountId,row.input),row.receipt);
  const leader=joined.controllers.find(c=>c.actorId===roster.leaderId)!;
  assert.notEqual(leader.actorId,joined.state.id);
  const view=participantPresentationState(joined.state,leader.actorId);
  assert.deepEqual(view.dungeonRoster,roster);assert.deepEqual(view.sharedParty,joined.state.sharedParty);
  assert.equal((restored.presentation('alice',leader.actorId,'full').snapshot!.view.instanceScene as Rules).memberCount,5);
  assert.doesNotThrow(()=>controllerAction(joined.state,joined.controllers,leader,{kind:'action',action:{type:'strategy',target:joined.state.party.find((a:Rules)=>a.npcPlayer).id}}));
  const uninterrupted=ResidentInstance.restore(joined,2);
  while(!restored.advance(6000,10).complete){}while(!uninterrupted.advance(6000,10).complete){}
  assert.deepEqual(restored.checkpoint(),uninterrupted.checkpoint());
  for(const actor of [restored.checkpoint().state,...restored.checkpoint().state.party].filter((a:Rules)=>!a.npcPlayer))assert.equal(actor.hots.length,0);
});

test('a third human joins an already shared room with a newer clock without losing earlier controller receipts',async()=>{
  const {sources,roster}=await fixture(3);
  sources[0].state.location='deadmines';
  const first=firstRoom(sources,roster);
  const shared=composeDungeonCheckpoint([first,sources[0]],{instanceId:'dungeon:two',ownerEpoch:1,primaryActorId:first.state.id,roster});
  assert.equal(shared.controllers.length,2);assert.equal(shared.state.party.length,3);
  assert.ok(sources[2].state.clock>shared.state.clock);
  const joined=composeDungeonCheckpoint([sources[2],shared],{instanceId:'dungeon:three',ownerEpoch:1,primaryActorId:shared.state.id,roster});
  assert.equal(joined.state.clock,sources[2].state.clock);assert.equal(joined.state.party.length,4);
  assert.deepEqual(joined.state.dungeon,{...rebaseSimulation(structuredClone(shared.state),joined.state.clock).dungeon,admittedHumanIds:[...shared.state.dungeon.admittedHumanIds,sources[2].state.id]});
  assert.equal(joined.state.rngState,shared.state.rngState);
  const restored=ResidentInstance.restore(JSON.parse(JSON.stringify(joined)),2);
  for(const controller of joined.controllers){
    assert.equal(controller.generation,controller.accountId==='charlie'?2:shared.controllers.find(c=>c.actorId===controller.actorId)!.generation+1);
    const row=joined.recentInputs.find(row=>row.accountId===controller.accountId)!;
    assert.equal(row.input.controllerGeneration,controller.generation);
    assert.deepEqual(restored.input(controller.accountId,row.input),row.receipt);
    assert.equal((restored.presentation(controller.accountId,controller.actorId,'full').snapshot!.view.instanceScene as Rules).memberCount,5);
    const source=[shared,sources[2]].find(s=>[s.state,...s.state.party].some(a=>a.id===controller.actorId))!;
    const before=[source.state,...source.state.party].find(a=>a.id===controller.actorId)!;
    const actor=[joined.state,...joined.state.party].find(a=>a.id===controller.actorId)!;
    assert.equal(actor.hots[0].until-joined.state.clock,before.hots[0].until-source.state.clock);
    for(const field of ['money','bag','bank','quests'])assert.deepEqual(actor[field],before[field]);
  }
  const uninterrupted=ResidentInstance.restore(joined,2);
  while(!restored.advance(7000,10).complete){}while(!uninterrupted.advance(7000,10).complete){}
  assert.deepEqual(restored.checkpoint(),uninterrupted.checkpoint());
});

test('arrival rejects foreign roster, duplicate occupants, missing controller, wrong entrance and in-flight combat without mutating checkpoints',async()=>{
  const {sources,roster}=await fixture(),first=firstRoom(sources,roster);
  const options={instanceId:'dungeon:invalid',ownerEpoch:1,primaryActorId:first.state.id,roster};
  assert.throws(()=>composeDungeonCheckpoint([first,sources[0]],options),/入口/);
  sources[0].state.location='deadmines';
  const cases=[
    (rooms:InstanceCheckpoint[])=>{rooms[0].state.dungeonRoster.groupId='another-group';},
    (rooms:InstanceCheckpoint[])=>{rooms[1].state.party[0].id=rooms[0].state.id;},
    (rooms:InstanceCheckpoint[])=>{rooms[0].controllers=[];},
    (rooms:InstanceCheckpoint[])=>{rooms[0].state.combat={id:'fighting'};},
    (rooms:InstanceCheckpoint[])=>{rooms[1].state.location='goldshire';},
  ];
  for(const mutate of cases){const rooms=structuredClone([first,sources[0]]);mutate(rooms);const before=structuredClone(rooms);assert.throws(()=>composeDungeonCheckpoint(rooms,options));assert.deepEqual(rooms,before);}
  const corrupt=structuredClone(first);corrupt.state.dungeonRoster.members[0].id=corrupt.state.dungeonRoster.members[1].id;
  assert.throws(()=>ResidentInstance.restore(corrupt,2),/roster/);
});

test('three human room keeps both remaining private projections after leader departure',async()=>{
 const {sources,roster}=await fixture(3);sources[0].state.location='deadmines';
 const shared=composeDungeonCheckpoint(sources,{instanceId:'shared:three',ownerEpoch:1,primaryActorId:roster.leaderId,roster});
 const [,remaining]=splitDungeonCheckpoint(shared,roster.leaderId,{instanceId:'personal:left',ownerEpoch:1},{instanceId:'shared:two',ownerEpoch:1});
 const runtime=ResidentInstance.restore(remaining,2);
 for(const controller of remaining.controllers){
  const projected=runtime.presentation(controller.accountId,controller.actorId,'full');
  assert.ok(projected.snapshot);
  assert.equal((projected.snapshot.view.instanceScene as Rules).memberCount,4);
 }
});
