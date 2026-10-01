import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createGameServer, type GameServerOptions, type GameSnapshot} from '../src/server.ts';
import {issueSession,accounts,appOrigin} from './session-fixture.ts';
import {createGame,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {finishCombat} from '../../../packages/game-domain/src/rules/combat-metrics.js';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';
import {applyGameEvent,type GameSnapshotEvent} from '../../../packages/contracts/src/events.ts';

const secret = 'test-secret-that-is-at-least-32-characters-long';
const baseState: any = createGame('Aria', 7654321, 0);
baseState.receipts = [{requestId: 'private'}];

function snapshot(accountId: string, characterId = `${accountId}-hero`, revision = 3): GameSnapshot {
  return {
    state: {...baseState, id: characterId, name: accountId},
    revision,
    account: {id: accountId, primaryCharacterId: `${accountId}-hero`, partyId: `${accountId}-party`, revision, createdAt: 1},
    roster: [{id: characterId, characterId, name: accountId, classId: 8, raceId: 1, level: 7, kind: 'hero', professions: []}],
    activities: [],
    instanceId: null,
    instance: null,
  };
}

type TestService = GameServerOptions['service'] & {calls: Array<Record<string, unknown>>};

function fakeService(): TestService {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    async snapshot(accountId: string, characterId?: string) {
      calls.push({method: 'snapshot', accountId, characterId});
      if (characterId && !characterId.startsWith(`${accountId}-`)) {
        throw Object.assign(new Error('角色不属于此账号'), {status: 403, code: 'FORBIDDEN'});
      }
      return snapshot(accountId, characterId);
    },
    async createAccount(accountId: string, input: unknown, requestId: string) {
      calls.push({method: 'createAccount', accountId, input, requestId});
      return snapshot(accountId, undefined, 1);
    },
    async command(accountId: string, command: Record<string, unknown>) {
      calls.push({method: 'command', accountId, command});
      return snapshot(accountId, command.characterId as string | undefined, 4);
    },
    async work() { return {activities: 0, instances: 0, errors: []}; },
  };
}

type Started<T extends GameServerOptions['service']> = {
  game: ReturnType<typeof createGameServer>;
  service: T;
  url: string;
};

async function start(): Promise<Started<TestService>>;
async function start<T extends GameServerOptions['service']>(service: T): Promise<Started<T>>;
async function start(service: GameServerOptions['service'] = fakeService()): Promise<Started<GameServerOptions['service']>> {
  const game = createGameServer({service, accounts, appOrigin, pollIntervalMs: 15});
  game.server.listen(0, '127.0.0.1');
  await once(game.server, 'listening');
  const address = game.server.address();
  assert.ok(address && typeof address === 'object');
  return {game, service, url: `http://127.0.0.1:${address.port}`};
}

async function auth(accountId: string) {
  return {Origin:appOrigin,Cookie: `wow_session=${await issueSession({sub: accountId})}`};
}



test('server startup rejects an origin containing a path', () => {
 assert.throws(()=>createGameServer({service:fakeService(),accounts,appOrigin:'https://game.test/path'}),/APP_ORIGIN/);
});

test('combat scope has its own ETag and refreshes the complete view when combat ends',async t=>{
 const service=fakeService(),state:any=createGame('同步',31,0);startCombat(state,[299]);
 let revision=1;
 service.snapshot=async(accountId,characterId)=>({...snapshot(accountId,characterId,revision),state});
 const {game,url}=await start(service);t.after(()=>game.close());const headers=await auth('account-a');
 const compact=await fetch(`${url}/api/game?scope=combat`,{headers}),compactBody:any=await compact.json();
 assert.equal(compactBody.scope,'combat');assert.equal(compactBody.snapshot.view.skills,undefined);
 const unchanged=await fetch(`${url}/api/game?scope=combat`,{headers:{...headers,'If-None-Match':compact.headers.get('etag')!}});
 assert.equal(unchanged.status,304);
 const full=await fetch(`${url}/api/game`,{headers:{...headers,'If-None-Match':compact.headers.get('etag')!}});
 assert.equal(full.status,200);assert.equal((await full.json() as any).scope,'full');
 finishCombat(state);revision++;
 const ended:any=await (await fetch(`${url}/api/game?scope=combat`,{headers})).json();
 assert.equal(ended.scope,'full');assert.ok(ended.snapshot.view.skills);assert.ok(ended.snapshot.player.lastCombat);
});

