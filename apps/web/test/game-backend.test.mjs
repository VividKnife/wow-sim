import assert from 'node:assert/strict';
import test from 'node:test';
import {isSameOriginMutation, proxyGameRequest} from '../lib/game-backend.ts';
import {verifyGameToken} from '../../game-server/src/auth.ts';

const environment = {
  GAME_SERVER_URL: 'https://game.internal.example/base',
  GAME_SERVER_SECRET: 'test-secret-that-is-at-least-32-characters-long',
};

test('conditional game reads preserve validators and empty 304 responses through the proxy',async()=>{
 const response=await proxyGameRequest(new Request('https://app.example/api/game',{headers:{'if-none-match':'"revision-3"'}}),{
  accountId:'account-a',path:'/game',environment,fetchImpl:async request=>{
   assert.equal(request.headers.get('if-none-match'),'"revision-3"');
   return new Response(null,{status:304,headers:{etag:'"revision-3"','cache-control':'private, no-cache'}});
  },
 });
 assert.equal(response.status,304);assert.equal(await response.text(),'');assert.equal(response.headers.get('etag'),'"revision-3"');
});

test('the web proxy forwards only a signed account subject to the configured backend', async () => {
  let forwarded;
  const response = await proxyGameRequest(
    new Request('https://app.example/api/game?characterId=hero-a'),
    {accountId: 'account-a', path: '/game', environment, fetchImpl: async (request) => {
      forwarded = request;
      return Response.json({ok: true}, {headers: {'cache-control': 'no-store'}});
    }},
  );

  assert.equal(response.status, 200);
  assert.equal(forwarded?.url, 'https://game.internal.example/game?characterId=hero-a');
  assert.equal(forwarded?.headers.get('oai-authenticated-user-id'), null);
  const authorization = forwarded?.headers.get('authorization') || '';
  const claims = await verifyGameToken(authorization.replace(/^Bearer /, ''), environment.GAME_SERVER_SECRET);
  assert.equal(claims.sub, 'account-a');
});

test('the proxy fails closed when backend configuration or account identity is missing', async () => {
  const fetchImpl = async () => { throw new Error('must not fetch'); };
  for (const options of [
    {accountId: 'account-a', path: '/game', environment: {}, fetchImpl},
    {accountId: null, path: '/game', environment, fetchImpl},
  ]) {
    const response = await proxyGameRequest(new Request('https://app.example/api/game'), options);
    assert.equal(response.status, 503);
  }
});

test('public content can be proxied without an identity and preserves safe cache headers', async () => {
  const response = await proxyGameRequest(
    new Request('https://app.example/api/game/content?version=v1'),
    {accountId: null, public: true, path: '/content', environment, fetchImpl: async (request) => {
      assert.equal(request.headers.get('authorization'), null);
      return Response.json({contentVersion: 'v1'}, {headers: {etag: '"v1"', 'cache-control': 'public, max-age=31536000, immutable'}});
    }},
  );
  assert.equal(response.headers.get('etag'), '"v1"');
  assert.match(response.headers.get('cache-control') || '', /immutable/);
});

test('mutation CSRF validation requires an exact same-origin Origin header', () => {
  assert.equal(isSameOriginMutation(new Request('https://app.example/api/game', {method: 'POST', headers: {origin: 'https://app.example'}})), true);
  assert.equal(isSameOriginMutation(new Request('https://app.example/api/game', {method: 'POST'})), false);
  assert.equal(isSameOriginMutation(new Request('https://app.example/api/game', {method: 'POST', headers: {origin: 'https://evil.example'}})), false);
});

test('production reverse proxy origin uses configured public origin, not spoofed forwarded headers', () => {
  const origin = 'https://game.example';
  assert.equal(isSameOriginMutation(new Request('http://0.0.0.0:3000/api/game', {method: 'POST', headers: {origin}}), origin), true);
  assert.equal(isSameOriginMutation(new Request('http://0.0.0.0:3000/api/game', {method: 'POST', headers: {origin: 'https://evil.example', 'x-forwarded-host': 'evil.example'}}), origin), false);
});
