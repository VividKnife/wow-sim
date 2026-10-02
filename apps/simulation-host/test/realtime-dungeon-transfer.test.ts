import {updateNpcPopulation} from '../../../packages/game-domain/src/npc-population.ts';
import {dungeonDepartureBoundary,dungeonDepartureTransferId} from '../src/dungeon-departure-transfer.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {dungeonTransferBoundary,dungeonEntryTransferId} from '../src/dungeon-transfer.ts';
import {runtimeVersion} from '../src/version.ts';
import type {InstanceCheckpoint} from '../src/instance.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {PGlite} from '@electric-sql/pglite';
import {PostgresStore,type SqlPool} from '../../../packages/persistence/src/postgres.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {ResidentCharacters,type CharacterAdmission} from '../../../packages/game-domain/src/resident-characters.ts';
import {SocialService} from '../../../packages/game-domain/src/social.ts';
import {requestDungeonEntry} from '../../../packages/game-domain/src/dungeon-entry.ts';
import {combatRole} from '../../../packages/game-domain/src/rules/combat-roles.js';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {context,persistCharacter} from '../../../packages/game-domain/src/context.ts';
import type {Character,Rules} from '../../../packages/game-domain/src/model.ts';
import {addPeriodicEffect} from '../../../packages/game-domain/src/rules/simulation-events.js';
import {rebaseSimulation} from '../../../packages/game-domain/src/simulation-clock.ts';

function pool(db:PGlite):SqlPool{
  let tail=Promise.resolve();
  return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(r=>release=r);await previous;
    return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}

