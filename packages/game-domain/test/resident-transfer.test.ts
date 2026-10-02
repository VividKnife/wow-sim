import {newResident} from '../src/rules/npc-world.js';
import {persistNpcResident} from '../src/npc-characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {PostgresStore, type SqlPool} from '../../persistence/src/postgres.ts';
import type {Store} from '../../persistence/src/store.ts';
import {SimulationRepository, type TransferBoundary} from '../../persistence/src/simulation.ts';
import {residentStore, transferResidentClaims} from '../src/resident-store.ts';
import {ResidentCharacters, type CharacterAdmission, type Residency} from '../src/resident-characters.ts';
import {GameService} from '../src/service.ts';
import {context, persistCharacter} from '../src/context.ts';
import type {Character,Rules} from '../src/model.ts';
import {ResidentInstance, type InstanceCheckpoint} from '../../../apps/simulation-host/src/instance.ts';
import {composeDungeonCheckpoint} from '../../../apps/simulation-host/src/dungeon-composition.ts';
import {rebaseSimulation} from '../src/simulation-clock.ts';
import {addPeriodicEffect} from '../src/rules/simulation-events.js';
import {runtimeVersion} from '../../../apps/simulation-host/src/version.ts';
import {residentPartyFixture} from './support/resident-party.ts';
import {participantState} from '../src/resident-participants.ts';

