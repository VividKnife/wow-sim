import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {PresenceClock} from '../src/presence.ts';
import {ResidentInstance} from '../src/instance.ts';
import {SimulationHost} from '../src/host.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';

function admission(instanceId='presence', limit=1000) {
  const state=localScenarios().solo;
  return {instanceId,ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}],
    presence:{offlineLimitMs:limit,accounts:[['alice',state.wallAt] as [string,number]]}};
}
function finish(runtime:ResidentInstance,until:number){while(!runtime.advance(until,3).complete) {}}

test('offline allowance preserves unpaid rule time, RNG and events through late reconnect and restore',()=>{
  const a=admission(),reference=new ResidentInstance({...a,presence:null}),runtime=new ResidentInstance(a);
  runtime.advance(1000,3);
  const before=runtime.checkpoint();assert.ok(before.state.wallAt<1000);
  assert.equal(runtime.recordPresence('alice',a.state.id,5000),4000);
  assert.equal(runtime.simTime,before.state.clock);
  assert.equal(runtime.checkpoint().state.rngState,before.state.rngState);
  const resumed=ResidentInstance.restore(JSON.parse(JSON.stringify(runtime.checkpoint())),2);
  finish(resumed,5000);finish(reference,1000);
  const actual=resumed.checkpoint().state,expected=reference.checkpoint().state;
  assert.equal(actual.wallAt,5000);actual.wallAt=expected.wallAt;
  assert.deepEqual(actual,expected,'same allowed interval consumes identical RNG and produces identical rule facts');
  finish(resumed,20_000);assert.equal(resumed.wallAt,6000);assert.equal(resumed.simTime,2000);
  const capped=resumed.checkpoint();finish(resumed,30_000);assert.deepEqual(resumed.checkpoint(),capped);
});

test('presence is authenticated, monotonic and has exact account coverage',()=>{
  const a=admission(),runtime=new ResidentInstance(a),before=runtime.checkpoint();
  for(const [account,actor,generation] of [['bob',a.state.id,1],['alice','foreign',1],['alice',a.state.id,2]] as const)
    assert.throws(()=>runtime.recordPresence(account,actor,5000,generation),/fenced/);
  assert.deepEqual(runtime.checkpoint(),before);
  runtime.recordPresence('alice',a.state.id,5000);
  const fresh=runtime.checkpoint();runtime.recordPresence('alice',a.state.id,4000);assert.deepEqual(runtime.checkpoint(),fresh);
  for(const presence of [{offlineLimitMs:0,accounts:[['alice',0]]}, {offlineLimitMs:1,accounts:[]},
    {offlineLimitMs:1,accounts:[['bob',0]]}, {offlineLimitMs:1,accounts:[['alice',Number.MAX_SAFE_INTEGER]]}]) {
    assert.throws(()=>new ResidentInstance({...a,presence:presence as any}));
  }
});

test('shared allowance follows the earliest human account without one member refreshing everyone',()=>{
  const clock=new PresenceClock({offlineLimitMs:1000,accounts:[['alice',0],['bob',0]]},['alice','bob','alice']);
  assert.equal(clock.record('alice',5000),0);assert.equal(clock.deadline,1000);
  assert.equal(clock.record('bob',5000),4000);assert.equal(clock.deadline,6000);
  assert.equal(new PresenceClock(clock.snapshot(),['alice','bob']).deadline,6000);
});

test('reconnect does not unpause combat or move its event deadlines',()=>{
  const state=localScenarios().dungeon;
  const runtime=new ResidentInstance({...admission(),state});
  const input={instanceId:'presence',actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'pause',command:{kind:'pause' as const,encounterId:state.combat.id}};
  assert.equal(runtime.input('alice',input).status,'applied');
  finish(runtime,1000);const paused=runtime.checkpoint();
  runtime.recordPresence('alice',state.id,5000);finish(runtime,5500);
  assert.equal(runtime.simTime,paused.state.clock);assert.equal(runtime.wallAt,5500);
  assert.deepEqual(runtime.checkpoint().state.combat,paused.state.combat);
});

