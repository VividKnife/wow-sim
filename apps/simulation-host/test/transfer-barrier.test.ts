import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import type {InstanceCheckpoint} from '../src/instance.ts';
import {SimulationRepository,type Ownership} from '../../../packages/persistence/src/simulation.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';

function admission(instanceId:string){
 const state=localScenarios().solo;
 return {instanceId,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]};
}

test('Worker transfer barrier freezes one room, blocks input and publication, and does not stall other rooms',async()=>{
 const host=new SimulationHost();
 try{
  const a=admission('frozen'),b=admission('running');
  await host.admit({...a,ownerEpoch:1});await host.admit({...b,ownerEpoch:1});
  const checkpoint=await host.quiesce('frozen');
  const other=await host.checkpoint('running');
  await delay(240);
  assert.deepEqual(await host.checkpoint('frozen'),checkpoint);
  assert.ok((await host.checkpoint('running')).state.wallAt>other.state.wallAt);
  await assert.rejects(host.project('frozen',Date.now()),/quiesced/);
  await assert.rejects(host.presentation('frozen','alice',a.state.id,'full',true),/quiesced/);
  await assert.rejects(host.input('alice',{instanceId:'frozen',actorId:a.state.id,controllerGeneration:1,clientSequence:1,
   requestId:'late',command:{kind:'stop'}}),/quiesced/);
  await host.renew('frozen',5000);
  assert.deepEqual(await host.quiesce('frozen'),checkpoint,'repeated barrier preserves the exact boundary');
  await host.resumeExecution('frozen');await delay(150);
  assert.ok((await host.checkpoint('frozen')).state.wallAt>checkpoint.state.wallAt);
 }finally{await host.close();}
});