function pool(db: PGlite): SqlPool {
  let tail = Promise.resolve();
  return {async connect() {const previous=tail;let release!:()=>void;tail=new Promise(r=>release=r);await previous;
    return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}

for (const backend of ['memory','sql'] as const) test(`${backend}: sealed residents transfer all identities atomically and retired rooms can never recover`, async()=>{
  const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));
  if(raw instanceof PostgresStore)await raw.initialize();
  const store=residentStore(raw),game=new GameService(store,{contentVersion:'transfer',seed:()=>283});
  const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
  try {
    const admissions:CharacterAdmission[]=[];
    for(const accountId of ['alice','bob']){
      const created=await game.createAccount(accountId,{name:accountId,classId:8,raceId:1},'create');
      await store.transaction(async tx=>{
        const row=(await tx.get<Character>('characters',created.state.id))!,state=await context(tx,row,Date.now(),false);
        state.level=20;await persistCharacter(tx,row,state,state.wallAt,'supply:'+accountId);
      });
      const admission=await characters.admission(accountId,created.state.id);
      const index=admissions.length;
      const profiles=[0,4,3].slice(0,index?1:2).map((n)=>newResident({id:'realm',level:20,raceId:1,clock:0,wallAt:Date.now(),location:'deadmines'},index*100+n,20));
      admission.state.npcWorld={publicPool:true,residents:profiles,selection:[],autoLoot:false,board:{ids:[],shown:{},refreshAt:0,sequence:0}};
      await store.transaction(async tx=>{for(const profile of profiles){await persistNpcResident(tx,profile,'seed:'+profile.id);await tx.insert('simulation_characters',{id:profile.id,accountId:null,instanceId:admission.instanceId});}});
      admissions.push(admission);
    }
    const owners=[],boundaryWall=Date.now();
    for(const [index,admission]of admissions.entries()){
      const state=admission.state;state.wallAt=boundaryWall;state.location='deadmines';
      rebaseSimulation(state,10000+index*12345);
      state.party=state.npcWorld.residents.slice(0,index?1:2).map((p:Rules)=>structuredClone(p.unit));
      state.npcWorld.selection=state.party.map((c:Rules)=>c.id);
      addPeriodicEffect(state,state,'hots',{spell:139,name:'Renew',caster:state.id,amount:10,next:state.clock+1000,interval:1000,until:state.clock+3000});
      const owner=await repository.acquire(admission.instanceId,'source-host',60000);
      const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch});
      await repository.commit(owner,1,runtime.checkpoint());owner.commitSequence=1;owners.push(await repository.seal(owner,'join-party'));
    }
    const before=await store.read(async tx=>({claims:await tx.list('simulation_characters'),items:await tx.list('items'),wallets:await tx.list('wallets'),npcs:await tx.list('npc_characters')}));
    assert.equal(before.claims.length,5);
    let fail=true,calls=0,omitNpc=false;
    const create:TransferBoundary<InstanceCheckpoint>=async(tx,{transferId,destinations:[destination],sources})=>{
      calls++;
      const checkpoint=composeDungeonCheckpoint(sources.map(s=>s.checkpoint),{instanceId:destination.id,ownerEpoch:destination.epoch,primaryActorId:admissions[0].state.id,roster:{groupId:'test:party',leaderId:admissions[0].state.id,dungeonId:'deadmines',members:sources.flatMap(s=>[s.checkpoint.state,...s.checkpoint.state.party].map((c:Rules)=>({id:c.id,npc:!!c.npcPlayer}))) }});
      const {state,controllers,presence}=checkpoint;
      if(omitNpc)state.party.find((c:Rules)=>c.id===admissions[1].state.id).npcWorld.residents.pop();
      const admission:CharacterAdmission={instanceId:destination.id,state,controllers,presence:presence!};
      const residency:Residency={id:destination.id,characterId:state.id,accountId:'alice',...runtimeVersion,
        participants:controllers.map(c=>({characterId:c.actorId,accountId:c.accountId})),encodedAdmission:JSON.stringify(admission)};
      await transferResidentClaims(tx,transferId,sources.map(s=>s.owner),[residency]);
      await assert.rejects(tx.put('wallets',{id:state.id,characterId:state.id,balance:0}),/模拟实例/,'transfer never grants general asset write access');
      if(fail)throw new Error('failure after moving claims');
      return [checkpoint];
    };
    await assert.rejects(repository.transfer('join-party',owners,['shared:joined'],create),/failure after moving/);
    assert.deepEqual(await store.read(tx=>tx.list('simulation_characters')),before.claims);
    assert.equal(await repository.load('shared:joined'),null);
    assert.equal(await store.read(tx=>tx.get('simulation_owners','shared:joined')),null);
    assert.equal((await characters.find('bob',admissions[1].state.id))!.instanceId,owners[1].id);
    fail=false;omitNpc=true;
    await assert.rejects(repository.transfer('join-party',owners,['shared:joined'],create),/未归属|全部真人与 NPC/);
    omitNpc=false;
    assert.deepEqual(await repository.transfer('join-party',owners,['shared:joined'],create),{instanceIds:['shared:joined'],duplicate:false});
    const callsAfterCommit=calls;
    assert.equal((await repository.transfer('join-party',owners,['shared:joined'],create)).duplicate,true);assert.equal(calls,callsAfterCommit);
    await assert.rejects(repository.transfer('join-party',owners,['shared:different'],create),/reused/);
    const after=await store.read(async tx=>({claims:await tx.list('simulation_characters'),items:await tx.list('items'),wallets:await tx.list('wallets'),npcs:await tx.list('npc_characters')}));
    assert.deepEqual(after.items,before.items);assert.deepEqual(after.wallets,before.wallets);assert.deepEqual(after.npcs,before.npcs);
    assert.equal(after.claims.length,5);assert.ok(after.claims.every(c=>c.instanceId==='shared:joined'));
    for(const [i,owner]of owners.entries()){
      assert.equal(await store.read(tx=>tx.get('simulation_residencies',owner.id)),null);
      assert.equal((await characters.find(i?'bob':'alice',admissions[i].state.id))!.instanceId,'shared:joined');
      await assert.rejects(repository.acquire(owner.id,'stale-admission'),/permanently transferred/);
      await assert.rejects(repository.unseal(owner,'join-party'),/fenced/);
      await assert.rejects(repository.renew(owner),/fenced/);
      assert.equal(await repository.load(owner.id),null,'retired rooms do not retain duplicate full state');
      const old=new ResidentInstance({...admissions[i],ownerEpoch:owner.epoch}).checkpoint();
      await assert.rejects(repository.commit(owner,2,old),/fenced/);
    }
    // Crash after transaction, before target Worker startup: recover solely
    // from durable claims and checkpoint with the normal owner protocol.
    const recovered=await repository.acquire('shared:joined','replacement-host',60000);
    assert.equal(recovered.epoch,2);assert.equal(recovered.commitSequence,1);
    const loaded=(await repository.load<InstanceCheckpoint>('shared:joined'))!.checkpoint;
    assert.equal(loaded.state.dungeon.id,'deadmines');assert.equal(loaded.state.party.length,4);
    assert.equal(loaded.state.party.filter((c:Rules)=>!c.npcPlayer).length,1);
    const restored=ResidentInstance.restore(loaded,recovered.epoch);
    await repository.commit(recovered,2,restored.checkpoint());
    assert.equal((await repository.load<InstanceCheckpoint>('shared:joined'))!.checkpoint.controllers.length,2);
    assert.equal((await store.read(tx=>tx.list('simulation_characters',{instanceId:'shared:joined'}))).length,5);
    const activeNpcIds=new Set(loaded.state.party.filter((c:Rules)=>c.npcPlayer).map((c:Rules)=>c.id));
    const persistedNpcs=await store.read(tx=>tx.list('npc_characters'));
    assert.equal(activeNpcIds.size,3);
    for(const npc of persistedNpcs)assert.equal(npc.profile.runs,activeNpcIds.has(npc.id)?1:0);
    await repository.commit(recovered,2,restored.checkpoint());
    assert.deepEqual(await store.read(tx=>tx.list('npc_characters')),persistedNpcs,'retry does not increment participation twice');
  } finally {await store.close();}
});

