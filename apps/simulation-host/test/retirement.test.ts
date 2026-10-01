import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {SimulationDirectory} from '../src/directory.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {runtimeVersion} from '../src/version.ts';
import type {InstanceCheckpoint} from '../src/instance.ts';

async function until(check:()=>boolean|Promise<boolean>){
  const end=Date.now()+6000;
  while(!await check()){if(Date.now()>end)throw new Error('Expected lifecycle transition did not complete');await delay(20);}
}
function expired(instanceId:string){
  const state=localScenarios().solo,at=Date.now()-5000;state.wallAt=at;
  return {instanceId,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}],
    presence:{offlineLimitMs:1000,accounts:[['alice',at] as [string,number]]}};
}

test('retirement saves the exact cutoff, frees capacity and stops IO while preserving durable recovery',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),directory=new SimulationDirectory(repository,{maxInstances:1,checkpointMs:100});
 try{
  const admission=expired('retire'),first=await directory.open(admission);
  await until(()=>directory.inspect().instances===0);
  assert.equal(directory.inspect().shards[0].instances,0);
  const saved=(await repository.load<InstanceCheckpoint>(first.instanceId))!;
  assert.equal(saved.checkpoint.state.wallAt,admission.state.wallAt+1000);
  assert.equal(saved.checkpoint.state.clock,1000);
  const owner=await store.read(tx=>tx.get('simulation_owners',first.instanceId));assert.ok(owner!.expiresAt<=Date.now());
  await delay(250);assert.deepEqual(await repository.load(first.instanceId),saved,'retired rooms perform no more checkpoint writes');
  await directory.open({...admission,instanceId:'other'});assert.equal(directory.inspect().instances,1);
  await directory.remove('other');
  const resumed=await directory.open(admission);assert.equal(resumed.ownerEpoch,first.ownerEpoch+1);
  const recovered=(await repository.load<InstanceCheckpoint>(first.instanceId))!;
  assert.deepEqual(recovered.checkpoint.state,saved.checkpoint.state);
 }finally{await directory.close();await store.close();}
});

test('input queued during the final commit prevents retirement and is applied durably',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined,unblock=()=>{};
 try{
  const admission=expired('arrival'),errors:unknown[]=[];
  session=await SimulationSession.open(host,repository,'host',admission,{checkpointMs:10000,onError:e=>errors.push(e)});
  await until(async()=>(await host.checkpoint('arrival')).state.wallAt===admission.state.wallAt+1000);
  const commit=repository.commit.bind(repository);let entered=()=>{};
  const enteredPromise=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{unblock=r;});
  let first=true;repository.commit=async(...args)=>{if(first){first=false;entered();await gate;}return commit(...args);};
  const retiring=session.checkpoint(true);await enteredPromise;
  const input=session.input('alice',{instanceId:'arrival',actorId:admission.state.id,controllerGeneration:1,clientSequence:1,requestId:'stop',command:{kind:'stop'}});
  unblock();await retiring;assert.equal((await input).durable,true);
  assert.equal(session.active,true);assert.equal(host.inspect()[0].instances,1);assert.deepEqual(errors,[]);
  assert.equal((await repository.load<InstanceCheckpoint>('arrival'))!.checkpoint.inputSequence,1);
 }finally{unblock();await session?.close();await host.close();await store.close();}
});

test('concurrent reopen waits for lease release and shares one new owner',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),directory=new SimulationDirectory(repository,{checkpointMs:100});
 let unblock=()=>{};
 try{
  const admission=expired('handover');let entered=()=>{};
  const began=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{unblock=r;}),release=repository.release.bind(repository);
  repository.release=async owner=>{entered();await gate;return release(owner);};
  const first=await directory.open(admission);await began;
  let returned=0;
  const opens=[directory.open(admission),directory.open(admission)].map(p=>p.then(result=>{returned++;return result;}));
  await delay(30);assert.equal(returned,0);unblock();
  const [a,b]=await Promise.all(opens);assert.deepEqual(a,b);assert.equal(a.ownerEpoch,first.ownerEpoch+1);
  assert.equal(directory.inspect().instances,1);assert.equal(directory.inspect().shards[0].instances,1);
 }finally{unblock();await directory.close();await store.close();}
});

