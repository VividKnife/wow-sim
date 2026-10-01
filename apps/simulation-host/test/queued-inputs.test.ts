import test from 'node:test';
import assert from 'node:assert/strict';
import {ResidentInstance,type InstanceCheckpoint} from '../src/instance.ts';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';

function setup(){const state=localScenarios().dungeon;return {instanceId:'queued',ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]};}
function intent(a:ReturnType<typeof setup>,n:number,kind:'pause'|'resume'='pause'){return {instanceId:a.instanceId,actorId:a.state.id,controllerGeneration:1,clientSequence:n,requestId:'request-'+n,command:{kind,encounterId:a.state.combat.id}};}
function finish(runtime:ResidentInstance,until:number){while(!runtime.advance(until,3).complete){}}

test('queued inputs checkpoint and replay at their accepted time with the same state and RNG',()=>{
 const a=setup(),runtime=new ResidentInstance(a),reference=new ResidentInstance(a),pause=intent(a,1),resume=intent(a,2,'resume');
 const queued=runtime.input('alice',pause,5000);assert.equal(queued.status,'queued');assert.equal(queued.simTime,null);
 runtime.input('alice',resume,7000);assert.equal(runtime.simTime,0);
 assert.deepEqual(runtime.input('alice',pause,8000),queued,'a retry cannot reschedule an accepted command');
 const saved=runtime.checkpoint(),restored=ResidentInstance.restore(JSON.parse(JSON.stringify(saved)),2);
 finish(restored,10_000);
 finish(reference,5000);reference.input('alice',pause);finish(reference,7000);reference.input('alice',resume);finish(reference,10_000);
 assert.deepEqual(restored.checkpoint().state,reference.checkpoint().state);
 assert.equal(restored.checkpoint().appliedInputSequence,2);assert.equal(restored.pendingInputCount,0);
 assert.equal(restored.input('alice',pause).status,'applied');assert.equal(restored.input('alice',pause).effectiveWallAt,5000);
});

test('same-time commands yield without advancing past unapplied input and publish durable status separately',()=>{
 const a=setup(),runtime=new ResidentInstance(a);
 runtime.input('alice',intent(a,1),1000);runtime.input('alice',intent(a,2,'resume'),1000);
 runtime.confirmCheckpoint(2,0);
 assert.ok(runtime.presentation('alice',a.state.id).execution!.receipts.every(r=>r.status==='queued'&&r.durable));
 const first=runtime.advance(2000,100);assert.equal(first.complete,false);assert.equal(first.wallAt,1000);
 const queued=runtime.checkpoint();assert.equal(queued.appliedInputSequence,1);assert.equal(queued.recentInputs[1].receipt.status,'queued');
 const resumed=ResidentInstance.restore(queued,2);assert.equal(resumed.advance(2000,100).complete,false);
 assert.equal(resumed.wallAt,1000);finish(resumed,2000);
 const published=resumed.presentation('alice',a.state.id).execution!.receipts;
 assert.equal(published[0].durable,true);assert.equal(published[1].status,'applied');assert.equal(published[1].durable,false);
 resumed.confirmCheckpoint(2,2);assert.ok(resumed.presentation('alice',a.state.id).execution!.receipts.every(r=>r.durable));
});

test('pending journal is bounded, authenticated, rejects corrupted cursors and survives wall-anchor shifts',()=>{
 const a=setup(),runtime=new ResidentInstance({...a,presence:{offlineLimitMs:1000,accounts:[['alice',0]]}});
 assert.throws(()=>runtime.input('bob',intent(a,1),1000),/fenced/);
 for(let n=1;n<=64;n++)runtime.input('alice',intent(a,n),1000);
 const full=runtime.checkpoint();assert.throws(()=>runtime.input('alice',intent(a,65),1000),/queue full/);assert.deepEqual(runtime.checkpoint(),full);
 runtime.recordPresence('alice',a.state.id,5000);
 assert.equal(runtime.checkpoint().recentInputs[0].receipt.effectiveWallAt,5000);
 const shifted=runtime.checkpoint();
 assert.throws(()=>ResidentInstance.restore({...shifted,appliedInputSequence:65},2),/cursor/);
 assert.throws(()=>ResidentInstance.restore({...shifted,recentInputs:shifted.recentInputs.slice(1)},2),/count/);
 finish(runtime,5000);assert.equal(runtime.pendingInputCount,0);assert.equal(runtime.checkpoint().appliedInputSequence,64);
});

test('a real worker durably accepts backlog inputs while projections and checkpoints keep responding',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),host=new SimulationHost();let session:SimulationSession|undefined;
 try{
  const a=setup(),base=Date.now()-120_000;a.state.wallAt=base;
  session=await SimulationSession.open(host,repository,'host',{...a,presence:{offlineLimitMs:7_200_000,accounts:[['alice',base]]}},{checkpointMs:100});
  const started=performance.now(),receipt=await session.input('alice',intent(a,1));
  assert.equal(receipt.status,'queued');assert.equal(receipt.durable,true);assert.ok(performance.now()-started<5000);
  const saved=(await repository.load<InstanceCheckpoint>(a.instanceId))!.checkpoint;
  assert.equal(saved.inputSequence,1);assert.equal(saved.recentInputs[0].input.requestId,receipt.requestId);
  await session.project(true);await session.checkpoint();
  assert.equal(session.active,true);assert.equal(host.inspect()[0].failed,false);
  await session.close();session=await SimulationSession.open(host,repository,'replacement',a);
  const recovered=(await repository.load<InstanceCheckpoint>(a.instanceId))!.checkpoint;
  assert.equal(recovered.inputSequence,1);assert.deepEqual(recovered.recentInputs[0].input,saved.recentInputs[0].input);
 }finally{await session?.close();await host.close();await store.close();}
});

test('a deferred rule rejection is an ordered result and does not prevent the next input',()=>{
 const a=setup(),runtime=new ResidentInstance(a);
 const rejected={...intent(a,1),command:{kind:'questTurnIn' as const,questId:783,choiceId:null}};
 assert.equal(runtime.input('alice',rejected,1000).status,'queued');runtime.input('alice',intent(a,2),1000);
 finish(runtime,2000);
 const receipts=runtime.presentation('alice',a.state.id).execution!.receipts;
 assert.equal(receipts[0].status,'rejected');assert.ok(receipts[0].reason);assert.equal(receipts[0].durable,false);
 assert.equal(receipts[1].status,'applied');assert.equal(runtime.checkpoint().appliedInputSequence,2);
 runtime.confirmCheckpoint(2,2);assert.ok(runtime.presentation('alice',a.state.id).execution!.receipts.every(r=>r.durable));
});