test('two authenticated clients only receive their own projected game snapshot', async (t) => {
  const {game, url} = await start();
  t.after(() => game.close());

  const [a, b] = await Promise.all([
    fetch(`${url}/api/game`, {headers: await auth('account-a')}),
    fetch(`${url}/api/game`, {headers: await auth('account-b')}),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const [bodyA, bodyB] = await Promise.all([a.json(), b.json()]) as any[];
  assert.equal(bodyA.protocolVersion, 1);
  assert.equal(bodyA.account.id, 'account-a');
  assert.equal(bodyB.account.id, 'account-b');
  assert.equal(bodyA.snapshot.player.name, 'account-a');
  assert.equal('rngState' in bodyA.snapshot.player, false);
  assert.equal('receipts' in bodyA.snapshot.player, false);
});

test('game endpoints reject unsigned identity headers and reject cross-account characters', async (t) => {
  const {game, url} = await start();
  t.after(() => game.close());

  const unsigned = await fetch(`${url}/api/game`, {'headers': {'oai-authenticated-user-id': 'account-a'}});
  assert.equal(unsigned.status, 401);
  const forbidden = await fetch(`${url}/api/game?characterId=account-b-hero`, {headers: await auth('account-a')});
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), {error: '角色不属于此账号', code: 'FORBIDDEN'});
});