test('real worker catches up across downtime, sleeps at cutoff, rejects foreign wakeups and resumes on online presence',async()=>{
  const host=new SimulationHost();
  try{
    const a=admission('worker-presence',500),base=Date.now()-5000;
    a.state.wallAt=base;a.presence.accounts=[['alice',base]];
    await host.admit(a);
    let saved=await host.checkpoint(a.instanceId);
    const deadline=Date.now()+5000;
    while(saved.state.wallAt!==base+500&&Date.now()<deadline){await delay(20);saved=await host.checkpoint(a.instanceId);}
    assert.equal(saved.state.wallAt,base+500);assert.equal(saved.state.clock,500);
    await delay(80);assert.deepEqual(await host.checkpoint(a.instanceId),saved);
    await host.presentation(a.instanceId,'alice',a.state.id,'full',false);
    assert.deepEqual(await host.checkpoint(a.instanceId),saved,'read-only projection does not renew offline allowance');
    await assert.rejects(host.presentation(a.instanceId,'bob',a.state.id,'full',true),/fenced/);
    assert.deepEqual(await host.checkpoint(a.instanceId),saved);
    await host.remove(a.instanceId);await host.restore(saved,2);
    await delay(60);assert.equal((await host.checkpoint(a.instanceId)).state.wallAt,base+500,'restart cannot replenish allowance');
    await host.presentation(a.instanceId,'alice',a.state.id,'full',true);
    await delay(80);
    const awake=await host.checkpoint(a.instanceId);
    assert.ok(awake.state.wallAt>base+5000);assert.ok(awake.state.clock>500&&awake.state.clock<1000);
    assert.ok(awake.presence!.accounts[0][1]>base+5000);
  }finally{await host.close();}
});

test('a valid input wakes an offline room and a fenced controller cannot refresh its allowance',async()=>{
  const host=new SimulationHost();
  try{
    const a=admission('input-presence',100),base=Date.now()-2000;
    a.state.wallAt=base;a.presence.accounts=[['alice',base]];
    await host.admit(a);await delay(80);
    const before=await host.checkpoint(a.instanceId);
    const input={instanceId:a.instanceId,actorId:a.state.id,controllerGeneration:1,clientSequence:1,requestId:'stop',command:{kind:'stop' as const}};
    await assert.rejects(host.input('alice',{...input,controllerGeneration:2}),/fenced/);
    assert.deepEqual(await host.checkpoint(a.instanceId),before);
    const receipt=await host.input('alice',input);assert.equal(receipt.status,'applied',receipt.reason);
    const after=await host.checkpoint(a.instanceId);
    assert.ok(after.presence!.accounts[0][1]>base+2000);
    assert.ok(after.state.wallAt>base+2000);
    assert.ok(after.state.clock<500,'the frozen interval must not become additional combat time');
    assert.ok(after.recentInputs[0].receipt.effectiveWallAt<=after.state.wallAt);
  }finally{await host.close();}
});

test('public projection explains an offline freeze and clears it on authenticated return',()=>{
 const a=admission(),runtime=new ResidentInstance(a);
 finish(runtime,1000);
 const frozen=runtime.presentation('alice',a.state.id,'full');
 assert.equal((frozen.snapshot!.player.presence as any).paused,true);
 assert.match((frozen.snapshot!.player.presence as any).reason,/离线上限/);
 runtime.recordPresence('alice',a.state.id,1000);
 const resumed=runtime.presentation('alice',a.state.id,'full');
 assert.equal((resumed.snapshot!.player.presence as any).paused,false,'same clock cache must reflect a renewed allowance');
 assert.equal((resumed.snapshot!.player.presence as any).reason,null);
 assert.equal(Object.hasOwn(resumed.snapshot!.player,'rngState'),false);
});