test('session drains accepted inputs, commits a consistent boundary and seals authority before returning the transfer token',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined;
 try{
  const a=admission('source');
  session=await SimulationSession.open(host,repo,'host',a,{checkpointMs:10000});
  const input={instanceId:a.instanceId,actorId:a.state.id,controllerGeneration:1,clientSequence:1,requestId:'accepted',
   command:{kind:'action' as const,action:{type:'settings',health:37,mana:44}}};
  const accepted=session.input('alice',input);
  const preparing=session.prepareTransfer('move-1');
  await assert.rejects(session.project(),/unavailable/);
  await assert.rejects(session.input('alice',{...input,requestId:'too-late',clientSequence:2}),/unavailable/);
  const prepared=await preparing;
  assert.equal((await accepted).durable,true);
  assert.equal(prepared.checkpoint.state.settings.health,37);
  assert.equal(prepared.checkpoint.inputSequence,1);
  assert.deepEqual((await repo.load('source'))!.checkpoint,prepared.checkpoint);
  assert.deepEqual(prepared.owner.handoff,{id:'move-1',sequence:prepared.owner.commitSequence});
  assert.deepEqual(await session.prepareTransfer('move-1'),prepared);
  const detached=await session.prepareTransfer('move-1');detached.checkpoint.state.money=123456;
  assert.notEqual((await session.prepareTransfer('move-1')).checkpoint.state.money,123456);
  await assert.rejects(session.prepareTransfer('different'),/Different/);
  await assert.rejects(repo.renew(prepared.owner),/sealed/);
  await assert.rejects(repo.release(prepared.owner),/sealed/);
  await assert.rejects(repo.commit(prepared.owner,prepared.owner.commitSequence+1,prepared.checkpoint),/sealed/);
  await delay(120);assert.deepEqual(await host.checkpoint('source'),prepared.checkpoint);
  await assert.rejects(session.abortTransfer('wrong'),/Different/);
  await Promise.all([session.abortTransfer('move-1'),session.abortTransfer('move-1')]);
  assert.equal(((await session.presentation('alice',a.state.id,'full')).snapshot!.player.settings as {health:number}).health,37);
  assert.equal((await store.read(tx=>tx.get<Ownership>('simulation_owners','source')))!.handoff,undefined);
 }finally{await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('lost seal acknowledgement stops the Worker and preserves the durable sealed boundary for recovery',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined;
 try{
  session=await SimulationSession.open(host,repo,'host',admission('uncertain'),{checkpointMs:10000});
  const seal=repo.seal.bind(repo);
  repo.seal=async(...args)=>{await seal(...args);throw new Error('Lost seal acknowledgement');};
  await assert.rejects(session.prepareTransfer('move-uncertain'),/Lost seal/);
  assert.equal(session.active,false);assert.equal(host.inspect()[0].instances,0);
  const owner=(await store.read(tx=>tx.get<Ownership>('simulation_owners','uncertain')))!;
  assert.equal(owner.handoff!.id,'move-uncertain');
  assert.equal((await repo.load('uncertain'))!.sequence,owner.handoff!.sequence);
  await assert.rejects(session.project(),/unavailable/);
  await session.close();
  assert.deepEqual(await store.read(tx=>tx.get('simulation_owners','uncertain')),owner,'shutdown never releases uncertain transfer authority');
 }finally{await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('an expired sealed owner cannot resume after a replacement has acquired the exact saved room',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined;
 try{
  session=await SimulationSession.open(host,repo,'old-host',admission('takeover'),{checkpointMs:10000});
  const prepared=await session.prepareTransfer('move-old');
  await store.transaction(tx=>tx.put('simulation_owners',{...prepared.owner,expiresAt:Date.now()-1}));
  const replacement=await repo.acquire('takeover','new-host');
  assert.equal(replacement.epoch,prepared.owner.epoch+1);assert.equal(replacement.handoff,undefined);
  await assert.rejects(session.abortTransfer('move-old'),/fenced/);
  assert.equal(session.active,false);assert.equal(host.inspect()[0].instances,0);
  const saved=(await repo.load<InstanceCheckpoint>('takeover'))!.checkpoint;
  assert.deepEqual(saved,prepared.checkpoint);
  await host.restore(saved,replacement.epoch,{realtime:false});
  assert.equal((await host.checkpoint('takeover')).state.rngState,prepared.checkpoint.state.rngState);
  await repo.release(replacement);
 }finally{await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('closing a prepared session removes its Worker without another checkpoint or release',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined;
 try{
  session=await SimulationSession.open(host,repo,'host',admission('close-transfer'),{checkpointMs:100});
  await session.prepareTransfer('move-close');
  const saved=await repo.load('close-transfer'),owner=await store.read(tx=>tx.get('simulation_owners','close-transfer'));
  await session.close();await delay(180);
  assert.equal(host.inspect()[0].instances,0);
  assert.deepEqual(await repo.load('close-transfer'),saved);
  assert.deepEqual(await store.read(tx=>tx.get('simulation_owners','close-transfer')),owner);
 }finally{await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('a full IO mailbox refuses transfer preparation without wedging the still-owned session',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined,unblock=()=>{};
 try{
  session=await SimulationSession.open(host,repo,'host',admission('busy-transfer'),{checkpointMs:10000});
  const commit=repo.commit.bind(repo);
  let entered=()=>{},first=true;
  const began=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{unblock=r;});
  repo.commit=async(...args)=>{if(first){first=false;entered();await gate;}return commit(...args);};
  const work=[session.checkpoint()];await began;
  for(let n=1;n<16;n++)work.push(session.checkpoint());
  await assert.rejects(session.prepareTransfer('busy'),/busy/);
  unblock();await Promise.all(work);
  assert.equal(session.active,true);
  assert.ok(await session.project());
  assert.equal((await store.read(tx=>tx.get<Ownership>('simulation_owners','busy-transfer')))!.handoff,undefined);
 }finally{unblock();await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('an abandoned transfer decision is bounded and stops the old Worker without unsealing uncertain authority',{timeout:20000},async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost(),errors:unknown[]=[];
 let session:SimulationSession|undefined;
 try{
  session=await SimulationSession.open(host,repo,'host',admission('decision-timeout'),{checkpointMs:10000,onError:e=>errors.push(e)});
  await session.prepareTransfer('abandoned');
  const before=await repo.load('decision-timeout');
  const end=Date.now()+12000;
  while(session.active&&Date.now()<end)await delay(50);
  assert.equal(session.active,false);
  await session.whenStopped();
  assert.equal(host.inspect()[0].instances,0);
  assert.match(String(errors[0]),/decision deadline/);
  assert.deepEqual(await repo.load('decision-timeout'),before);
  assert.equal((await store.read(tx=>tx.get<Ownership>('simulation_owners','decision-timeout')))!.handoff!.id,'abandoned');
  await assert.rejects(session.abortTransfer('abandoned'),/fenced/);
  await assert.rejects(session.prepareTransfer('abandoned'),/unavailable/);
 }finally{await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('fenced session wait and close wait for actual Worker removal outside the IO tail',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 let session:SimulationSession|undefined,unblock=()=>{};
 try{
  session=await SimulationSession.open(host,repo,'host',admission('removal-barrier'),{checkpointMs:10000});
  const remove=host.remove.bind(host);
  let entered=()=>{};
  const began=new Promise<void>(resolve=>{entered=resolve;});
  const gate=new Promise<void>(resolve=>{unblock=resolve;});
  host.remove=async(...args)=>{entered();await gate;return remove(...args);};
  const discarding=session.discard();await began;
  assert.equal(session.active,false);
  let waited=false,closed=false;
  const waiting=session.whenStopped().then(()=>{waited=true;});
  const closing=session.close().then(()=>{closed=true;});
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(waited,false);assert.equal(closed,false);
  assert.equal(host.inspect()[0].instances,1);
  unblock();await Promise.all([discarding,waiting,closing]);
  assert.equal(host.inspect()[0].instances,0);
 }finally{unblock();await session?.close().catch(()=>{});await host.close();await store.close();}
});
