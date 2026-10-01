import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import type {Worker} from 'node:worker_threads';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository, type Ownership} from '../../../packages/persistence/src/simulation.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {SimulationDirectory} from '../src/directory.ts';
import {SimulationHost} from '../src/host.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import type {InstanceCheckpoint} from '../src/instance.ts';
import {runtimeVersion} from '../src/version.ts';

async function until(check: () => boolean) {
  const end = Date.now() + 6000;
  while (!check()) { if (Date.now() > end) throw new Error('Worker replacement did not complete'); await delay(20); }
}

// Kill an actual thread; advance only the repository lease clock to avoid a
// 30-second wall wait. Rules and worker scheduling use their ordinary clocks.
for (const uncertain of [false, true]) test(`worker replacement restores ${uncertain ? 'committed but unacknowledged' : 'acknowledged'} quest reward without replaying assets`, async () => {
  const store = residentStore(new MemoryStore()), game = new GameService(store, {contentVersion: 'recovery', seed: () => 283});
  const state = (await game.createAccount('alice', {name: '故障恢复', classId: 8, raceId: 1}, 'create')).state;
  const characters = new ResidentCharacters(store, {version: runtimeVersion});
  let offset = 0;
  const repository = new SimulationRepository(store, () => Date.now() + offset, characters.commit);
  const directory = new SimulationDirectory(repository, {characters, maxInstances: 1, checkpointMs: 10000, onError: () => {}});
  const host = (directory as unknown as {host: SimulationHost}).host;
  let unblock = () => {};
  try {
    const first = await directory.openCharacter('alice', state.id);
    const accepted = {instanceId: first.instanceId, actorId: state.id, controllerGeneration: 1, clientSequence: 1,
      requestId: 'accept', command: {kind: 'questAccept' as const, questId: 783}};
    await directory.input('alice', accepted);
    const input = {...accepted, clientSequence: 2, requestId: 'reward', command: {kind: 'questTurnIn' as const, questId: 783, choiceId: null}};
    const commit = repository.commit.bind(repository);
    let entered = () => {};
    const began = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { unblock = resolve; });
    if (uncertain) repository.commit = async (...args) => { const result = await commit(...args); entered(); await gate; return result; };
    const result = directory.input('alice', input).then(value => ({value}), error => ({error}));
    if (uncertain) await began; else assert.ok('value' in await result);
    const durable = (await repository.load<InstanceCheckpoint>(first.instanceId))!;
    assert.equal(durable.checkpoint.state.completed[783], 1);
    const assets = await store.read(async tx => ({wallets: await tx.list('wallets'), items: await tx.list('items'), ledger: await tx.list('ledger')}));
    const old = (await store.read(tx => tx.get<Ownership>('simulation_owners', first.instanceId)))!;
    const worker = (host as unknown as {shards: {worker: Worker}[]}).shards[0].worker;
    await worker.terminate(); unblock();
    if (uncertain) assert.ok('error' in await result, 'durable commit was not falsely acknowledged after loss of the worker');
    await until(() => !host.inspect()[0].failed);
    assert.equal(host.inspect().length, 1); assert.equal(host.inspect()[0].instances, 0);
    await assert.rejects(directory.presentation(first.instanceId, 'bob', state.id, 'full', true), /不属于/);
    await assert.rejects(directory.openCharacter('alice', state.id), /lease held/);
    offset = 31_000;
    const [view, retry] = await Promise.all([
      directory.presentation(first.instanceId, 'alice', state.id, 'full', true),
      directory.input('alice', input),
    ]);
    assert.equal(view.execution!.ownerEpoch, first.ownerEpoch + 1);
    assert.equal(retry.durable, true); assert.equal(retry.status, 'applied'); assert.equal(retry.inputSequence, 2);
    const restored = (await repository.load<InstanceCheckpoint>(first.instanceId))!.checkpoint;
    assert.equal(restored.inputSequence, 2); assert.equal(restored.state.xp, durable.checkpoint.state.xp);
    assert.deepEqual(restored.state.completed, durable.checkpoint.state.completed);
    assert.deepEqual(await store.read(async tx => ({wallets: await tx.list('wallets'), items: await tx.list('items'), ledger: await tx.list('ledger')})), assets);
    await assert.rejects(repository.commit(old, old.commitSequence + 1, durable.checkpoint), /fenced/);
    await assert.rejects(host.remove(first.instanceId, first.ownerEpoch), /fenced/);
    assert.equal(directory.inspect().instances, 1);
  } finally { unblock(); await directory.close(); await store.close(); }
});


test('RPC timeout terminates the uncertain worker before a replacement accepts restored state', async () => {
  const host = new SimulationHost();
  try {
    const state = localScenarios().solo;
    await host.admit({instanceId: 'timeout', ownerEpoch: 1, state, controllers: []}, {realtime: false});
    const saved = await host.checkpoint('timeout');
    const internal = host as unknown as {shards: {worker: Worker}[]; options: {requestTimeoutMs: number}};
    const original = internal.shards[0].worker;
    // Model a lost IPC response without introducing a production debug action.
    original.postMessage = () => {};
    internal.options.requestTimeoutMs = 30;
    await assert.rejects(host.checkpoint('timeout'), /timed out/);
    assert.equal(host.available('timeout', 1), false);
    await until(() => !host.inspect()[0].failed);
    assert.notEqual(internal.shards[0].worker, original);
    assert.equal(original.threadId, -1, 'old execution ended before replacement');
    internal.options.requestTimeoutMs = 30000;
    await host.restore(saved, 2, {realtime: false});
    assert.deepEqual((await host.checkpoint('timeout')).state, saved.state);
  } finally { await host.close(); }
});

test('shutdown cancels a pending worker restart', async () => {
  const host = new SimulationHost();
  const internal = host as unknown as {shards: {worker: Worker}[]};
  const original = internal.shards[0].worker;
  await original.terminate();
  await host.close();
  await delay(150);
  assert.equal(internal.shards[0].worker, original);
  assert.equal(original.threadId, -1);
});


test('failed replacement allocation remains bounded and retries without crashing the host', async () => {
  const host = new SimulationHost();
  const internal = host as unknown as {shards: {worker: Worker}[]; spawn: (...args: any[]) => any};
  const spawn = internal.spawn.bind(host); let attempts = 0;
  internal.spawn = (...args) => { if (++attempts === 1) throw new Error('Thread allocation unavailable'); return spawn(...args); };
  try {
    await internal.shards[0].worker.terminate();
    await until(() => attempts === 1);
    assert.equal(host.inspect()[0].failed, true);
    assert.match(host.inspect()[0].failure!, /Thread allocation unavailable/);
    assert.ok(host.inspect()[0].restartAt! > Date.now());
    await until(() => !host.inspect()[0].failed);
    assert.equal(attempts, 2); assert.equal(host.inspect().length, 1);
  } finally { await host.close(); }
});