test('authenticated cached routes reopen an evicted character and preserve retry receipts',async()=>{
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'test',seed:()=>283});
 const state=(await game.createAccount('alice',{name:'休眠法师',classId:8,raceId:1},'create')).state;
 const characters=new ResidentCharacters(store,{version:runtimeVersion,offlineLimitMs:200}),repository=new SimulationRepository(store,Date.now,characters.commit);
 const directory=new SimulationDirectory(repository,{characters,checkpointMs:100,maxInstances:1});
 try{
  const first=await directory.openCharacter('alice',state.id);
  const accepted={instanceId:first.instanceId,actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'accept',command:{kind:'questAccept' as const,questId:783}};
  assert.equal((await directory.input('alice',accepted)).status,'applied');
  const input={...accepted,clientSequence:2,requestId:'turn-in',command:{kind:'questTurnIn' as const,questId:783,choiceId:null}};
  const receipt=await directory.input('alice',input);assert.equal(receipt.status,'applied');
  const rewarded=(await repository.load<InstanceCheckpoint>(first.instanceId))!.checkpoint.state;
  const ledger=await store.read(tx=>tx.list('ledger'));
  await until(()=>directory.inspect().instances===0);
  await assert.rejects(directory.presentation(first.instanceId,'bob',state.id,'full',true),/不属于/);
  assert.equal(directory.inspect().instances,0);
  const view=await directory.presentation(first.instanceId,'alice',state.id,'full',true);
  assert.equal(view.execution!.ownerEpoch,first.ownerEpoch+1);
  await until(()=>directory.inspect().instances===0);
  assert.deepEqual(await directory.input('alice',input),receipt);
  const recovered=(await repository.load<InstanceCheckpoint>(first.instanceId))!.checkpoint;
  assert.equal(recovered.inputSequence,2);assert.equal(recovered.state.xp,rewarded.xp);
  assert.deepEqual(recovered.state.completed,rewarded.completed);assert.deepEqual(await store.read(tx=>tx.list('ledger')),ledger);
 }finally{await directory.close();await store.close();}
});

test('an old cleanup epoch cannot remove a restored worker instance',async()=>{
 const host=new SimulationHost();
 try{
  const admission=expired('epoch');await host.admit({...admission,ownerEpoch:1},{realtime:false});
  const saved=await host.checkpoint('epoch');await host.remove('epoch',1);await host.restore(saved,2,{realtime:false});
  await assert.rejects(host.remove('epoch',1),/fenced/);
  assert.equal((await host.checkpoint('epoch')).ownerEpoch,2);
 }finally{await host.close();}
});

test('failed retirement commit fences local execution without releasing an uncertain durable owner',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined,retired=0,released=0;
 try{
  const admission=expired('retire-failure');
  session=await SimulationSession.open(host,repository,'host',admission,{checkpointMs:10000,onRetired:()=>{retired++;}});
  await until(async()=>(await host.checkpoint(admission.instanceId)).state.wallAt===admission.state.wallAt+1000);
  const saved=await repository.load(admission.instanceId),release=repository.release.bind(repository);
  repository.release=async owner=>{released++;return release(owner);};
  repository.commit=async()=>{throw new Error('Database unavailable');};
  await assert.rejects(session.checkpoint(true),/Database unavailable/);
  await session.whenStopped();
  assert.equal(session.active,false);assert.equal(host.inspect()[0].instances,0);assert.equal(retired,0);assert.equal(released,0);
  assert.deepEqual(await repository.load(admission.instanceId),saved);
  await assert.rejects(repository.acquire(admission.instanceId,'replacement'),/lease held/);
 }finally{await session?.close();await host.close();await store.close();}
});