test('commands derive the account from the validated session and never forward claimed account identity', async (t) => {
  const {game, service, url} = await start();
  t.after(() => game.close());

  const response = await fetch(`${url}/api/game`, {
    method: 'POST',
    headers: {...await auth('account-a'), 'content-type': 'application/json'},
    body: JSON.stringify({type: 'travel', requestId: 'request-1234', characterId: 'account-a-hero', accountId: 'account-b', userId: 'account-b'}),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(service.calls.at(-1), {
    method: 'command',
    accountId: 'account-a',
    command: {type: 'travel', requestId: 'request-1234', characterId: 'account-a-hero'},
  });
});

test('character creation rejects malformed names and class choices before calling the domain', async (t) => {
  const {game, service, url} = await start();
  t.after(() => game.close());
  const response = await fetch(`${url}/api/game`, {
    method: 'POST',
    headers: {...await auth('account-a'), 'content-type': 'application/json'},
    body: JSON.stringify({type: 'create', requestId: 'create-invalid', name: '', classId: 'mage', raceId: 1}),
  });
  assert.equal(response.status, 400);
  assert.equal(service.calls.length, 0);
});

test('character creation forwards a valid gender and rejects unknown values', async (t) => {
  const {game, service, url} = await start();
  t.after(() => game.close());
  const created = await fetch(`${url}/api/game`, {
    method: 'POST',
    headers: {...await auth('account-a'), 'content-type': 'application/json'},
    body: JSON.stringify({type: 'create', requestId: 'create-female', name: 'Hero', classId: 8, raceId: 1, gender: 'female'}),
  });
  assert.equal(created.status, 200);
  assert.deepEqual(service.calls.at(-1), {method:'createAccount', accountId:'account-a', input:{name:'Hero',classId:8,raceId:1,gender:'female'}, requestId:'create-female'});
  const invalid = await fetch(`${url}/api/game`, {
    method: 'POST',
    headers: {...await auth('account-a'), 'content-type': 'application/json'},
    body: JSON.stringify({type: 'create', requestId: 'create-invalid-gender', name: 'Hero', classId: 8, raceId: 1, gender: 'other'}),
  });
  assert.equal(invalid.status, 400);
});

test('versioned content is immutable only for the exact version and mismatches fail', async (t) => {
  const content = {contentVersion: 'content-v1', items: {}, market: [], enchants: [], bandages: [], potionOptions: [], creationOptions: []};
  const service = fakeService();
  const game = createGameServer({service, accounts, appOrigin, content: () => content as any});
  game.server.listen(0, '127.0.0.1');
  await once(game.server, 'listening');
  t.after(() => game.close());
  const address = game.server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;

  const current = await fetch(`${url}/api/game/content?version=content-v1`);
  assert.equal(current.status, 200);
  assert.match(current.headers.get('cache-control') || '', /immutable/);
  assert.match(current.headers.get('etag') || '', /^(?:W\/)?"[a-f0-9]{64}"$/);
  const core = await current.json() as any;
  assert.equal(core.pack, 'core');
  assert.deepEqual(core.items, {});
  const unchanged = await fetch(`${url}/api/game/content?version=content-v1`, {headers:{'if-none-match':current.headers.get('etag')!}});
  assert.equal(unchanged.status, 304);
  const market = await fetch(`${url}/api/game/content?version=content-v1&pack=market`, {headers:{'if-none-match':current.headers.get('etag')!}});
  assert.equal(market.status, 200, 'one pack must not validate the cache of another');
  assert.notEqual(market.headers.get('etag'), current.headers.get('etag'));
  assert.equal((await market.json() as any).pack, 'market');
  assert.equal((await fetch(`${url}/api/game/content?version=content-v1&pack=items&ids=-1`)).status,400);
  assert.equal((await fetch(`${url}/api/game/content?version=content-v1&pack=all`)).status,404);
  const mismatch = await fetch(`${url}/api/game/content?version=old`);
  assert.equal(mismatch.status, 409);
  assert.match((await mismatch.json() as any).error, /版本/);
  const unversioned = await fetch(`${url}/api/game/content`);
  assert.equal(unversioned.headers.get('cache-control'), 'no-store');
});

test('websocket subscriptions send full own-account snapshots with revision and instance sequence', async (t) => {
  const service = fakeService();
  let revision=3,sequence=12;
  service.snapshot = async (accountId: string, characterId?: string) => ({
    ...snapshot(accountId, characterId,revision),
    instanceId: 'instance-1',
    instance: {id: 'instance-1', contentId: 'deadmines', status: 'running', capacity: 5, roster: [], sequence, epoch: 2},
  });
  const {game, url} = await start(service);
  t.after(() => game.close());
  const token = await issueSession({sub: 'account-a'});
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/api/events', {headers: {Origin:appOrigin,Cookie: `wow_session=${token}`}});
  t.after(() => socket.close());
  await once(socket, 'open');
  socket.send(JSON.stringify({type: 'subscribe', characterId: 'account-a-hero', revision: 0, sequence: 0}));
  const [raw] = await once(socket, 'message');
  const event = JSON.parse(raw.toString());
  assert.equal(event.type, 'snapshot');
  assert.equal(event.revision, 3);
  assert.equal(event.sequence, 12);
  assert.equal(event.snapshot.player.name, 'account-a');
  assert.equal(event.delta, undefined);
  const changed=once(socket,'message');revision=4;sequence=13;
  const [nextRaw]=await changed,next=JSON.parse(nextRaw.toString());
  assert.equal(next.type,'snapshot');
  assert.equal(next.revision,4);
  assert.equal(next.sequence,13);
});

test('delta websocket subscriptions reconstruct changes and resubscribe with a full snapshot',async t=>{
 let current=0;
 const revisions=[3,4,5],sequences=[12,13,14],money=[100,125,90];
 const service=fakeService();
 service.snapshot=async(accountId:string,characterId?:string)=>{
  const result=snapshot(accountId,characterId,revisions[current]);
  result.state!.money=money[current];
  result.state!.rngState=999+current;
  (result.state as any).serverDecision={next:'hidden'};
  result.instanceId='instance-1';
  result.instance={id:'instance-1',contentId:'deadmines',status:'running',capacity:5,roster:[],sequence:sequences[current],epoch:77};
  result.activities=[{id:'activity',actorId:characterId||`${accountId}-hero`,type:'craft',status:'running',rngState:88,engineActivity:{reserved:true}}];
  return result;
 };
 const {game,url}=await start(service);t.after(()=>game.close());
 const token=await issueSession({sub:'account-a'});
 const socket=new WebSocket(url.replace('http:','ws:')+'/api/events',{headers:{Origin:appOrigin,Cookie:`wow_session=${token}`}});t.after(()=>socket.close());
 await once(socket,'open');
 socket.send(JSON.stringify({type:'subscribe',mode:'delta',characterId:'account-a-hero'}));
 let [raw]=await once(socket,'message'),event=JSON.parse(raw.toString());
 assert.equal(event.type,'snapshot');
 let rebuilt=applyGameEvent(null,event) as GameSnapshotEvent;
 for(current=1;current<=2;current++){
  const pending=once(socket,'message');
  [raw]=await pending;event=JSON.parse(raw.toString());
  assert.equal(event.type,'delta');
  assert.equal(event.baseRevision,revisions[current-1]);
  assert.equal(event.baseSequence,sequences[current-1]);
  rebuilt=applyGameEvent(rebuilt,event);
  assert.equal(rebuilt.revision,revisions[current]);
  assert.equal(rebuilt.sequence,sequences[current]);
  assert.equal((rebuilt.snapshot!.player as any).money,money[current]);
  assert.equal(raw.toString().includes('rngState'),false);
  assert.equal(raw.toString().includes('serverDecision'),false);
  assert.equal(raw.toString().includes('engineActivity'),false);
 }
 current=2;
 const resubscribed=once(socket,'message');
 socket.send(JSON.stringify({type:'subscribe',mode:'delta',characterId:'account-a-hero',revision:3,sequence:12}));
 [raw]=await resubscribed;event=JSON.parse(raw.toString());
 assert.equal(event.type,'snapshot');
 assert.equal(event.revision,5);
 assert.equal(event.sequence,14);
});

test('the HTTP boundary integrates with a real GameService and isolates its created character', async (t) => {
  const store = new MemoryStore();
  const service = new GameService(store, {contentVersion: CONTENT_VERSION});
  const {game, url} = await start(service);
  t.after(async () => { await game.close(); await store.close(); });
  const empty = await fetch(`${url}/api/game`, {headers: await auth('real-a')});
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), {
    protocolVersion: 1,
    scope: 'full',
    contentVersion: CONTENT_VERSION,
    revision: 0,
    snapshot: null,
    combatMode: null,
    playback: null,
    account: null,
    roster: [],
    activities: [],
    instanceId: null,
    instance: null,
  });
  const created = await fetch(`${url}/api/game`, {
    method: 'POST',
    headers: {...await auth('real-a'), 'content-type': 'application/json'},
    body: JSON.stringify({type: 'create', requestId: 'create-real-a', name: '真实边界', classId: 1, raceId: 1}),
  });
  assert.equal(created.status, 200);
  const payload = await created.json() as any;
  assert.equal(payload.account.id, 'real-a');
  assert.equal(payload.snapshot.player.name, '真实边界');
  const forbidden = await fetch(`${url}/api/game?characterId=${encodeURIComponent(payload.snapshot.player.id)}`, {headers: await auth('real-b')});
  assert.equal(forbidden.status, 404);
});

