import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {PostgresStore,type SqlPool} from '../../../packages/persistence/src/postgres.ts';
import {SimulationRepository,type TransferBoundary} from '../../../packages/persistence/src/simulation.ts';
import {residentStore,transferResidentClaims} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters,type CharacterAdmission,type Residency} from '../../../packages/game-domain/src/resident-characters.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context,persistCharacter} from '../../../packages/game-domain/src/context.ts';
import {ensureNpcMatchSupply,ensureNpcWorld,progressNpcWorld,creditNpcMoney} from '../../../packages/game-domain/src/rules/npc-world.js';
import type {Character,Rules} from '../../../packages/game-domain/src/model.ts';
import {ResidentInstance,type InstanceCheckpoint} from '../src/instance.ts';
import {detachStandbyNpcs} from '../src/npc-transfer.ts';
import {composeDungeonCheckpoint} from '../src/dungeon-composition.ts';
import {runtimeVersion} from '../src/version.ts';

function pool(db:PGlite):SqlPool{
 let tail=Promise.resolve();return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(r=>release=r);await previous;
 return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}
const residency=(cp:InstanceCheckpoint):Residency=>({id:cp.instanceId,characterId:cp.state.id,accountId:cp.controllers.find(c=>c.actorId===cp.state.id)!.accountId,...runtimeVersion,
 participants:cp.controllers.map(c=>({characterId:c.actorId,accountId:c.accountId})),encodedAdmission:JSON.stringify({instanceId:cp.instanceId,state:cp.state,controllers:cp.controllers,presence:cp.presence})});

