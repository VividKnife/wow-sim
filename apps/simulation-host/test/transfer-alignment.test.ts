import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {ResidentInstance,type InstanceCheckpoint} from '../src/instance.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';

function admission(instanceId:string){
 const state=localScenarios().solo;
 return {instanceId,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]};
}

test('alignment runs bounded ordinary rules and accepted inputs, and cannot operate on a live or future room',async()=>{
 const host=new SimulationHost();
 try{
  const a=admission('alignment-kernel'),runtime=new ResidentInstance({...a,ownerEpoch:1});
  const input={instanceId:a.instanceId,actorId:a.state.id,controllerGeneration:1,clientSequence:1,requestId:'queued-before-entry',
   command:{kind:'action' as const,action:{type:'settings',health:37,mana:44}}};
  runtime.input('alice',input,runtime.wallAt+500);
  for(let sequence=2;sequence<=12;sequence++)runtime.input('alice',{...input,clientSequence:sequence,requestId:'queued-'+sequence},runtime.wallAt+500);
  const initial=runtime.checkpoint(),until=runtime.wallAt+5000;
  await host.restore(initial,1,{realtime:false});
  await assert.rejects(host.alignQuiesced(a.instanceId,until),/quiesced/);
  await host.quiesce(a.instanceId);
  const first=await host.alignQuiesced(a.instanceId,until);
  assert.equal(first.complete,false);assert.ok(first.wallAt<until);
  await assert.rejects(host.alignQuiesced(a.instanceId,first.wallAt-1),/wall boundary/);
  let result=first,slices=1;
  while(!result.complete&&slices<40){result=await host.alignQuiesced(a.instanceId,until);slices++;}
  assert.equal(result.complete,true);assert.equal(result.pendingInputs,0);assert.ok(slices>1);
  while(!runtime.advance(until,10).complete){}
  assert.deepEqual(await host.checkpoint(a.instanceId),runtime.checkpoint());
  assert.equal((await host.checkpoint(a.instanceId)).state.settings.health,37);
  const live=admission('future-boundary');await host.admit({...live,ownerEpoch:1});
  await host.quiesce(live.instanceId);
  await assert.rejects(host.alignQuiesced(live.instanceId,live.state.wallAt+1000000),/future/);
 }finally{await host.close();}
});

test('real-time sources freeze at different times, align to one saved boundary, and leave another room running',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost();
 const sessions:SimulationSession[]=[],frozen=new Map<string,InstanceCheckpoint>();
 try{
  for(const id of ['group-a','group-b','unrelated']){
   const a=admission(id);a.state.wallAt=Date.now();
   // Real character rooms share UTC wall time. Unbound benchmark rooms start
   // their own historical clock at admission and cannot be compared this way.
   sessions.push(await SimulationSession.open(host,repo,'host',{...a,presence:{offlineLimitMs:7200000,accounts:[['alice',a.state.wallAt]]}},{checkpointMs:10000}));
  }
  const before=(await host.checkpoint('unrelated')).state.wallAt,quiesce=host.quiesce.bind(host);
  host.quiesce=async id=>{if(id==='group-b')await delay(160);const checkpoint=await quiesce(id);frozen.set(id,checkpoint);return checkpoint;};
  const preparing=SimulationSession.prepareGroupTransfer(sessions.slice(0,2),'aligned-group');
  await assert.rejects(sessions[0].project(),/unavailable/);
  const prepared=await preparing;
  assert.ok(frozen.get('group-b')!.state.wallAt>frozen.get('group-a')!.state.wallAt);
  const until=Math.max(...[...frozen.values()].map(c=>c.state.wallAt));
  for(const p of prepared){
   assert.equal(p.checkpoint.state.wallAt,until);
   assert.deepEqual((await repo.load(p.owner.id))!.checkpoint,p.checkpoint);
   const expected=ResidentInstance.restore(frozen.get(p.owner.id)!,p.owner.epoch);
   while(!expected.advance(until,10).complete){}
   assert.deepEqual(expected.checkpoint(),p.checkpoint);
   assert.equal(p.owner.handoff!.id,'aligned-group');
  }
  assert.deepEqual(await SimulationSession.prepareGroupTransfer(sessions.slice(0,2),'aligned-group'),prepared);
  assert.ok((await host.checkpoint('unrelated')).state.wallAt>before);
  await Promise.all(sessions.slice(0,2).map(s=>s.abortTransfer('aligned-group')));
  assert.ok(await sessions[0].project());assert.ok(await sessions[1].project());
 }finally{await Promise.allSettled(sessions.map(s=>s.close()));await host.close();await store.close();}
});

