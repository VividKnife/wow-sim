import test from 'node:test';
import assert from 'node:assert/strict';
import {GameService} from '../src/service.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {tables} from '../../persistence/src/store.ts';

const input = {name: 'Hero', classId: 8, raceId: 1};
async function fixture() {
  const store = new MemoryStore();
  const service = new GameService(store, {contentVersion: 'test', now: () => 1000, seed: () => 123});
  const created = await service.createAccount('a', input, 'original');
  const invalidate = () => store.transaction(async tx => {
    const row = (await tx.get('accounts', 'a'))!;
    delete row.lastSeenAt;
    await tx.put('accounts', row);
  });
  return {store, service, created, invalidate};
}

test('create replaces invalid save and removes its assets, jobs and receipts atomically', async () => {
  const f = await fixture();
  await f.service.command('a', {type: 'travel', to: 'goldshire', requestId: 'travel'});
  await f.service.deliverOutbox('test-consumer', async () => {});
  const oldRows = await f.store.transaction(async tx => Object.fromEntries(await Promise.all(tables.map(async table => [table, await tx.list(table)]))));
  await f.invalidate();
  await assert.rejects(f.service.snapshot('a'), {code: 'ACCOUNT_STATE'});
  const recreated = await f.service.createAccount('a', {...input, name: 'New'}, 'recreate');
  assert.notEqual(recreated.state.id, f.created.state.id);
  assert.equal(recreated.state.name, 'New');
  assert.equal(recreated.account.lastSeenAt, 1000);
  assert.equal(recreated.roster.length, 1);
  assert.deepEqual(recreated.activities, []);
  await f.store.transaction(async tx => {
    for (const table of tables) {
      if (table === 'accounts') continue;
      for (const row of oldRows[table]) assert.equal(await tx.get(table, row.id), null, `${table}:${row.id}`);
    }
  });
  assert.equal((await f.service.createAccount('a', {...input, name: 'New'}, 'recreate')).state.id, recreated.state.id);
  assert.deepEqual((await f.service.work(10000)).errors, []);
  await assert.rejects(f.service.createAccount('a', input, 'original'), {code: 'EXISTS'});
});

test('healthy saves cannot be replaced; invalid create rolls back cleanup', async () => {
  const f = await fixture();
  await assert.rejects(f.service.createAccount('a', input, 'second'), {code: 'EXISTS'});
  await f.invalidate();
  const before = await f.store.transaction(async tx => Promise.all(tables.map(table => tx.list(table))));
  await assert.rejects(f.service.createAccount('a', {...input, classId: 999}, 'bad'), {code: 'INVALID_CHARACTER'});
  assert.deepEqual(await f.store.transaction(async tx => Promise.all(tables.map(table => tx.list(table)))), before);
});

test('recreation ends affected shared instances and releases other accounts without deleting their saves', async () => {
  for (const invalidAccount of ['a', 'b']) {
    const f = await fixture();
    const guest = await f.service.createAccount('b', input, 'guest');
    const instanceId = (await f.service.command('a', {type: 'createInstance', requestId: 'form'})).instanceId!;
    await f.service.command('b', {type: 'joinInstance', instanceId, requestId: 'join'});
    await f.service.command('a', {type: 'startInstance', instanceId, requestId: 'start'});
    await f.service.acquireInstanceLease(instanceId, 'worker', 1000);
    const other = invalidAccount === 'a' ? 'b' : 'a';
    const before = await f.service.snapshot(other);
    await f.store.transaction(async tx => {
      const row = (await tx.get('accounts', invalidAccount))!;
      row.lastSeenAt = -1;
      await tx.put('accounts', row);
    });
    await f.service.createAccount(invalidAccount, input, 'recreate');
    const after = await f.service.snapshot(other);
    assert.equal(after.state.id, other === 'a' ? f.created.state.id : guest.state.id);
    assert.equal(after.state.money, before.state.money);
    assert.deepEqual(after.state.bag, before.state.bag);
    assert.equal(after.instanceId, null);
    assert.ok(after.revision > before.revision);
    await f.store.transaction(async tx => {
      assert.equal(await tx.get('instances', instanceId), null);
      assert.equal(await tx.get('instance_leases', instanceId), null);
      assert.deepEqual(await tx.list('actor_leases'), []);
    });
    await f.service.command(other, {type: 'travel', to: 'goldshire', requestId: 'travel-after-reset'});
    assert.deepEqual((await f.service.work(10000)).errors, []);
  }
});