test('conditional HTTP polls publish idle regeneration and cache again after full recovery',async t=>{
 let now=1000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:CONTENT_VERSION,now:()=>now});
 const created=await service.createAccount('recover',{name:'恢复',classId:8,raceId:1},'create');
 await store.transaction(async tx=>{const c=(await tx.get('characters',created.state.id))!;c.rules.hp=1;c.rules.mana=0;await tx.put('characters',c);});
 const {game,url}=await start(service);t.after(async()=>{await game.close();await store.close();});
 const headers=await auth('recover');const first=await fetch(url+'/api/game',{headers});const before=await first.json() as any;
 now=7000;const next=await fetch(url+'/api/game',{headers:{...headers,'if-none-match':first.headers.get('etag')!}});
 assert.equal(next.status,200);const after=await next.json() as any;
 assert.ok(after.snapshot.player.hp>before.snapshot.player.hp);assert.ok(after.snapshot.player.mana>0);
 now=121000;const full=await fetch(url+'/api/game',{headers});const body=await full.json() as any;
 assert.equal(body.snapshot.player.hp,body.snapshot.view.stats.maxHp);assert.equal(body.snapshot.player.mana,body.snapshot.view.stats.maxMana);
 now=123000;const unchanged=await fetch(url+'/api/game',{headers:{...headers,'if-none-match':full.headers.get('etag')!}});assert.equal(unchanged.status,304);
});

