import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {SimulationHost} from '../src/host.ts';
import {ResidentInstance} from '../src/instance.ts';
import {localScenarios, durableState} from '../../../packages/simulation-tests/support/baseline.ts';
import {advanceOwned,createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {PublicReplica, type SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import type {Worker} from 'node:worker_threads';

test('owner UI projection is private, does not advance rules, and restores input cursors',()=>{
  const state=localScenarios().solo;
  const runtime=new ResidentInstance({instanceId:'ui',ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'alice',generation:3,canPause:true}]});
  const before=runtime.checkpoint();
  assert.throws(()=>runtime.presentation('bob',state.id),/denied/);
  assert.throws(()=>runtime.presentation('alice','foreign'),/denied/);
  const full=runtime.presentation('alice',state.id);
  assert.equal(full.execution?.ownerEpoch,1);
  assert.equal(Object.hasOwn(full,'localSimulation'),false);
  assert.equal(full.playback,null);
  assert.equal(runtime.presentation('alice',state.id),full,'unchanged scope/time/input reuses one public projection');
  runtime.presentation('alice',state.id,'combat');
  assert.deepEqual(runtime.checkpoint(),before,'reading UI must not alter RNG, rules or durable cursors');
  const receipt=runtime.input('alice',{instanceId:'ui',actorId:state.id,controllerGeneration:3,clientSequence:1,requestId:'stop-ui',command:{kind:'action',action:{type:'stop'}}});
  assert.equal(receipt.status,'applied');
  const updated=runtime.presentation('alice',state.id);
  assert.equal(updated.execution?.clientSequence,1);
  assert.notEqual(updated,full,'input invalidates the UI cache');
  const restored=ResidentInstance.restore(runtime.checkpoint(),2),fresh=restored.presentation('alice',state.id);
  assert.equal(fresh.execution?.ownerEpoch,2);
  assert.equal(fresh.execution?.streamSequence,1);
  assert.equal(fresh.execution?.controllerGeneration,3);
  assert.equal(fresh.execution?.clientSequence,1);
});

test('one real worker owns multiple scenarios, bounded advancement and JSON recovery match existing rules', async () => {
  const host = new SimulationHost({maxInstances: 6});
  try {
    const scenarios = localScenarios();
    for (const [instanceId, state] of Object.entries(scenarios)) await host.admit({instanceId, ownerEpoch: 1, state, controllers: []}, {realtime: false});
    assert.equal(host.inspect()[0].instances, 5);
    for (const [instanceId, state] of Object.entries(scenarios)) {
      let result = await host.advance(instanceId, 5000, 3);
      assert.equal(result.complete, false); assert.ok(result.wallAt < 5000);
      while (!result.complete) result = await host.advance(instanceId, 5000, 7);
      // Same sampling cadence as budgeted execution: rule behavior is sensitive
      // to non-tick boundaries in the existing engine, which phase C must freeze.
      advanceOwned(state, 5000);
      const checkpoint = await host.checkpoint(instanceId);
      assert.deepEqual(durableState(checkpoint.state), durableState(state), instanceId);
      await host.remove(instanceId);
      await host.restore(durableState(checkpoint), 2, {realtime: false});
      while (!(await host.advance(instanceId, 10000, 7)).complete) {}
      advanceOwned(state, 10000);
      assert.deepEqual(durableState((await host.checkpoint(instanceId)).state), durableState(state), instanceId + ' restored');
    }
    await assert.rejects(host.admit({instanceId: 'solo', ownerEpoch: 3, state: scenarios.solo, controllers: []}), /refused/);
  } finally { await host.close(); }
});

test('live residents progress without HTTP ticks; lease expiry stops authority', async () => {
  const host = new SimulationHost();
  try {
    const state = localScenarios().solo;
    await host.admit({instanceId: 'live', ownerEpoch: 1, state, controllers: []}, {leaseMs: 2000});
    await delay(180);
    const checkpoint = await host.checkpoint('live');
    assert.ok(checkpoint.state.wallAt >= 100);
    await host.renew('live', 40);
    await delay(80);
    await assert.rejects(host.checkpoint('live'), /fenced/);
    await assert.rejects(host.renew('live', 1000), /fenced/);
  } finally { await host.close(); }
});

