import assert from 'node:assert/strict';
import test from 'node:test';
import {signGameToken, verifyGameToken} from '../src/auth.ts';

const secret = 'test-secret-that-is-at-least-32-characters-long';

test('signed game tokens authenticate the subject during their short lifetime', async () => {
  const token = await signGameToken({sub: 'account-a'}, secret, {now: 1_000, ttlSeconds: 60});

  assert.deepEqual(await verifyGameToken(token, secret, {now: 1_030}), {
    sub: 'account-a',
    iat: 1_000,
    exp: 1_060,
    aud: 'wow-sim-game',
  });
});

test('tokens fail closed when expired, tampered, malformed, or signed with a weak secret', async () => {
  const token = await signGameToken({sub: 'account-a'}, secret, {now: 1_000, ttlSeconds: 60});
  const pieces = token.split('.');
  const tampered = `${pieces[0]}.${pieces[1]}.${pieces[2].slice(0, -1)}x`;

  await assert.rejects(verifyGameToken(token, secret, {now: 1_061}), /expired/i);
  await assert.rejects(verifyGameToken(tampered, secret, {now: 1_030}), /signature/i);
  await assert.rejects(verifyGameToken('not-a-token', secret), /malformed/i);
  await assert.rejects(signGameToken({sub: 'account-a'}, 'too-short'), /32/);
});

test('tokens cannot be stretched beyond the configured five-minute trust window', async () => {
  await assert.rejects(
    signGameToken({sub: 'account-a'}, secret, {now: 1_000, ttlSeconds: 301}),
    /five minutes/i,
  );
});