test('authenticated user can recreate an invalid save then read it normally', async t => {
  const store = new MemoryStore(), service = new GameService(store, {contentVersion: CONTENT_VERSION, now: () => 1000});
  const input = {name: 'Reborn', classId: 8, raceId: 1};
  const old = await service.createAccount('recreate', input, 'old-create');
  await store.transaction(async tx => {
    const row = (await tx.get('account_presence', 'recreate'))!;
    delete row.lastSeenAt;
    await tx.put('account_presence', row);
  });
  const {game, url} = await start(service);
  t.after(async () => {await game.close(); await store.close();});
  const headers = {...await auth('recreate'), 'content-type': 'application/json'};
  const invalid = await fetch(url + '/api/game', {headers});
  assert.equal(invalid.status, 409);
  assert.equal((await invalid.json() as any).code, 'ACCOUNT_STATE');
  const response = await fetch(url + '/api/game', {method: 'POST', headers, body: JSON.stringify({type: 'create', ...input, requestId: 'recreate-request'})});
  assert.equal(response.status, 200);
  const created = await response.json() as any;
  assert.notEqual(created.snapshot.player.id, old.state.id);
  const loaded = await fetch(url + '/api/game', {headers});
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json() as any).snapshot.player.id, created.snapshot.player.id);
  const duplicate = await fetch(url + '/api/game', {method: 'POST', headers, body: JSON.stringify({type: 'create', ...input, requestId: 'duplicate-request'})});
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json() as any).code, 'EXISTS');
});

test('authenticated conditional polls refresh offline allowance even when the response is 304', async t => {
  let now = 1000;
  const store = new MemoryStore(), service = new GameService(store, {contentVersion: CONTENT_VERSION, now: () => now, offlineLimitMs: 2000});
  await service.createAccount('presence', {name: 'Presence', classId: 8, raceId: 1}, 'create');
  const {game, url} = await start(service);
  t.after(async () => {await game.close(); await store.close();});
  const headers = await auth('presence');
  const first = await fetch(url + '/api/game', {headers});
  now = 2500;
  const cached = await fetch(url + '/api/game', {headers: {...headers, 'if-none-match': first.headers.get('etag')!}});
  assert.equal(cached.status, 304);
  assert.equal((await store.transaction(tx => tx.get('account_presence', 'presence')))!.lastSeenAt, 2500);
  now = 4000;
  await service.snapshot('presence');
  assert.equal((await store.transaction(tx => tx.get('account_presence', 'presence')))!.lastSeenAt, 2500);
});

test('conditional snapshots validate identity and stop unchanged response serialization',async t=>{
 const service=fakeService();let revision=3;
 service.snapshot=async(accountId:string,characterId?:string)=>{
  if(characterId&&!characterId.startsWith(accountId+'-'))throw Object.assign(new Error('forbidden'),{status:403});
  return snapshot(accountId,characterId,revision);
 };
 const {game,url}=await start(service);t.after(()=>game.close());
 const headers=await auth('account-a');
 const first=await fetch(url+'/api/game',{headers});assert.equal(first.status,200);
 const etag=first.headers.get('etag');assert.ok(etag);
 const unchanged=await fetch(url+'/api/game',{headers:{...headers,'if-none-match':etag}});
 assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
 const forbidden=await fetch(url+'/api/game?characterId=account-b-hero',{headers:{...headers,'if-none-match':etag}});
 assert.equal(forbidden.status,403);
 const different=await fetch(url+'/api/game?characterId=account-a-helper',{headers:{...headers,'if-none-match':etag}});
 assert.equal(different.status,200);assert.notEqual(different.headers.get('etag'),etag);
 revision++;
 const changed=await fetch(url+'/api/game',{headers:{...headers,'if-none-match':etag}});
 assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);
});



