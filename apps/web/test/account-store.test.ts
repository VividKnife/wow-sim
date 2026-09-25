import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {AccountStore} from '../lib/account-store.ts';
import {clientAddress} from '../lib/client-address.ts';

test('rate-limit identity ignores attacker-prepended addresses and fails closed without ingress', () => {
  const request = new Request('https://game.example', {headers: {'x-forwarded-for': 'fake, 203.0.113.5'}});
  assert.equal(clientAddress(request, 1), '203.0.113.5');
  assert.throws(() => clientAddress(new Request('https://game.example'), 1));
  assert.throws(() => clientAddress(request, 0));
});

test('accounts persist hashed passwords and revocable, expiring sessions with real SQL', async () => {
  const db = new PGlite();
  const sql = {query: async (text: string, values?: unknown[]) => text.includes('CREATE TABLE')
    ? (await db.exec(text), {rows: []}) : db.query(text, values)};
  let now = 1000000;
  const store = new AccountStore(sql, () => now);
  try {
    await store.initialize();
    const created = await store.register('Adventure_1', 'a-long-password-123');
    assert.equal(created.user.username, 'adventure_1');
    assert.equal((await store.session(created.token))?.id, created.user.id);
    const rows = await db.query('SELECT password_hash FROM web_users');
    assert.ok(!(rows.rows[0] as any).password_hash.includes('a-long-password'));
    const sessions = await db.query('SELECT token_hash FROM web_sessions');
    assert.notEqual((sessions.rows[0] as any).token_hash, created.token);
    await assert.rejects(store.register('ADVENTURE_1', 'another-password-123'), (e: any) => e.status === 409);
    await assert.rejects(store.login('adventure_1', 'wrong-password-123'), (e: any) => e.status === 401);
    await assert.rejects(store.login('unknown-user', 'wrong-password-123'), (e: any) => e.status === 401);
    const signedIn = await store.login('Adventure_1', 'a-long-password-123');
    assert.equal(signedIn.user.id, created.user.id);
    await store.logout(signedIn.token);
    assert.equal(await store.session(signedIn.token), null);
    assert.equal(await store.session('forged'), null);
    now += 8 * 24 * 60 * 60 * 1000;
    assert.equal(await store.session(created.token), null);
  } finally { await db.close(); }
});

test('validation and persisted rate limits protect login and registration', async () => {
  const db = new PGlite();
  const sql = {query: async (text: string, values?: unknown[]) => text.includes('CREATE TABLE')
    ? (await db.exec(text), {rows: []}) : db.query(text, values)};
  let now = 1000000;
  const store = new AccountStore(sql, () => now);
  try {
    await store.initialize();
    await assert.rejects(store.register('bad name', 'a-long-password-123'), (e: any) => e.status === 400);
    await assert.rejects(store.register('valid-name', 'short'), (e: any) => e.status === 400);
    for (let n = 0; n < 10; n++) await store.rateLimit('login:person', 10, 900000);
    await assert.rejects(store.rateLimit('login:person', 10, 900000), (e: any) => e.status === 429);
    const otherProcess = new AccountStore(sql, () => now);
    await assert.rejects(otherProcess.rateLimit('login:person', 10, 900000), (e: any) => e.status === 429);
    now += 900001;
    await otherProcess.rateLimit('login:person', 10, 900000);
    for (let n = 0; n < 10; n++) await store.rateLimit('auth:blocked-user', 10, 900000);
    for (let n = 0; n < 125; n++) {
      await assert.rejects(store.login('blocked-user', 'wrong-password-123', 'abusive-client'), (e: any) => e.status === 429);
    }
    const innocent = await store.register('innocent-user', 'a-long-password-123', 'other-client');
    assert.equal(innocent.user.username, 'innocent-user');
  } finally { await db.close(); }
});