for(const backend of ['memory','sql'])for(const mode of ['together','separate'])test(`${backend}/${mode}: live personal rooms enter manually and recover two humans with three NPCs through normal admission`,async()=>{
  const raw=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));
  if(raw instanceof PostgresStore)await raw.initialize();
  const store=residentStore(raw),host=new SimulationHost();
  const game=new GameService(store,{contentVersion:'live-transfer',seed:()=>283});
  const characters=new ResidentCharacters(store,{version:runtimeVersion});
  const repository=new SimulationRepository(store,Date.now,characters.commit);
  const social=new SocialService(store);
  const sessions:SimulationSession[]=[],admissions:CharacterAdmission[]=[];
  let target:SimulationSession|undefined;
  try{
    for(const [index,accountId] of ['alice','bob'].entries()){
      const created=await game.createAccount(accountId,{name:accountId,classId:8,raceId:1},'create');
      await store.transaction(async tx=>{
        const row=(await tx.get<Character>('characters',created.state.id))!;
        const state=await context(tx,row,Date.now(),false);
        state.level=20;state.location='deadmines';await updateNpcPopulation(tx,state.wallAt,{level:20});
        await persistCharacter(tx,row,state,state.wallAt,'supply:'+accountId);
      });
      const admission=await characters.admission(accountId,created.state.id),state=admission.state;
      rebaseSimulation(state,10000+index*12345);
      addPeriodicEffect(state,state,'hots',{spell:139,name:'Renew',caster:state.id,amount:10,next:state.clock+1000,interval:1000,until:state.clock+30000});
      admissions.push(admission);
      sessions.push(await SimulationSession.open(host,repository,'host',admission,{checkpointMs:10000}));
    }
    const command=(index:number,body:Rules)=>social.command(index?'bob':'alice',admissions[index].state.id,{requestId:crypto.randomUUID(),...body});
    await command(0,{type:'role',role:'dps'});
    await command(0,{type:'partyInvite',targetId:admissions[1].state.id});
    const invitation=(await social.snapshot('bob',admissions[1].state.id)).incoming[0];
    await command(1,{type:'respond',inviteId:invitation.id,accept:true});await command(1,{type:'role',role:'dps'});
    const candidates=await store.read(tx=>tx.list('npc_characters'));
    for(const role of ['tank','healer','dps']){const npc=candidates.find(p=>(['tank','healer'].includes(combatRole(p.rules))?combatRole(p.rules):'dps')===role)!;await command(0,{type:'npcInvite',targetId:npc.id});}
    const matching=await command(0,{type:'queue',dungeonId:'deadmines'}),proposal=matching.proposal!;
    const incomplete=await command(0,{type:'proposal',proposalId:proposal.id,accept:true});
    assert.equal(incomplete.group!.entry,undefined);
    const gathering=await command(1,{type:'proposal',proposalId:proposal.id,accept:true}),entry=gathering.group!.entry!;
    assert.equal(entry.id,proposal.id);assert.equal(gathering.policy.autoTeleport,false);
    // The entering human may initiate recovery; matching acceptance does not
    // grant permission to move anyone else's character into the dungeon.
    const request={accountId:'bob',actorId:admissions[1].state.id,groupId:gathering.group!.id,entryId:entry.id};
    const transferId=dungeonEntryTransferId(request);
    const quiesce=host.quiesce.bind(host),frozen=new Map<string,InstanceCheckpoint>();
    host.quiesce=async id=>{
      if(id===admissions[1].instanceId)await delay(160);
      const checkpoint=await quiesce(id);frozen.set(id,checkpoint);return checkpoint;
    };
    const prepared=mode==='together'?await SimulationSession.prepareGroupTransfer(sessions,transferId):[await sessions[1].prepareTransfer(transferId)];
    if(mode==='together')assert.ok(frozen.get(admissions[1].instanceId)!.state.wallAt>frozen.get(admissions[0].instanceId)!.state.wallAt);
    assert.equal(new Set(prepared.map(p=>p.checkpoint.state.wallAt)).size,1);
    assert.ok(prepared.every(p=>p.checkpoint.state.hots.length===1));
    const assets=await store.read(async tx=>({items:await tx.list('items'),wallets:await tx.list('wallets')}));
    let destinationId='dungeon:live-entry';
    const boundary=dungeonTransferBoundary(request),owners=prepared.map(p=>p.owner);
    await assert.rejects(repository.transfer(transferId,owners,[destinationId],boundary),/各自在副本入口/);
    await store.transaction(tx=>requestDungeonEntry(tx,request));
    if(mode==='together'){
      await assert.rejects(repository.transfer(transferId,owners,[destinationId],boundary),/各自在副本入口/);
      await store.transaction(tx=>requestDungeonEntry(tx,{...request,accountId:'alice',actorId:admissions[0].state.id}));
    }
    await assert.rejects(repository.transfer<InstanceCheckpoint>(transferId,owners,[destinationId],async(tx,context)=>{
      await boundary(tx,context);throw new Error('Failure after group binding and claims');
    }),/Failure after group binding/);
    const rolledBack=(await social.snapshot('alice',admissions[0].state.id)).group!;
    assert.equal(rolledBack.instanceId,undefined);assert.equal(rolledBack.entry!.id,entry.id);
    assert.equal(await repository.load(destinationId),null);
    assert.equal((await characters.find('bob',admissions[1].state.id))!.instanceId,admissions[1].instanceId);
    await repository.transfer(transferId,owners,[destinationId],boundary);
    assert.equal((await repository.transfer(transferId,owners,[destinationId],boundary)).duplicate,true);
    const entered=(await social.snapshot('alice',admissions[0].state.id)).group!;
    assert.equal(entered.instanceId,destinationId);assert.equal(entered.entry!.id,entry.id);
    await assert.rejects(command(1,{type:'leave'}),/先离开副本/);
    await Promise.all((mode==='together'?sessions:[sessions[1]]).map(s=>s.discard()));
    assert.equal(host.inspect()[0].instances,mode==='together'?0:1);
    assert.deepEqual(await store.read(async tx=>({items:await tx.list('items'),wallets:await tx.list('wallets')})),assets);
    for(const p of prepared){
      await assert.rejects(repository.unseal(p.owner,transferId),/fenced/);
      await assert.rejects(repository.acquire(p.owner.id,'stale-host'),/permanently transferred/);
      const controller=p.checkpoint.controllers[0];
      assert.equal((await characters.find(controller.accountId,controller.actorId))!.instanceId,destinationId);
    }
    if(mode==='separate'){
      const firstAdmission=(await characters.find('bob',admissions[1].state.id))!;
      target=await SimulationSession.open(host,repository,'first-arrival-host',firstAdmission,{checkpointMs:10000});
      const first=await host.checkpoint(destinationId);
      assert.equal(first.controllers.length,1);assert.equal(first.state.party.length,0);
      assert.ok((await store.read(tx=>tx.list('npc_characters'))).every(npc=>npc.profile.runs===0));
      assert.equal(first.state.sharedParty.leaderId,admissions[0].state.id);
      assert.equal((await characters.find('alice',admissions[0].state.id))!.instanceId,admissions[0].instanceId);
      await assert.rejects(target.presentation('alice',admissions[0].state.id,'full'),/Presentation access denied/);
      const nextRequest={...request,accountId:'alice',actorId:admissions[0].state.id};
      const nextTransferId=dungeonEntryTransferId(nextRequest);
      assert.notEqual(nextTransferId,transferId);
      await store.transaction(tx=>requestDungeonEntry(tx,nextRequest));
      const next=await SimulationSession.prepareGroupTransfer([target,sessions[0]],nextTransferId);
      const nextDestination='dungeon:later-arrival',nextBoundary=dungeonTransferBoundary(nextRequest);
      await assert.rejects(repository.transfer(nextTransferId,[next[1].owner],[nextDestination],nextBoundary),/Existing dungeon/);
      await assert.rejects(repository.transfer<InstanceCheckpoint>(nextTransferId,next.map(p=>p.owner),[nextDestination],async(tx,context)=>{
        await nextBoundary(tx,context);throw new Error('Failed later arrival');
      }),/Failed later arrival/);
      assert.equal((await social.snapshot('bob',admissions[1].state.id)).group!.instanceId,destinationId);
      assert.equal((await characters.find('alice',admissions[0].state.id))!.instanceId,admissions[0].instanceId);
      await repository.transfer(nextTransferId,next.map(p=>p.owner),[nextDestination],nextBoundary);
      assert.equal((await repository.transfer(nextTransferId,next.map(p=>p.owner),[nextDestination],nextBoundary)).duplicate,true);
      await target.discard();target=undefined;await sessions[0].discard();
      for(const p of next){
        await assert.rejects(repository.unseal(p.owner,nextTransferId),/fenced/);
        await assert.rejects(repository.acquire(p.owner.id,'stale-host'),/permanently transferred/);
      }
      destinationId=nextDestination;
      assert.equal(host.inspect()[0].instances,0);
      assert.equal((await social.snapshot('alice',admissions[0].state.id)).group!.instanceId,destinationId);
    }
    // There is deliberately no in-memory destination handoff. Normal character
    // routing and the persisted checkpoint must survive that process boundary.
    const admission=(await characters.find('bob',admissions[1].state.id))!;
    target=await SimulationSession.open(host,repository,'replacement-host',admission,{checkpointMs:10000});
    const checkpoint=await host.checkpoint(destinationId);
    assert.equal(checkpoint.ownerEpoch,2);assert.equal(checkpoint.controllers.length,2);
    assert.equal(checkpoint.state.dungeon.id,'deadmines');assert.equal(checkpoint.state.party.length,4);
    assert.equal(checkpoint.state.location,'deadmines');
    assert.ok(checkpoint.controllers.every(c=>c.generation===(mode==='separate'&&c.accountId==='bob'?3:2)&&!c.canPause));
    assert.equal(checkpoint.state.party.filter((c:Rules)=>c.npcPlayer).length,3);
    assert.ok(checkpoint.state.party.filter((c:Rules)=>c.npcPlayer).every((c:Rules)=>c.location==='deadmines'));
    assert.equal((await store.read(tx=>tx.list('simulation_characters',{instanceId:destinationId}))).length,5);
    const npcs=await store.read(tx=>tx.list('npc_characters'));
    const activeIds=new Set(checkpoint.state.party.filter((c:Rules)=>c.npcPlayer).map((c:Rules)=>c.id));
    for(const npc of npcs)assert.equal(npc.profile.runs,activeIds.has(npc.id)?1:0);
    for(const [index,accountId]of ['alice','bob'].entries()){
      assert.ok(await target.presentation(accountId,admissions[index].state.id,'full',true));
      await assert.rejects(target.presentation(accountId,admissions[index?0:1].state.id,'full'),/Presentation access denied/);
    }
    const departing=checkpoint.controllers.find(c=>c.accountId==='alice')!;
    const exitInput:SimulationInput={instanceId:destinationId,actorId:departing.actorId,controllerGeneration:departing.generation,
      clientSequence:1,requestId:'exit-'+backend+'-'+mode,command:{kind:'action',action:{type:'leaveDungeon'}}};
    const exitId=dungeonDepartureTransferId('alice',exitInput),sealed=await target.prepareTransfer(exitId);
    const exitRequest={...request,accountId:'alice',actorId:departing.actorId};
    const exitBoundary=dungeonDepartureBoundary(exitRequest,exitInput),destinationIds=['personal:departed','dungeon:remaining'];
    const claimsBefore=await store.read(tx=>tx.list('simulation_characters'));
    await assert.rejects(repository.transfer<InstanceCheckpoint>(exitId,[sealed.owner],destinationIds,async(tx,context)=>{
      await exitBoundary(tx,context);throw new Error('Departure rollback');
    }),/Departure rollback/);
    assert.equal((await social.snapshot('alice',departing.actorId)).group!.instanceId,destinationId);
    assert.deepEqual(await store.read(tx=>tx.list('simulation_characters')),claimsBefore);
    assert.equal(await repository.load(destinationIds[0]),null);
    await repository.transfer(exitId,[sealed.owner],destinationIds,exitBoundary);
    assert.equal((await repository.transfer(exitId,[sealed.owner],destinationIds,exitBoundary)).duplicate,true);
    await assert.rejects(repository.unseal(sealed.owner,exitId),/fenced/);
    await target.discard();target=undefined;
    assert.equal((await social.snapshot('bob',admissions[1].state.id)).group!.instanceId,destinationIds[1]);
    for(const [index,accountId]of ['alice','bob'].entries()){
      const recovered=(await characters.find(accountId,admissions[index].state.id))!;
      assert.equal(recovered.instanceId,destinationIds[index]);
      const session=await SimulationSession.open(host,repository,'departed-host',recovered,{checkpointMs:10000});sessions.push(session);
      const view=await session.presentation(accountId,admissions[index].state.id,'full',true);
      assert.ok(view.snapshot);assert.equal(!!view.snapshot.player.dungeon,index===1);
      const persisted=await host.checkpoint(recovered.instanceId);
      assert.equal(persisted.controllers.length,1);
      assert.equal(persisted.state.party.length,index===0?0:3);
      if(index===1)assert.equal(persisted.state.dungeon.runId,checkpoint.state.dungeon.runId);
    }
  }finally{
    await target?.close();await Promise.allSettled(sessions.map(s=>s.close()));await host.close();await store.close();
  }
});