for(const backend of ['memory','sql'] as const)test(`${backend}: a shared residency partitions human participants exactly once without moving assets`,async()=>{
 const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));
 if(raw instanceof PostgresStore)await raw.initialize();
 try{
  const {admission,participants}=await residentPartyFixture(raw,Date.now(),room=>{
   for(const actor of [room,...room.party])actor.level=20;
  });
  const store=residentStore(raw),characters=new ResidentCharacters(store,{version:runtimeVersion});
  const repo=new SimulationRepository(store,Date.now,characters.commit);
  let owner=await repo.acquire(admission.instanceId,'source',60000);
  const sourceRuntime=new ResidentInstance({...admission,ownerEpoch:owner.epoch});
  await repo.commit(owner,1,sourceRuntime.checkpoint());owner.commitSequence=1;owner=await repo.seal(owner,'split-residents');
  const source=owner;
  const before=await store.read(async tx=>({claims:await tx.list('simulation_characters'),items:await tx.list('items'),wallets:await tx.list('wallets'),npcs:await tx.list('npc_characters')}));
  assert.equal(before.claims.length,2);
  const ids=['personal:alice-split','personal:bob-split'];
  let fault='';
  const create:TransferBoundary<InstanceCheckpoint>=async(tx,{destinations,sources,transferId})=>{
   // Empty, idle fixture: no accepted inputs or effect queues to partition.
   // Gameplay splitting must separately preserve those runtime cursors.
   const checkpoints=destinations.map((destination,i)=>{
    const participant=participants[i],state=structuredClone(participantState(sources[0].checkpoint.state,participant.characterId));
    state.party=[];
    return new ResidentInstance({instanceId:destination.id,ownerEpoch:destination.epoch,state,
     controllers:[{actorId:state.id,accountId:participant.accountId,generation:2,canPause:true}],
     presence:{offlineLimitMs:7200000,accounts:[[participant.accountId,state.wallAt]]}}).checkpoint();
   });
   const rows:Residency[]=checkpoints.map((checkpoint,i)=>({id:checkpoint.instanceId,characterId:checkpoint.state.id,accountId:participants[i].accountId,
    ...runtimeVersion,participants:[participants[i]],encodedAdmission:JSON.stringify({instanceId:checkpoint.instanceId,state:checkpoint.state,
     controllers:checkpoint.controllers,presence:checkpoint.presence})}));
   if(fault==='duplicate-human')rows[1].participants=[participants[0]];
   if(fault==='missing-human')rows.pop();
   if(fault==='foreign-account')rows[1].participants=[{...participants[1],accountId:'alice'}];
   if(fault==='foreign-controller'){
    const state=JSON.parse(rows[1].encodedAdmission);state.controllers[0].actorId=participants[0].characterId;rows[1].encodedAdmission=JSON.stringify(state);
   }
   if(fault==='foreign-occupant'){
    const state=JSON.parse(rows[1].encodedAdmission);
    state.state.party=[structuredClone(checkpoints[0].state)];
    rows[1].encodedAdmission=JSON.stringify(state);
   }
   await transferResidentClaims(tx,transferId,sources.map(s=>s.owner),rows);
   await assert.rejects(tx.put('wallets',{id:participants[0].characterId,characterId:participants[0].characterId,balance:0}),/模拟实例/);
   if(fault==='after-claims')throw new Error('failure after partitioned claims');
   return checkpoints;
  };
  for(fault of ['duplicate-human','missing-human','foreign-account','foreign-controller','foreign-occupant','after-claims']){
   await assert.rejects(repo.transfer('split-residents',[source],ids,create));
   assert.deepEqual(await store.read(tx=>tx.list('simulation_characters')),before.claims,fault);
   for(const id of ids){assert.equal(await repo.load(id),null);assert.equal(await store.read(tx=>tx.get('simulation_residencies',id)),null);}
   for(const p of participants)assert.equal((await characters.find(p.accountId,p.characterId))!.instanceId,source.id);
  }
  fault='';await repo.transfer('split-residents',[source],ids,create);
  assert.equal((await repo.transfer('split-residents',[source],ids,create)).duplicate,true);
  const after=await store.read(async tx=>({claims:await tx.list('simulation_characters'),items:await tx.list('items'),wallets:await tx.list('wallets'),npcs:await tx.list('npc_characters')}));
  assert.equal(after.claims.length,before.claims.length);
  assert.deepEqual(after.items,before.items);assert.deepEqual(after.wallets,before.wallets);assert.deepEqual(after.npcs,before.npcs);
  for(const [i,p]of participants.entries()){
   const admission=await characters.find(p.accountId,p.characterId);assert.equal(admission!.instanceId,ids[i]);
   const owned=after.claims.filter(c=>c.accountId===p.accountId);assert.equal(owned.length,1);assert.ok(owned.every(c=>c.instanceId===ids[i]));
   const loaded=(await repo.load<InstanceCheckpoint>(ids[i]))!,recovered=await repo.acquire(ids[i],'recovery:'+i,60000);
   const runtime=ResidentInstance.restore(loaded.checkpoint,recovered.epoch);
   assert.equal(runtime.checkpoint().state.money,(i+1)*1111);assert.equal(runtime.checkpoint().controllers.length,1);
   await repo.commit(recovered,2,runtime.checkpoint());
   await assert.rejects(store.transaction(tx=>tx.put('wallets',{id:p.characterId,characterId:p.characterId,balance:0})),/模拟实例/);
  }
  await assert.rejects(repo.acquire(source.id,'resurrect'),/permanently transferred/);
  assert.equal(await repo.load(source.id),null);
 }finally{await raw.close();}
});
