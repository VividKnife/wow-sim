import assert from 'node:assert/strict';
import test from 'node:test';
import {isSameOriginMutation, proxyGameRequest} from '../lib/game-backend.ts';
import {verifyGameToken} from '../../game-server/src/auth.ts';
import {gunzipSync} from 'node:zlib';

const environment = {
  GAME_SERVER_URL: 'https://game.internal.example/base',
  GAME_SERVER_SECRET: 'test-secret-that-is-at-least-32-characters-long',
};

test('large streamed snapshots are compressed losslessly at the web boundary',async()=>{
 const body=JSON.stringify({snapshot:{party:Array.from({length:25},(_,id)=>({id,history:'战斗记录'.repeat(5000)}))}});
 const response=await proxyGameRequest(new Request('https://app.example/api/game',{headers:{'accept-encoding':'br, gzip, deflate'}}),{
  accountId:'account-a',path:'/game',environment,fetchImpl:async()=>new Response(body,{headers:{'content-type':'application/json','etag':'"raid-1"','content-length':String(Buffer.byteLength(body))}}),
 });
 const compressed=Buffer.from(await response.arrayBuffer());
 assert.equal(response.headers.get('content-encoding'),'gzip');
 assert.equal(response.headers.get('vary'),'Accept-Encoding');
 assert.equal(response.headers.get('etag'),'W/"raid-1"');
 assert.equal(response.headers.get('content-length'),null);
 assert.equal(gunzipSync(compressed).toString(),body);
 assert.ok(compressed.length<Buffer.byteLength(body)/10);
});

test('compressed validators round trip to upstream and 304 stays bodyless',async()=>{
 const response=await proxyGameRequest(new Request('https://app.example/api/game',{headers:{'accept-encoding':'gzip','if-none-match':'W/"raid-1"'}}),{
  accountId:'account-a',path:'/game',environment,fetchImpl:async request=>{
   assert.equal(request.headers.get('if-none-match'),'"raid-1"');
   return new Response(null,{status:304,headers:{etag:'"raid-1"'}});
  },
 });
 assert.equal(response.status,304);assert.equal(await response.text(),'');
 assert.equal(response.headers.get('etag'),'W/"raid-1"');
 assert.equal(response.headers.get('content-encoding'),null);
 assert.equal(response.headers.get('vary'),'Accept-Encoding');
});

test('compression respects explicit gzip refusal and preserves identity clients',async()=>{
 for(const encoding of ['', 'identity', 'br', 'gzip;q=0', '*;q=1, gzip;q=0']){
  const response=await proxyGameRequest(new Request('https://app.example/api/game',{headers:{'accept-encoding':encoding}}),{
   accountId:'account-a',path:'/game',environment,fetchImpl:async()=>Response.json({ok:true},{headers:{etag:'"raid-1"'}}),
  });
  assert.equal(response.headers.get('content-encoding'),null,encoding);
  assert.deepEqual(await response.json(),{ok:true});
  assert.equal(response.headers.get('vary'),'Accept-Encoding');
 }
});

test('cancelling a compressed response also cancels the upstream stream',async()=>{
 let cancelled;
 const closed=new Promise(resolve=>{cancelled=resolve;});
 const response=await proxyGameRequest(new Request('https://app.example/api/game',{headers:{'accept-encoding':'gzip'}}),{
  accountId:'account-a',path:'/game',environment,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled();}}),{headers:{'content-type':'application/json'}}),
 });
 await response.body.cancel();await closed;
});

test('aborting a browser poll cancels its upstream request too',async()=>{
 const controller=new AbortController();let upstreamSignal;
 const response=await proxyGameRequest(new Request('https://app.example/api/game?scope=combat',{signal:controller.signal}),{
  accountId:'account-a',path:'/game',environment,fetchImpl:async request=>{upstreamSignal=request.signal;assert.equal(new URL(request.url).searchParams.get('scope'),'combat');return Response.json({ok:true});},
 });
 assert.equal(response.status,200);assert.equal(upstreamSignal.aborted,false);
 controller.abort();assert.equal(upstreamSignal.aborted,true);
});

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