for(const backend of ['memory','sql'])test(`${backend}: standby NPC custody moves without its human, earns privately, and reunites without replacing assets`,async()=>{
 const raw=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));if(raw instanceof PostgresStore)await raw.initialize();
 const store=residentStore(raw),game=new GameService(store,{contentVersion:'npc-custody',seed:()=>283});
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
 try{
  const admissions:CharacterAdmission[]=[],owners=[];
  for(const accountId of ['alice','bob']){
   const made=await game.createAccount(accountId,{name:accountId,classId:8,raceId:1},'create');
   await store.transaction(async tx=>{const row=(await tx.get<Character>('characters',made.state.id))!,state=await context(tx,row,Date.now(),false);
    state.level=20;state.location=accountId==='alice'?'deadmines':'goldshire';ensureNpcMatchSupply(state);await persistCharacter(tx,row,state,state.wallAt,'seed:'+accountId);
   });
   admissions.push(await characters.admission(accountId,made.state.id));
  }
  const wall=Date.now();for(const admission of admissions)admission.state.wallAt=wall;
  const remote=admissions[1],ids=remote.state.npcWorld.residents.slice(0,3).map((p:Rules)=>p.id);
  // The owner's position and activity are unrelated to the NPC's destination.
  const remoteRuntime=new ResidentInstance({...remote,ownerEpoch:1});
  const travel=remoteRuntime.input('bob',{instanceId:remote.instanceId,actorId:remote.state.id,controllerGeneration:1,clientSequence:1,requestId:'walk',command:{kind:'action',action:{type:'travel',to:'stormwind'}}});
  assert.equal(travel.status,'applied');remote.state=remoteRuntime.checkpoint().state;
  const originalActivity=structuredClone(remote.state.activity);
  for(const admission of admissions){const owner=await repository.acquire(admission.instanceId,'before',60000);const cp=admission===remote?remoteRuntime.checkpoint():new ResidentInstance({...admission,ownerEpoch:owner.epoch}).checkpoint();await repository.commit(owner,1,cp);owner.commitSequence=1;owners.push(await repository.seal(owner,'borrow'));}
  const roster={groupId:'custody:party',leaderId:admissions[0].state.id,dungeonId:'deadmines',members:[...admissions.map(a=>({id:a.state.id,npc:false})),...ids.map((id:string)=>({id,npc:true}))]};
  const before=await store.read(async tx=>({items:await tx.list('items'),wallets:await tx.list('wallets'),claims:await tx.list('simulation_characters')}));
  const boundary:TransferBoundary<InstanceCheckpoint>=async(tx,{transferId,destinations,sources})=>{
   const detached=detachStandbyNpcs(sources[1].checkpoint,ids,{instanceId:destinations[1].id,ownerEpoch:destinations[1].epoch});
   const arrival=structuredClone(sources[0].checkpoint);
   const room=composeDungeonCheckpoint([arrival],{instanceId:destinations[0].id,ownerEpoch:destinations[0].epoch,primaryActorId:arrival.state.id,roster,selectMatchedNpcs:true,npcArrivals:[detached.arrival]});
   const result=[room,detached.checkpoint];await transferResidentClaims(tx,transferId,sources.map(s=>s.owner),result.map(residency));return result;
  };
  await assert.rejects(repository.transfer<InstanceCheckpoint>('borrow',owners,['dungeon:borrowed','personal:outside'],async(tx,transfer)=>{await boundary(tx,transfer);throw Error('Rollback borrowed NPC');}),/Rollback borrowed/);
  assert.deepEqual(await store.read(tx=>tx.list('simulation_characters')),before.claims);
  await repository.transfer('borrow',owners,['dungeon:borrowed','personal:outside'],boundary);
  assert.equal((await repository.transfer('borrow',owners,['dungeon:borrowed','personal:outside'],boundary)).duplicate,true);
  const insideOwner=await repository.acquire('dungeon:borrowed','after',60000),outsideOwner=await repository.acquire('personal:outside','after',60000);
  const inside=ResidentInstance.restore((await repository.load<InstanceCheckpoint>(insideOwner.id))!.checkpoint,insideOwner.epoch),outside=ResidentInstance.restore((await repository.load<InstanceCheckpoint>(outsideOwner.id))!.checkpoint,outsideOwner.epoch);
  const room=inside.checkpoint(),personal=outside.checkpoint();
  assert.equal(room.controllers.length,1);assert.equal(room.state.party.length,3);
  assert.equal(personal.recentInputs[0].input.requestId,'walk');assert.equal(personal.recentInputs[0].input.instanceId,personal.instanceId);
  assert.deepEqual(personal.state.activity,originalActivity);assert.equal(personal.state.location,'goldshire');
  assert.deepEqual(personal.state.npcWorld.away.map((p:Rules)=>p.id),ids);
  assert.ok(ids.every((id:string)=>!personal.state.npcWorld.residents.some((p:Rules)=>p.id===id)));
  const own=structuredClone(personal.state);ensureNpcWorld(own,0);progressNpcWorld(own);
  assert.ok(ids.every((id:string)=>!own.npcWorld.residents.some((p:Rules)=>p.id===id)));
  const view=inside.presentation('alice',room.state.id,'full').snapshot!;
  assert.equal(view.player.npcGuests,undefined);assert.ok(!(view.view.npcWorld as Rules).residents.some((p:Rules)=>ids.includes(p.id)));
  creditNpcMoney(room.state,room.state.party[0],321);
  const earned=room.state.npcGuests[0].profile.wallet;
  await repository.commit(insideOwner,2,room);insideOwner.commitSequence=2;
  await repository.commit(outsideOwner,2,personal);outsideOwner.commitSequence=2;
  assert.equal((await store.read(tx=>tx.get('wallets',ids[0])))!.balance,earned);
  assert.equal((await store.read(tx=>tx.get('wallets',remote.state.id)))!.balance,before.wallets.find(w=>w.id===remote.state.id)!.balance);
  // Reconstructing the outside owner's DB view also keeps foreign-owned state
  // absent instead of silently loading a second writable profile.
  const loaded=await store.read(async tx=>context(tx,(await tx.get<Character>('characters',remote.state.id))!,wall,false));
  assert.deepEqual(loaded.npcWorld.away.map((p:Rules)=>p.id),ids);
  assert.ok(ids.every((id:string)=>!loaded.npcWorld.residents.some((p:Rules)=>p.id===id)));
  const illicit=structuredClone(personal),profile=structuredClone(room.state.npcGuests[0].profile);
  illicit.state.npcWorld.residents.push(profile);illicit.state.npcWorld.away=illicit.state.npcWorld.away.filter((p:Rules)=>p.id!==profile.id);
  await assert.rejects(repository.commit(outsideOwner,3,illicit),/另一实例|模拟实例/);
  // A later human arrival consumes the away reference and uses the real guest
  // profile, including earned money. No database state is copied over it.
  personal.state.activity={type:'idle'};personal.state.location='deadmines';personal.state.wallAt=room.state.wallAt;
  const joined=composeDungeonCheckpoint([room,personal],{instanceId:'dungeon:reunited',ownerEpoch:1,primaryActorId:room.state.id,roster,selectMatchedNpcs:true});
  assert.equal(joined.state.npcGuests,undefined);
  const reunited=joined.state.party.find((a:Rules)=>a.id===remote.state.id)!;
  assert.equal(reunited.npcWorld.away.length,0);assert.equal(reunited.npcWorld.residents.find((p:Rules)=>p.id===ids[0]).wallet,earned);
  assert.equal(joined.controllers.length,2);assert.equal(joined.state.party.length,4);
 }finally{await store.close();}
});
