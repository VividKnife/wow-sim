import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createGame, nextAdvanceWallAt, advanceOwned} from '../../../packages/game-domain/src/rules/engine.js';
import {ensureNpcWorld, nextNpcWorldProgressAt} from '../../../packages/game-domain/src/rules/npc-world.js';
import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {monsterIdsAt} from '../../../packages/game-domain/src/rules/catalog.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {ResidentInstance} from '../src/instance.ts';
import {SimulationHost} from '../src/host.ts';

const admission = (state: Rules = createGame('休眠', 123, 1000), instanceId = 'sleep') => ({
  instanceId, ownerEpoch: 1, state, controllers: [{actorId: state.id, accountId: 'alice', generation: 1, canPause: true}],
});
const listing = (endsAt: number) => ({id: 'auction-1', item: {id: 117, uid: 'item-1', count: 1}, gross: 50, net: 47, createdAt: 0, endsAt});

test('quiet deadlines cover auction and independent NPC growth without polling empty rooms', () => {
  const state: Rules = createGame('期限', 123, 1000);
  assert.equal(nextAdvanceWallAt(state), Infinity);
  state.auctions.push(listing(333));
  assert.equal(nextAdvanceWallAt(state), 1333);
  advanceOwned(state, 1333);
  assert.equal(state.money, 47); assert.equal(state.auctions.length, 0);
  assert.equal(nextAdvanceWallAt(state), Infinity);
  state.level = 10; state.hp = stats(state).maxHp; state.mana = stats(state).maxMana;
  ensureNpcWorld(state);
  const before = structuredClone(state.npcWorld.residents);
  const next = nextNpcWorldProgressAt(state);
  assert.equal(next, 1333 + 20 * 60 * 1000);
  assert.equal(nextAdvanceWallAt(state), next);
  advanceOwned(state, next - 1); assert.deepEqual(state.npcWorld.residents, before);
  advanceOwned(state, next);
  assert.ok(state.npcWorld.residents.every((p: any) => p.steps === 1 && p.wallet > before.find((q: any) => q.id === p.id).wallet));
  assert.equal(nextAdvanceWallAt(state), next + 20 * 60 * 1000);
});

test('active rules retain exact boundaries; paused rooms wake for accepted inputs and offline cutoff', () => {
  const a = admission(localScenarios().dungeon), runtime = new ResidentInstance({...a,
    presence: {offlineLimitMs: 5000, accounts: [['alice', a.state.wallAt]]}});
  assert.equal(runtime.nextWakeWallAt, 100);
  runtime.advance(37); assert.equal(runtime.nextWakeWallAt, 100);
  const pause = {instanceId: a.instanceId, actorId: a.state.id, controllerGeneration: 1, clientSequence: 1,
    requestId: 'pause', command: {kind: 'pause' as const, encounterId: a.state.combat.id}};
  runtime.input('alice', pause);
  assert.equal(runtime.nextWakeWallAt, 5000);
  runtime.input('alice', {...pause, clientSequence: 2, requestId: 'resume', command: {kind: 'resume', encounterId: a.state.combat.id}}, 700);
  assert.equal(runtime.nextWakeWallAt, 700);
  const restored = ResidentInstance.restore(JSON.parse(JSON.stringify(runtime.checkpoint())), 2);
  assert.equal(restored.nextWakeWallAt, 700);
  restored.advance(700);
  assert.equal(restored.simTime, 37); assert.equal(restored.nextWakeWallAt, 763);
  while (!restored.advance(6000).complete) {}
  assert.equal(restored.wallAt, 5000); assert.equal(restored.nextWakeWallAt, Infinity);
});

test('live idle worker sleeps, authenticated views materialize time, and a hunt command wakes it', async () => {
  const host = new SimulationHost();
  try {
    const a = admission(); await host.admit(a);
    const before = await host.checkpoint(a.instanceId);
    await delay(220); assert.deepEqual(await host.checkpoint(a.instanceId), before);
    await assert.rejects(host.presentation(a.instanceId, 'bob', a.state.id, 'full'), /denied/);
    assert.deepEqual(await host.checkpoint(a.instanceId), before);
    await host.presentation(a.instanceId, 'alice', a.state.id, 'full');
    const observed = await host.checkpoint(a.instanceId);
    assert.ok(observed.state.clock >= 200); assert.equal(observed.state.rngState, before.state.rngState);
    await delay(120); assert.deepEqual(await host.checkpoint(a.instanceId), observed, 'reading does not start polling');
    const receipt = await host.input('alice', {instanceId: a.instanceId, actorId: a.state.id, controllerGeneration: 1,
      clientSequence: 1, requestId: 'hunt', command: {kind: 'hunt', monsterId: monsterIdsAt(a.state.location)[0]}});
    assert.equal(receipt.status, 'applied', receipt.reason);
    const accepted = await host.checkpoint(a.instanceId);
    const deadline = Date.now() + 5000;
    let running = accepted;
    while (!running.state.combat && Date.now() < deadline) { await delay(30); running = await host.checkpoint(a.instanceId); }
    assert.ok(running.state.combat, 'scheduled hunt starts without a presentation request');
    assert.ok(running.state.clock > accepted.state.clock);
  } finally { await host.close(); }
});

test('sleeping worker settles an auction autonomously then returns to sleep', async () => {
  const host = new SimulationHost();
  try {
    const a = admission(); a.state.auctions.push(listing(240)); await host.admit(a);
    const before = await host.checkpoint(a.instanceId);
    await delay(80); assert.deepEqual(await host.checkpoint(a.instanceId), before);
    let settled = before;
    const deadline = Date.now() + 5000;
    while (settled.state.auctions.length && Date.now() < deadline) { await delay(30); settled = await host.checkpoint(a.instanceId); }
    assert.equal(settled.state.money, 47); assert.equal(settled.state.auctions.length, 0);
    assert.ok(settled.state.clock >= 240);
    await delay(150); assert.deepEqual(await host.checkpoint(a.instanceId), settled);
    await host.remove(a.instanceId); await host.restore(settled, 2);
    await delay(100); assert.deepEqual((await host.checkpoint(a.instanceId)).state, settled.state, 'restore does not settle twice or poll');
  } finally { await host.close(); }
});