test('realtime subscriptions send compact combat projections between full refreshes',async t=>{
 const service=fakeService(),scopes:string[]=[];let revision=0;
 const state:any=structuredClone(baseState);state.hp=10000;startCombat(state,[299]);
 service.snapshot=async(accountId,characterId,_online,scope='full')=>{
  scopes.push(scope);const result=snapshot(accountId,characterId,++revision);result.state={...state,id:characterId||'account-a-hero',clock:revision*100};return result;
 };
 const {game,url}=await start(service);t.after(()=>game.close());
 const token=await issueSession({sub:'account-a'}),socket=new WebSocket(url.replace('http:','ws:')+'/api/events',{headers:{Origin:appOrigin,Cookie:`wow_session=${token}`}});t.after(()=>socket.close());
 const events:any[]=[];let completed!:()=>void;const done=new Promise<void>(resolve=>completed=resolve);
 socket.on('message',raw=>{const event=JSON.parse(raw.toString());if(event.type!=='heartbeat'){events.push(event);if(events.length>=13)completed();}});
 await once(socket,'open');socket.send(JSON.stringify({type:'subscribe',mode:'delta',realtime:true,characterId:'account-a-hero'}));
 await Promise.race([done,new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(new Error('Realtime subscription timed out')),4000);timeout.unref();})]);
 assert.equal(scopes[0],'full');assert.ok(scopes.slice(1).includes('combat'));
 let current:GameSnapshotEvent|null=null;for(const event of events)current=applyGameEvent(current,event);
 assert.ok(scopes.filter(scope=>scope==='full').length>=2);
 assert.ok(events.slice(1).every(event=>event.type==='delta'),'cadence changes must keep the delta baseline');
 assert.ok((current!.snapshot!.view as any).talentTrees,'slow metadata remains present between full refreshes');
 assert.equal((current!.snapshot!.player as any).id,'account-a-hero');
});

test('websocket baseline and changed asset paths both use the configured asset host',async t=>{
 const service=fakeService();let revision=1;
 service.snapshot=async()=>({...snapshot('account-a',undefined,revision),response:{protocolVersion:1,contentVersion:'content',revision,scope:'full',snapshot:{player:{id:'account-a-hero'},view:{portrait:{src:`/icons/assets/icon-${revision}.png`}}}}});
 const game=createGameServer({service,accounts,appOrigin,pollIntervalMs:15,publicAssetBase:'https://assets.test'});t.after(()=>game.close());
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const address=game.server.address();assert.ok(address&&typeof address==='object');
 const socket=new WebSocket(`ws://127.0.0.1:${address.port}/api/events`,{headers:await auth('account-a')});t.after(()=>socket.close());await once(socket,'open');
 socket.send(JSON.stringify({type:'subscribe',mode:'delta'}));let [raw]=await once(socket,'message');let current=applyGameEvent(null,JSON.parse(raw.toString()));
 assert.equal((current.snapshot!.view as any).portrait.src,'https://assets.test/icons/assets/icon-1.png');
 const next=once(socket,'message');revision=2;[raw]=await next;current=applyGameEvent(current,JSON.parse(raw.toString()));
 assert.equal((current.snapshot!.view as any).portrait.src,'https://assets.test/icons/assets/icon-2.png');
});


