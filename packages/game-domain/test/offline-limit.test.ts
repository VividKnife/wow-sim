import {seedCompanion} from './support/characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Activity, Character, Instance} from '../src/model.ts';

async function fixture(offlineLimitMs?: number) {
  const store = new MemoryStore();
  let now = 1000, id = 0;
  const service = new GameService(store, {contentVersion: 'test', now: () => now, id: () => `offline-${++id}`, seed: () => 12345, offlineLimitMs});
  const created = await service.createAccount('a', {name: 'Hero', classId: 8, raceId: 1}, 'create');
  const hero = created.state.id;
  return {store, service, hero, time: (value: number) => {now = value;}};
}

async function travel(f: Awaited<ReturnType<typeof fixture>>, duration = 10_800_000) {
  await f.service.command('a', {type: 'travel', to: 'goldshire', requestId: 'travel'});
  await f.store.transaction(async tx => {
    const [a] = await tx.list<Activity>('activities', {actorId: f.hero});
    a.engineActivity.endsAt = 1000 + duration;
    await tx.put('activities', a);
  });
}

async function drain(f: Awaited<ReturnType<typeof fixture>>) {
  for (let i = 0; i < 10; i++) assert.deepEqual((await f.service.work()).errors, []);
}

test('default offline travel stops at two hours and resumes without crediting the excess, across restart', async () => {
  const f = await fixture();
  await travel(f);
  f.time(14_401_000);
  await drain(f);
  const paused = await f.service.snapshot('a');
  assert.equal(paused.state.clock, 7_201_000);
  assert.equal(paused.state.location, 'northshire');
  assert.equal((await f.service.work()).activities, 0);
  const restarted = new GameService(f.store, {contentVersion: 'test', now: () => 14_401_000});
  await restarted.snapshot('a', undefined, true);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 7_201_000);
  f.time(18_001_000);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.location, 'goldshire');
});

test('returning before the worker catches up still skips only excess offline time', async () => {
  const f = await fixture(2000);
  await travel(f, 10_000);
  f.time(21_000);
  await f.service.snapshot('a', undefined, true);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 3000);
  f.time(22_000);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 4000);
});

test('online reads extend the window; internal snapshots and workers do not', async () => {
  const f = await fixture(2000);
  await travel(f, 10_000);
  f.time(2500);
  await f.service.snapshot('a', undefined, true);
  f.time(4000);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 4000);
  f.time(9000);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 4500);
});

test('reconnecting at the exact cutoff wakes a paused job and repeated gaps are not counted twice', async () => {
  const f = await fixture(2000);
  await travel(f, 20_000);
  f.time(3000);
  await drain(f);
  await f.service.snapshot('a', undefined, true);
  f.time(4000);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 4000);
  f.time(10_000);
  await f.service.snapshot('a', undefined, true);
  await f.service.snapshot('a', undefined, true);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 5000);
  f.time(20_000);
  await f.service.snapshot('a', undefined, true);
  await drain(f);
  assert.equal((await f.service.snapshot('a')).state.clock, 7000);
});

test('the hero gathering order is capped and a command resumes the saved work', async () => {
  const f = await fixture(2000);
  await f.store.transaction(async tx => {
    const c = (await tx.get<Character>('characters', f.hero))!;
    c.rules.location = 'northwood';
    c.rules.professions = {herbalism: {skill: 1, cap: 75}};
    await tx.put('characters', c);
  });
  await f.service.command('a', {type: 'gatherResource', id: 'northwood:bloom', requestId: 'gather'});
  f.time(20_000);
  await drain(f);
  assert.ok(!(await f.service.snapshot('a')).state.bag.some((i: any) => i.id === 2447));
  // A harmless command is still proof of presence, even if the active order rejects it.
  await assert.rejects(f.service.command('a', {type: 'sync', requestId: 'sync'}), /后台订单/);
  f.time(21_000);
  await drain(f);
  assert.ok((await f.service.snapshot('a')).state.bag.some((i: any) => i.id === 2447));
});