test('a shared cutoff freezes rules without retiring an owner still observed by another participant',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),host=new SimulationHost();let session:SimulationSession|undefined;
 try{
  const admission=expired('shared-observer'),at=admission.state.wallAt;
  // Two controller identities can share the same room clock; only Alice is expired.
  const companion=structuredClone(admission.state);companion.id='bob-actor';companion.party=[];
  admission.state.party.push(companion);
  admission.controllers.push({actorId:companion.id,accountId:'bob',generation:1,canPause:false});
  admission.presence.accounts.push(['bob',Date.now()]);
  session=await SimulationSession.open(host,repository,'host',admission,{checkpointMs:10000});
  await until(async()=>(await host.checkpoint(admission.instanceId)).state.wallAt===at+1000);
  await session.presentation('bob',companion.id,'full',true);
  const seen=(await host.checkpoint(admission.instanceId)).presence!.accounts.find(([id])=>id==='bob')![1];
  const frozen=(await host.checkpoint(admission.instanceId)).state.clock;
  await session.checkpoint(true);
  assert.equal(session.active,true,'an active subscriber keeps the frozen owner resident');
  assert.equal((await host.checkpoint(admission.instanceId)).state.clock,frozen);
  await until(()=>Date.now()>seen+1000);
  await session.checkpoint(true);
  assert.equal(session.active,false,'the last expired allowance permits durable retirement');
  assert.equal(host.inspect()[0].instances,0);
  assert.equal((await repository.load<InstanceCheckpoint>(admission.instanceId))!.checkpoint.state.clock,frozen);
 }finally{await session?.close();await host.close();await store.close();}
});

test('inactive rooms retire early without spending or resetting the two-hour offline allowance',async()=>{
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'test',seed:()=>283});
 const state=(await game.createAccount('alice',{name:'空闲法师',classId:8,raceId:1},'create')).state;
 const characters=new ResidentCharacters(store,{version:runtimeVersion,offlineLimitMs:7_200_000});
 const repository=new SimulationRepository(store,Date.now,characters.commit);
 // Real Worker projections can take hundreds of milliseconds on CI. Keep the
 // observer interval below a realistic grace, and observe beyond that grace.
 const idleRetireMs=2000;
 const directory=new SimulationDirectory(repository,{characters,checkpointMs:100,idleRetireMs,maxInstances:1});
 try{
  const first=await directory.openCharacter('alice',state.id);
  await until(()=>directory.inspect().instances===0);
  const saved=(await repository.load<InstanceCheckpoint>(first.instanceId))!;
  assert.ok(saved.checkpoint.state.wallAt<saved.checkpoint.presence!.accounts[0][1]+7_200_000);
  const sequence=saved.sequence;await delay(250);
  assert.equal((await repository.load(first.instanceId))!.sequence,sequence,'unloaded rooms perform no recurring IO');
  const opened=await directory.openCharacter('alice',state.id);assert.equal(opened.instanceId,first.instanceId);assert.ok(opened.ownerEpoch>first.ownerEpoch);
  const restored=(await repository.load<InstanceCheckpoint>(first.instanceId))!;
  assert.deepEqual(restored.checkpoint.presence,saved.checkpoint.presence,'opening a route alone cannot replenish allowance');
  const observingUntil=Date.now()+idleRetireMs+500;
  do{await directory.presentation(first.instanceId,'alice',state.id,'full',true);await delay(60);}while(Date.now()<observingUntil);
  assert.equal(directory.inspect().instances,1,'an authenticated idle observer does not churn the owner');
  const receipt=await directory.input('alice',{instanceId:first.instanceId,actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'start-hunt',command:{kind:'action',action:{type:'hunt',id:299}}});
  assert.equal(receipt.status,'applied');
  await delay(idleRetireMs+250);assert.equal(directory.inspect().instances,1,'active hunting stays resident after the idle timeout');
 }finally{await directory.close();await store.close();}
});