test('a large initial baseline drains without a heartbeat-induced reconnect',async t=>{
 const service=fakeService();let revision=0;
 service.snapshot=async()=>{revision++;return {...snapshot('account-a',undefined,revision),response:{protocolVersion:1,contentVersion:'large',revision,scope:'full',snapshot:{player:{id:'account-a-hero'},view:{metadata:'x'.repeat(2_000_000)}}}};};
 const {game,url}=await start(service);t.after(()=>game.close());
 const socket=new WebSocket(url.replace('http:','ws:')+'/api/events',{headers:await auth('account-a')});t.after(()=>socket.close());
 const events:any[]=[];let resolve!:()=>void,reject!:(error:Error)=>void;const done=new Promise<void>((a,b)=>{resolve=a;reject=b;});
 const timer=setTimeout(()=>reject(new Error('Large baseline stalled')),4000);t.after(()=>clearTimeout(timer));
 socket.on('close',code=>{if(events.length<2)reject(new Error(`Disconnected before delta: ${code}`));});
 socket.on('message',raw=>{const event=JSON.parse(raw.toString());if(event.type==='heartbeat')return;events.push(event);if(events.length>=2)resolve();});
 await once(socket,'open');socket.send(JSON.stringify({type:'subscribe',mode:'delta',realtime:true}));await done;
 assert.equal(events[0].type,'snapshot');assert.equal(events[1].type,'delta');
 assert.ok(JSON.stringify(events[1]).length<1000);assert.equal(socket.readyState,WebSocket.OPEN);
});


test('public readiness coalesces probes and hides internal failures',async t=>{
 let calls=0;
 const game=createGameServer({service:fakeService(),accounts,appOrigin,readiness:async()=>{calls++;throw new Error('private database credentials');}});t.after(()=>game.close());
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');const address=game.server.address();assert.ok(address&&typeof address==='object');
 const responses=await Promise.all(Array.from({length:8},()=>fetch(`http://127.0.0.1:${address.port}/api/health`)));
 for(const response of responses){assert.equal(response.status,503);assert.deepEqual(await response.json(),{ready:false});}
 assert.equal(calls,1);
});

test('client simulation endpoints are absent and commands retain the small input limit',async t=>{
 const {game,url}=await start(fakeService());t.after(()=>game.close());const headers={...await auth('account-a'),'content-type':'application/json'};
 const removed=await fetch(url+'/api/game/local',{method:'POST',headers,body:JSON.stringify({type:'claim',requestId:'old-claim'})});
 assert.equal(removed.status,404);
 const oversized=await fetch(url+'/api/game',{method:'POST',headers,body:JSON.stringify({type:'settings',requestId:'oversized',state:'x'.repeat(20000)})});
 assert.equal(oversized.status,413);
 const response:any=await(await fetch(url+'/api/game',{headers})).json();
 assert.equal(Object.hasOwn(response,'localSimulation'),false);
});

for(const staleFailure of [false,true])test(`a pending old-character ${staleFailure?'denial':'snapshot'} cannot replace or close a new subscription`,{timeout:10000},async t=>{
 const service=fakeService();let release!:()=>void,entered!:()=>void;
 const blocked=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const calls:string[]=[];
 service.snapshot=async(accountId,characterId)=>{
  calls.push(characterId!);
  if(characterId==='account-a-old'){
   entered();await blocked;
   if(staleFailure)throw Object.assign(new Error('old character unavailable'),{status:403,code:'FORBIDDEN'});
  }
  return {...snapshot(accountId,characterId,1),response:{protocolVersion:1,contentVersion:'test',revision:1,scope:'full',snapshot:{player:{id:characterId!},view:{}}}};
 };
 const {game,url}=await start(service);t.after(()=>game.close());
 const socket=new WebSocket(url.replace('http:','ws:')+'/api/events',{headers:await auth('account-a')});t.after(()=>{release();socket.close();});
 const events:any[]=[];socket.on('message',raw=>events.push(JSON.parse(raw.toString())));
 await once(socket,'open');socket.send(JSON.stringify({type:'subscribe',characterId:'account-a-old',mode:'delta',realtime:true}));
 await started;
 socket.send(JSON.stringify({type:'subscribe',characterId:'account-a-new',mode:'delta',realtime:true}));
 // The pong follows the preceding subscribe frame, so the new subscription is
 // installed before releasing the old asynchronous projection.
 const pong=once(socket,'pong');socket.ping();await pong;
 const received=once(socket,'message');release();await received;
 assert.equal(events.length,1);assert.equal(events[0].type,'snapshot');
 assert.equal(events[0].snapshot.player.id,'account-a-new');assert.equal(socket.readyState,WebSocket.OPEN);
 assert.deepEqual(calls.slice(0,2),['account-a-old','account-a-new']);
});