test('a source failure rejects the group barrier without leaving another source waiting or sealed',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost(),sessions:SimulationSession[]=[];
 try{
  for(const id of ['failed-source','waiting-source'])sessions.push(await SimulationSession.open(host,repo,'host',admission(id),{checkpointMs:10000}));
  const quiesce=host.quiesce.bind(host);
  host.quiesce=async id=>{if(id==='failed-source')throw new Error('Injected source failure');return quiesce(id);};
  await assert.rejects(SimulationSession.prepareGroupTransfer(sessions,'failed-group'),/Unable to prepare/);
  assert.ok(sessions.every(s=>!s.active));assert.equal(host.inspect()[0].instances,0);
  for(const id of ['failed-source','waiting-source'])assert.equal((await store.read(tx=>tx.get('simulation_owners',id)))!.handoff,undefined);
 }finally{await Promise.allSettled(sessions.map(s=>s.close()));await host.close();await store.close();}
});

test('offline limits cannot be bypassed by transfer alignment',async()=>{
 const host=new SimulationHost();
 try{
  const a=admission('offline-alignment');
  await host.admit({...a,ownerEpoch:1,presence:{offlineLimitMs:1000,accounts:[['alice',a.state.wallAt]]}},{realtime:false});
  await host.quiesce(a.instanceId);
  let result=await host.alignQuiesced(a.instanceId,a.state.wallAt+2000);
  for(let i=0;i<10&&!result.complete;i++)result=await host.alignQuiesced(a.instanceId,a.state.wallAt+2000);
  assert.equal(result.wallAt,a.state.wallAt+1000);
  const before=await host.checkpoint(a.instanceId);
  await host.alignQuiesced(a.instanceId,a.state.wallAt+2000);
  assert.deepEqual(await host.checkpoint(a.instanceId),before);
 }finally{await host.close();}
});

test('a failed group seal safely resumes an already-sealed source',async()=>{
 const store=new MemoryStore(),repo=new SimulationRepository(store),host=new SimulationHost(),sessions:SimulationSession[]=[];
 try{
  for(const id of ['sealed-source','failed-seal']){
   const a=admission(id);a.state.wallAt=Date.now();
   sessions.push(await SimulationSession.open(host,repo,'host',{...a,presence:{offlineLimitMs:7200000,accounts:[['alice',a.state.wallAt]]}},{checkpointMs:10000}));
  }
  const seal=repo.seal.bind(repo);let sealed!:()=>void;
  const firstSealed=new Promise<void>(resolve=>{sealed=resolve;});
  repo.seal=async(owner,id)=>{
   if(owner.id==='failed-seal'){await firstSealed;throw new Error('Injected seal failure');}
   const result=await seal(owner,id);sealed();return result;
  };
  await assert.rejects(SimulationSession.prepareGroupTransfer(sessions,'partial-seal'),/Unable to prepare/);
  assert.equal(sessions[0].active,true);assert.equal(sessions[1].active,false);
  assert.equal(host.inspect()[0].instances,1);
  assert.equal((await store.read(tx=>tx.get('simulation_owners','sealed-source')))!.handoff,undefined);
  assert.ok(await sessions[0].project());
 }finally{await Promise.allSettled(sessions.map(s=>s.close()));await host.close();await store.close();}
});