test('invalid offline durations are rejected', () => {
  for (const duration of [0, -1, NaN, Infinity, 1.5])
    assert.throws(() => new GameService(new MemoryStore(), {contentVersion: 'test', offlineLimitMs: duration}), /GAME_OFFLINE_LIMIT_MS/);
});

test('missing persisted presence is rejected without corrupting active simulation clocks', async () => {
  const f = await fixture();
  await travel(f);
  await f.store.transaction(async tx => {
    const a = (await tx.get('account_presence', 'a'))!;
    delete a.lastSeenAt;
    await tx.put('account_presence', a);
  });
  f.time(20_000);
  await assert.rejects(f.service.snapshot('a', undefined, true), /在线状态/);
  assert.equal((await f.store.transaction(tx => tx.get<Character>('characters', f.hero)))!.rules.wallAt, 1000);
});

test('offline personal combat produces exactly the same state and rewards as stopping at the cutoff', async () => {
  const early = await fixture(4000), late = await fixture(4000);
  for (const f of [early, late]) await f.service.command('a', {type: 'hunt', id: 299, requestId: 'hunt'});
  early.time(5000);
  late.time(100_000);
  await drain(early);
  await drain(late);
  const expected = (await early.service.snapshot('a')).state;
  const actual = (await late.service.snapshot('a')).state;
  assert.ok(actual.combat);
  assert.deepEqual(actual, expected);
});

test('companion gathering and production finish beyond the offline window', async () => {
  const f = await fixture(1000);
  for (const name of ['Gatherer', 'Crafter']) await seedCompanion(f.service,'a',{type: 'createCompanion', name, classId: 8, raceId: 1, requestId: name});
  const roster = (await f.service.snapshot('a')).roster;
  const gatherer = roster.find(c => c.name === 'Gatherer')!.id;
  const crafter = roster.find(c => c.name === 'Crafter')!.id;
  await f.store.transaction(async tx => {
    for (const id of [gatherer, crafter]) {
      const c = (await tx.get<Character>('characters', id))!;
      c.rules.location = 'northwood';
      c.rules.professions = {herbalism: {skill: 1, cap: 75}, firstaid: {skill: 1, cap: 75}};
      await tx.put('characters', c);
    }
    await tx.insert('items', {id: 'linen', accountId: 'a', ownerCharacterId: crafter, container: 'bag', position: 100, data: {id: 2589, count: 1}, source: 'fixture'});
  });
  await f.service.command('a', {type: 'gatherResource', characterId: gatherer, id: 'northwood:bloom', requestId: 'gather'});
  await f.service.command('a', {type: 'craft', characterId: crafter, id: 'spell-3275', count: 1, requestId: 'craft'});
  f.time(20_000);
  await drain(f);
  assert.ok((await f.service.snapshot('a', gatherer)).state.bag.some((i: any) => i.id === 2447));
  assert.ok((await f.service.snapshot('a', crafter)).state.bag.some((i: any) => i.id === 1251));
});

test('shared combat pauses at the earliest participant deadline and resumes after both reconnect', async () => {
  const f = await fixture(2000);
  await f.service.createAccount('b', {name: 'Guest', classId: 1, raceId: 1}, 'create');
  const instanceId = (await f.service.command('a', {type: 'createInstance', requestId: 'form'})).instanceId!;
  await f.service.command('b', {type: 'joinInstance', instanceId, requestId: 'join'});
  await f.service.command('a', {type: 'startInstance', instanceId, requestId: 'start'});
  f.time(20_000);
  await drain(f);
  const read = () => f.store.transaction(tx => tx.get<Instance>('instances', instanceId));
  assert.equal((await read())!.simulation!.clock, 3000);
  assert.equal((await f.service.work()).instances, 0);
  await f.service.snapshot('a', undefined, true);
  await drain(f);
  assert.equal((await read())!.simulation!.clock, 3000);
  await f.service.snapshot('b', undefined, true);
  f.time(21_000);
  await drain(f);
  assert.equal((await read())!.simulation!.clock, 4000);
});
