import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import type {InstanceCheckpoint} from '../src/instance.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';

test('shutdown drains a running checkpoint without rescheduling or accepting new work', {timeout:10_000},async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),host=new SimulationHost(),errors:unknown[]=[];
 let session:SimulationSession|undefined,unblock=()=>{};
 try{
  session=await SimulationSession.open(host,repository,'host',{instanceId:'drain',state:localScenarios().solo,controllers:[]},{checkpointMs:100,onError:error=>errors.push(error)});
  const commit=repository.commit.bind(repository),release=repository.release.bind(repository);
  let entered=()=>{},releases=0,commits=0;
  const started=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{unblock=resolve;});
  repository.commit=async(...args)=>{if(++commits===1){entered();await gate;}return commit(...args);};
  repository.release=async(...args)=>{releases++;return release(...args);};
  await started;
  const first=session.close(),second=session.close();
  assert.equal(session.active,false);
  await assert.rejects(session.project(),/unavailable/);
  unblock();await Promise.all([first,second]);
  await delay(220);
  assert.equal(commits,2,'running checkpoint plus final shutdown checkpoint only');
  assert.equal(releases,1);assert.deepEqual(errors,[]);assert.equal(host.inspect()[0].instances,0);
 }finally{unblock();await session?.close().catch(()=>{});await host.close();await store.close();}
});

test('IO coordinator commits input receipts, restores with a new epoch, and fences database failure', async () => {
  const store = new MemoryStore(), repository = new SimulationRepository(store), host = new SimulationHost();
  let session: SimulationSession | undefined;
  try {
    const state = localScenarios().dungeon;
    const admission = {instanceId: 'persisted', state, controllers: [{actorId: state.id, accountId: 'alice', generation: 1, canPause: true}]};
    session = await SimulationSession.open(host, repository, 'host-a', admission);
    const input = {instanceId: admission.instanceId, actorId: state.id, controllerGeneration: 1, clientSequence: 1,
      requestId: 'pause', command: {kind: 'pause' as const, encounterId: state.combat.id}};
    const receipt = await session.input('alice', input);
    assert.equal(receipt.durable, true); assert.equal(receipt.status, 'applied');
    const persisted = (await repository.load<InstanceCheckpoint>('persisted'))!;
    assert.equal(persisted.checkpoint.recentInputs[0].receipt.requestId, 'pause');
    await session.close();
    session = await SimulationSession.open(host, repository, 'host-b', admission);
    const repeated = await session.input('alice', input);
    assert.deepEqual(repeated, receipt);
    assert.equal((await session.project(true)).ownerEpoch, 2);
    const durable = (await repository.load<InstanceCheckpoint>('persisted'))!;
    assert.equal(durable.checkpoint.inputSequence, 1);
    await store.close();
    await assert.rejects(session.checkpoint(), /closed/);
    await assert.rejects(session.project(), /unavailable/);
    assert.equal(host.inspect()[0].instances, 0);
  } finally { await session?.close().catch(() => {}); await host.close(); await store.close(); }
});

test('a hung database cannot accumulate unbounded volatile simulation or leave the room available', {timeout: 15_000}, async () => {
  const store = new MemoryStore(), repository = new SimulationRepository(store), host = new SimulationHost();
  let session: SimulationSession | undefined;
  try {
    const state = localScenarios().solo;
    session = await SimulationSession.open(host, repository, 'host', {instanceId: 'io-stall', state, controllers: []}, {onError: () => {}});
    const committed = await repository.load('io-stall');
    repository.commit = () => new Promise(() => {});
    await assert.rejects(session.checkpoint(), /IO deadline/);
    assert.equal(host.inspect()[0].instances, 0);
    await assert.rejects(session.project(), /unavailable/);
    assert.deepEqual(await repository.load('io-stall'), committed);
  } finally { await session?.close().catch(() => {}); await host.close(); await store.close(); }
});