test('authorized intents, idempotence, controller fencing, pause and stream baseline recovery', () => {
  const state = localScenarios().dungeon;
  state.party[0]={...createGame('成员',283,0,{classId:1,raceId:1,characterId:state.party[0].id}),...state.party[0],party:[]};
  const runtime = new ResidentInstance({instanceId: 'room', ownerEpoch: 1, state,
    controllers: [{actorId: state.id, accountId: 'alice', generation: 2, canPause: true},
      {actorId: state.party[0].id, accountId: 'alice', generation: 1, canPause: false}]});
  const input: SimulationInput = {instanceId: 'room', actorId: state.id, controllerGeneration: 2,
    clientSequence: 1, requestId: 'pause', command: {kind: 'pause', encounterId: state.combat.id}};
  assert.throws(() => runtime.input('bob', input), /fenced/);
  assert.throws(() => runtime.input('alice', {...input, state: {money: 1_000_000}} as SimulationInput), /fields/);
  assert.throws(() => runtime.input('alice', {...input, controllerGeneration: 1}), /fenced/);
  const receipt = runtime.input('alice', input);
  assert.equal(receipt.status, 'applied'); assert.deepEqual(runtime.input('alice', input), receipt);
  runtime.advance(1000); assert.equal(runtime.simTime, 0); assert.equal(runtime.wallAt, 1000);
  const snapshot = durableState(runtime.checkpoint());
  const restored = ResidentInstance.restore(snapshot, 2);
  assert.deepEqual(restored.input('alice', input), receipt);
  assert.throws(() => restored.input('alice', {...input, requestId: 'late'}), /Stale/);
  assert.throws(() => restored.input('alice', {...input, command: {kind: 'resume', encounterId: state.combat.id}}), /reused/);
  assert.equal(restored.input('alice', {...input, actorId: state.party[0].id, controllerGeneration: 1, requestId: 'bob-pause'}).status, 'rejected');
  const resumed = {...input, requestId: 'resume', clientSequence: 2, command: {kind: 'resume' as const, encounterId: state.combat.id}};
  assert.equal(restored.input('alice', resumed).status, 'applied');
  restored.advance(2000); assert.equal(restored.simTime, 1000);
  assert.equal(snapshot.state.clock, 0, 'captured boundary is detached');
  const client = new PublicReplica('room');
  const baseline = restored.project(2000); assert.equal(client.apply(baseline), true);
  const skipped = restored.project(2001), gap = restored.project(2002);
  assert.equal(client.apply(gap), false); assert.equal(client.apply(skipped), true);
  const fresh = restored.project(2003, true); assert.equal(client.apply(fresh), true);
  assert.equal(client.apply({...fresh, ownerEpoch: 1, streamSequence: fresh.streamSequence + 1}), false);
  assert.equal(/rngState|equipment|rules|bag|eventQueue/.test(JSON.stringify(fresh)), false);
  assert.throws(() => ResidentInstance.restore({...snapshot, contentHash: 'other'}, 3), /version/);
});

test('admission and mailboxes are bounded; invalid advancement does not corrupt the room', async () => {
  const host = new SimulationHost({maxInstances: 1, maxPendingPerWorker: 1});
  try {
    const state = localScenarios().solo;
    const admit = host.admit({instanceId: 'one', ownerEpoch: 1, state, controllers: []}, {realtime: false});
    await assert.rejects(host.admit({instanceId: 'two', ownerEpoch: 1, state, controllers: []}), /refused/);
    await admit;
    const pending = host.checkpoint('one');
    await assert.rejects(host.checkpoint('one'), /mailbox/);
    await pending;
    await assert.rejects(host.advance('one', -1), /Invalid until/);
    assert.equal((await host.checkpoint('one')).state.wallAt, state.wallAt);
  } finally { await host.close(); }
});

test('fixed sharding and a killed worker do not stop the other shard', async () => {
  const host = new SimulationHost({workers: 2});
  try {
    const state = localScenarios().solo;
    for (const instanceId of ['a', 'b', 'c', 'd']) await host.admit({instanceId, ownerEpoch: 1, state, controllers: []}, {realtime: false});
    assert.deepEqual(host.inspect().map(s => s.instances), [2, 2]);
    // Fault injection into the real worker, without adding a production crash API.
    const worker = (host as unknown as {shards: {worker: Worker}[]}).shards[0].worker;
    const pending = host.checkpoint('a').catch(error => error);
    await worker.terminate(); await pending;
    assert.throws(() => host.checkpoint('a'), /unavailable/);
    assert.equal((await host.advance('b', 1000)).complete, true);
    assert.equal((await host.checkpoint('d')).ownerEpoch, 1);
  } finally { await host.close(); }
});

test('battleground projection contains the actual 20 moving participants', () => {
  const state = localScenarios().battleground;
  advanceOwned(state, 45000);
  const runtime = new ResidentInstance({instanceId: 'bg', ownerEpoch: 1, state, controllers: []});
  const before = runtime.project(state.wallAt);
  assert.equal(before.changes.length, 20);
  assert.deepEqual(before.changes.map(c => [c.id, c.x, c.y]), state.battleground.teams.flatMap((team: any) => team.members.map((c: any) => [c.id, c.x, c.y])));
  while (!runtime.advance(state.wallAt + 2000).complete) {}
  assert.ok(runtime.project(state.wallAt + 2000).changes.length > 0);
});
