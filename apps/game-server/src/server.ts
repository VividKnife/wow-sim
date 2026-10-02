import type {GmService} from '../../../packages/game-domain/src/gm.ts';
import {AdminStore, ADMIN_SESSION_SECONDS} from './admin-store.ts';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {createHash} from 'node:crypto';
import {WebSocketServer, type WebSocket} from 'ws';
import {accountFrom,sessionToken,sessionCookie,sameOrigin,type Accounts} from './session-auth.ts';
import {createPublicationLoop} from './publication-loop.ts';
import {clientAddress} from './client-address.ts';
import {characterPreview} from './character-preview.js';
import {handleModelRequest} from './wowhead-model-assets.js';
import {gzip} from 'node:zlib';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {publicAssetUrl} from '../../../packages/contracts/src/asset-paths.mjs';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
import {contentPack} from '../../../packages/game-domain/src/rules/content-packs.js';
import {workshopView} from '../../../packages/game-domain/src/rules/workshop.js';
import {createDeltaEvent,type GameSnapshotEvent} from '../../../packages/contracts/src/events.ts';

export type GameSnapshot = {
  response?: import('../../../packages/contracts/src/game.ts').GameResponse;
  state: Record<string, any> | null;
  revision: number;
  account: object | null;
  roster: object[];
  activities: object[];
  instanceId: string | null;
  combatMode?: 'recorded' | 'realtime' | 'local' | null;
  playback?: import('../../../packages/game-domain/src/model.ts').PlaybackManifest | null;
  instance?: null | {sequence?: number; [key: string]: any};
};

export interface GameServiceLike {
  socialSnapshot?(accountId:string,actorId:string,query?:string):Promise<unknown>;
  socialCommand?(accountId:string,actorId:string,body:Record<string,any>):Promise<unknown>;
  mailInbox?(accountId:string,actorId?:string):Promise<unknown>;
  listSaves?: (userId:string)=>Promise<unknown>;
  createSave?: (userId:string,input:{name:string;classId:number;raceId:number;gender?:'male'|'female';boost?:boolean;raidReady?:boolean},requestId:string)=>Promise<unknown>;
  deleteSave?: (userId:string,saveId:string)=>Promise<void>;
  resolveSave?: (userId:string,saveId:string|null)=>Promise<string>;
  snapshot(accountId: string, characterId?: string, online?: boolean, scope?:'full'|'combat'): Promise<GameSnapshot>;
  createAccount(accountId: string, input: {name: string; classId: number; raceId: number; gender?: 'male' | 'female'}, requestId: string): Promise<GameSnapshot>;
  command(accountId: string, command: Record<string, any>): Promise<GameSnapshot>;
  work(now?: number, limit?: number): Promise<unknown>;
  combatRecording?(accountId: string, characterId: string | undefined, recordingId: string): Promise<unknown>;
}

type Content = ReturnType<typeof clientContent>;
export type GameServerOptions = {
  service: GameServiceLike;
  accounts: Accounts;
  admin?: AdminStore;
  gm?: GmService;
  appOrigin: string;
  secureCookies?: boolean;
  trustProxyHops?: number;
  publicAssetBase?: string;
  content?: () => Content;
  workshop?: typeof workshopView;
  pollIntervalMs?: number;
  readiness?:()=>Promise<boolean>;
  deployment?:{commit?:string;buildId?:string};
};

const requestIdPattern = /^[\w-]{8,100}$/;
const maximumBodyBytes = 16_384;
const maximumSocketBufferBytes = 1_048_576;

const responseContext=new WeakMap<ServerResponse,{request:IncomingMessage;assetBase:string}>();
function acceptsGzip(value:string='') {
 const values=new Map(value.toLowerCase().split(',').map(part=>{const [name,...params]=part.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return [name.trim(),q?Number(q.trim().slice(2)):1];}));
 return (values.get('gzip')??values.get('*')??0)>0;
}
function json(response:ServerResponse,status:number,body:unknown,headers:Record<string,string>={}) {
 const context=responseContext.get(response);
 const base=context?.assetBase;
 const bytes=Buffer.from(JSON.stringify(body,(key,value)=>/^(?:icon|image|src|background|portrait|texture|url|path)$/.test(key)?publicAssetUrl(value,base):value));
 const compressed=acceptsGzip(context?.request.headers['accept-encoding']);
 const result:Record<string,string>={'content-type':'application/json; charset=utf-8','cache-control':'no-store',vary:'Accept-Encoding',...headers};
 if(compressed&&result.etag&&!result.etag.startsWith('W/'))result.etag='W/'+result.etag;
 if(compressed){gzip(bytes,(error,data)=>{if(error){response.destroy(error);return;}response.writeHead(status,{...result,'content-encoding':'gzip'});response.end(data);});}
 else {response.writeHead(status,result);response.end(bytes);}
}

function errorDetails(error: unknown): {status: number; body: {error: string; code?: string}} {
  if (error && typeof error === 'object') {
    const status = Number((error as any).status);
    const message = typeof (error as any).message === 'string' ? (error as any).message : '操作未完成，请重试。';
    const code = typeof (error as any).code === 'string' ? (error as any).code : undefined;
    if (Number.isInteger(status) && status >= 400 && status < 600) return {status, body: {error: message, ...(code ? {code} : {})}};
  }
  return {status: 500, body: {error: '游戏服务暂时不可用，请稍后重试。'}};
}

async function readJson(request: IncomingMessage, maximumBytes = maximumBodyBytes): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > maximumBytes) throw Object.assign(new Error('操作内容过长'), {status: 413, code: 'BODY_TOO_LARGE'});
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error('无效的操作数据'), {status: 400, code: 'INVALID_JSON'});
  }
}

function gameResponse(snapshot: GameSnapshot, scope: 'full' | 'combat' = 'full') {
  if(snapshot.response)return snapshot.response;
  return buildGameResponse(snapshot.state, snapshot.revision, {
    account: snapshot.account,
    roster: snapshot.roster,
    activities: snapshot.activities,
    instanceId: snapshot.instanceId,
    instance: snapshot.instance ?? null,
    scope,
    combatMode: snapshot.combatMode ?? null,
    playback: snapshot.playback ?? null,
  });
}

function characterId(url: URL): string | undefined {
  const value = url.searchParams.get('characterId');
  if (value === null) return undefined;
  if (!value || value.length > 200) throw Object.assign(new Error('角色标识无效'), {status: 400, code: 'INVALID_CHARACTER'});
  return value;
}

async function readGame(service: GameServiceLike, accountId: string, selectedCharacterId?: string,scope:'full'|'combat'='full'): Promise<GameSnapshot> {
  try {
    return await service.snapshot(accountId, selectedCharacterId, true,scope);
  } catch (error) {
    if (!selectedCharacterId && error && typeof error === 'object' && (error as any).code === 'NOT_FOUND') {
      return {state: null, revision: 0, account: null, roster: [], activities: [], instanceId: null, instance: null};
    }
    throw error;
  }
}


function cleanCommand(body: Record<string, any>): Record<string, any> {
  const {accountId: _accountId, userId: _userId, sub: _sub, ...command} = body;
  return command;
}

function validateCommand(body: Record<string, any>) {
  if (typeof body.type !== 'string' || !body.type || !requestIdPattern.test(body.requestId || '')) {
    throw Object.assign(new Error('操作或请求标识无效'), {status: 400, code: 'INVALID_COMMAND'});
  }
  if (body.characterId !== undefined && (typeof body.characterId !== 'string' || !body.characterId || body.characterId.length > 200)) {
    throw Object.assign(new Error('角色标识无效'), {status: 400, code: 'INVALID_CHARACTER'});
  }
  if (body.type === 'create' && (
    typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 40 ||
    !Number.isInteger(body.classId) || body.classId < 1 ||
    !Number.isInteger(body.raceId) || body.raceId < 1 ||
    (body.gender !== undefined && !['male', 'female'].includes(body.gender))
  )) throw Object.assign(new Error('角色创建选项无效'), {status: 400, code: 'INVALID_CHARACTER_CREATE'});
}

function closeHttp(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export function createGameServer(options: GameServerOptions) {
  const origin=new URL(options.appOrigin).origin;
  if(origin!==options.appOrigin)throw new Error('APP_ORIGIN must be an origin without a path');
  const getContent = options.content ?? clientContent;
  const getWorkshop = options.workshop ?? workshopView;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const selectedAccount = async (request:IncomingMessage,url:URL) => {
    const userId=await accountFrom(request,options.accounts);
    const saveId=url.searchParams.get('saveId');
    if(saveId!==null){
      if(!options.service.resolveSave)throw Object.assign(new Error('存档服务不可用'),{status:503});
      return options.service.resolveSave(userId,saveId);
    }
    return userId;
  };
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 10) throw new Error('pollIntervalMs must be at least 10');

  let healthAt=0,healthRunning=false,health:Promise<boolean>|undefined;
  const server = createServer((request, response) => {
    void (async () => {
      responseContext.set(response,{request,assetBase:options.publicAssetBase||''});
      const url = new URL(request.url || '/', origin);
      if(!['GET','HEAD','OPTIONS'].includes(request.method||'')&&!sameOrigin(request,origin)){
        json(response,403,{error:'请求来源无效'});return;
      }
      if(url.pathname==='/api/health'&&request.method==='GET'){
        if(!health||!healthRunning&&Date.now()-healthAt>=1000){healthRunning=true;health=Promise.resolve().then(()=>options.readiness?.()??false).catch(()=>false).finally(()=>{healthAt=Date.now();healthRunning=false;});}
        const ready=await health;
        json(response,ready?200:503,{ready,...(ready&&options.deployment?{deployment:options.deployment}:{})});return;
      }
      if(url.pathname.startsWith('/api/admin/')){
        const admin=options.admin;
        if(!admin){json(response,503,{error:'管理服务尚未配置'});return;}
        const token=request.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith('wow_admin='))?.slice(10);
        const route=url.pathname.slice('/api/admin/'.length);
        const cookie=(value:string)=>`wow_admin=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${value?ADMIN_SESSION_SECONDS:0}${options.secureCookies?'; Secure':''}`;
        if(route==='session'&&request.method==='GET'){
          json(response,200,{admin:await admin.session(token),setupRequired:await admin.setupRequired()});return;
        }
        if(['register','login'].includes(route)&&request.method==='POST'){
          const body=await readJson(request,4096);
          const address=options.trustProxyHops===0?request.socket.remoteAddress||'local':clientAddress(new Request(url,{headers:{'x-forwarded-for':request.headers['x-forwarded-for']?.toString()||''}}),options.trustProxyHops);
          const result=await admin.authenticate(route as 'register'|'login',body,address);
          json(response,200,{admin:result.admin},{'set-cookie':cookie(result.token)});return;
        }
        const user=await admin.session(token);
        if(!user){json(response,401,{error:'请先登录管理员账号。'});return;}
        if(route==='logout'&&request.method==='POST'){
          await admin.logout(token);json(response,200,{ok:true},{'set-cookie':cookie('')});return;
        }
        if(route==='gm'||route==='gm-items'){
          if(!options.gm){json(response,503,{error:'发放服务尚未配置'});return;}
          if(route==='gm-items'&&request.method==='GET'){
            const search=url.searchParams.get('search')||'';
            if(search.length>100){json(response,400,{error:'搜索内容过长'});return;}
            json(response,200,{items:options.gm.searchItems(search)});return;
          }
          if(route==='gm'&&request.method==='GET'){json(response,200,await options.gm.list());return;}
          if(route==='gm'&&request.method==='POST'){
            const body=await readJson(request);
            if(body.scope==='player'&&(typeof body.userId!=='string'||!await admin.playerExists(body.userId))){json(response,400,{error:'请选择有效的玩家账号'});return;}
            json(response,200,await options.gm.execute(user.id,body));return;
          }
        }
        if(route==='moderate'&&request.method==='POST'){
          json(response,200,await admin.moderate(user.id,await readJson(request,4096)));return;
        }
        if(request.method==='GET'){
          if(route==='overview'){json(response,200,await admin.overview());return;}
          if(route==='save'){
            const id=url.searchParams.get('id');
            if(!id||id.length>200){json(response,400,{error:'存档标识无效'});return;}
            json(response,200,await admin.save(id));return;
          }
          const page=Number(url.searchParams.get('page')??0),search=url.searchParams.get('search')??'';
          if(!Number.isSafeInteger(page)||page<0||page>100000||search.length>100){json(response,400,{error:'查询参数无效'});return;}
          json(response,200,await admin.list(route,search,page));return;
        }
        json(response,404,{error:'接口不存在'});return;
      }
      if(url.pathname==='/api/auth/session'&&request.method==='GET'){
        const user=await options.accounts.session(sessionToken(request));
        json(response,user?200:401,user?{user}:{error:'请先登录。'});return;
      }
      if(url.pathname.startsWith('/api/auth/')&&request.method==='POST'){
        const action=url.pathname.slice('/api/auth/'.length);
        if(!['login','register','logout'].includes(action)){json(response,404,{error:'接口不存在'});return;}
        let token='';
        if(action==='logout')await options.accounts.logout(sessionToken(request));
        else {
          if(!request.headers['content-type']?.startsWith('application/json')){json(response,415,{error:'需要 JSON 请求'});return;}
          const body=await readJson(request,4096);
          const address=options.trustProxyHops===0?request.socket.remoteAddress||'local':clientAddress(new Request(url,{headers:{'x-forwarded-for':request.headers['x-forwarded-for']?.toString()||''}}),options.trustProxyHops);
          token=(await options.accounts[action as 'login'|'register'](body.username,body.password,address)).token;
        }
        json(response,200,{ok:true},{'set-cookie':sessionCookie(token,options.secureCookies??false)});return;
      }
      if(url.pathname==='/api/character-preview'&&request.method==='GET'){
        try{json(response,200,characterPreview(Number(url.searchParams.get('raceId')),Number(url.searchParams.get('classId')),Number(url.searchParams.get('level'))),{'cache-control':'public, max-age=300'});}
        catch{json(response,400,{error:'无效的起始配置'});}return;
      }
      if(url.pathname.startsWith('/api/model-viewer/')&&request.method==='GET'){
        const result=await handleModelRequest(new Request(url));
        response.writeHead(result.status,Object.fromEntries(result.headers));
        if(result.body)await pipeline(Readable.fromWeb(result.body as any),response);else response.end();return;
      }
      if(url.pathname==='/api/saves'){
        const userId=await accountFrom(request,options.accounts);
        if(request.method==='GET'&&options.service.listSaves){json(response,200,{saves:await options.service.listSaves(userId)});return;}
        if(request.method==='POST'&&options.service.createSave){
          const body=await readJson(request);validateCommand({...body,type:'create'});
          json(response,201,await options.service.createSave(userId,{name:body.name.trim(),classId:body.classId,raceId:body.raceId,...(body.gender?{gender:body.gender}:{}),boost:body.boost,raidReady:body.raidReady},body.requestId));return;
        }
        if(request.method==='DELETE'&&options.service.deleteSave){
          const id=url.searchParams.get('saveId');
          if(!id||id.length>200){json(response,400,{error:'存档标识无效'});return;}
          await options.service.deleteSave(userId,id);json(response,200,{deleted:true});return;
        }
      }
      if (url.pathname === '/api/game/content' && request.method === 'GET') {
        const content = getContent();
        const requestedVersion = url.searchParams.get('version');
        if (requestedVersion && requestedVersion !== content.contentVersion) {
          json(response, 409, {error: '内容版本不匹配，请刷新后重试。', code: 'CONTENT_VERSION'});
          return;
        }
        const body = contentPack(content, url.searchParams);
        const etag = '"' + createHash('sha256').update(JSON.stringify(body)).digest('hex') + '"';
        const immutable = requestedVersion === content.contentVersion;
        if (immutable && request.headers['if-none-match']?.replace(/^W\//,'') === etag) {
          response.writeHead(304, {etag: acceptsGzip(request.headers['accept-encoding'])?'W/'+etag:etag, vary:'Accept-Encoding', 'cache-control': 'public, max-age=31536000, immutable'});
          response.end();
          return;
        }
        json(response, 200, body, immutable
          ? {etag: acceptsGzip(request.headers['accept-encoding'])?'W/'+etag:etag, vary:'Accept-Encoding', 'cache-control': 'public, max-age=31536000, immutable'}
          : {'cache-control': 'no-store'});
        return;
      }
      if (url.pathname === '/api/game/replay' && request.method === 'GET') {
        const accountId = await selectedAccount(request, url);
        const id = url.searchParams.get('id');
        if (!id || id.length > 200 || !options.service.combatRecording) {
          json(response, 400, {error: '战斗回放标识无效', code: 'INVALID_REPLAY'}); return;
        }
        const recording = await options.service.combatRecording(accountId, characterId(url), id);
        json(response, 200, recording, {'cache-control': 'private, no-store'});
        return;
      }
      if(url.pathname==='/api/game/social'&&options.service.socialSnapshot&&options.service.socialCommand){
        const accountId=await selectedAccount(request,url),actorId=characterId(url);
        if(!actorId){json(response,400,{error:'请选择角色'});return;}
        if(request.method==='GET'){json(response,200,await options.service.socialSnapshot(accountId,actorId,url.searchParams.get('q')??''));return;}
        if(request.method==='POST'){const body=await readJson(request);validateCommand(body);json(response,200,await options.service.socialCommand(accountId,actorId,cleanCommand(body)));return;}
      }
      if (url.pathname === '/api/game' && request.method === 'GET') {
        const accountId = await selectedAccount(request, url);
        const selectedCharacterId = characterId(url);
        const scope = url.searchParams.get('scope') === 'combat' ? 'combat' : 'full';
        const snapshot = await readGame(options.service, accountId, selectedCharacterId,scope);
        const etag = '"' + createHash('sha256').update(JSON.stringify([snapshot.response?.execution,accountId, selectedCharacterId || snapshot.state?.id, snapshot.revision, snapshot.instanceId, snapshot.instance?.sequence, getContent().contentVersion, scope, snapshot.state?.serverBuffs, snapshot.state?.party?.map((actor:any)=>actor.serverBuffs)])).digest('hex') + '"';
        if (request.headers['if-none-match']?.replace(/^W\//,'') === etag) {
          response.writeHead(304, {etag: acceptsGzip(request.headers['accept-encoding'])?'W/'+etag:etag, vary:'Accept-Encoding', 'cache-control': 'private, no-cache'});
          response.end();
          return;
        }
        json(response, 200, gameResponse(snapshot, scope), {etag: acceptsGzip(request.headers['accept-encoding'])?'W/'+etag:etag, vary:'Accept-Encoding', 'cache-control': 'private, no-cache'});
        return;
      }
      if(url.pathname==='/api/game/mail'&&request.method==='GET'&&options.service.mailInbox){
        json(response,200,{mail:await options.service.mailInbox(await selectedAccount(request,url),characterId(url)??undefined)});return;
      }
      if (url.pathname === '/api/game' && request.method === 'POST') {
        const accountId = await selectedAccount(request, url);
        const body = await readJson(request);
        validateCommand(body);
        const result = body.type === 'create'
          ? await options.service.createAccount(accountId, {name: body.name.trim(), classId: body.classId, raceId: body.raceId, ...(body.gender ? {gender: body.gender} : {})}, body.requestId)
          : await options.service.command(accountId, cleanCommand(body));
        json(response, 200, gameResponse(result), {'cache-control': 'no-store'});
        return;
      }
      if (url.pathname === '/api/game/workshop' && request.method === 'GET') {
        const accountId = await selectedAccount(request, url);
        const current = getContent();
        const requestedVersion = url.searchParams.get('version');
        if (requestedVersion && requestedVersion !== current.contentVersion) {
          json(response, 409, {error: '内容版本不匹配，请刷新后重试。', code: 'CONTENT_VERSION'});
          return;
        }
        // Resident services publish the authoritative player projection and do
        // not expose a raw engine state. Quotes only need the projected fields.
        const snapshot = gameResponse(await options.service.snapshot(accountId, characterId(url), true, 'full'));
        if (!snapshot.snapshot) {
          json(response, 404, {error: '请先创建角色。', code: 'NOT_FOUND'});
          return;
        }
        const body = getWorkshop(snapshot.snapshot.player, {
          profession: url.searchParams.get('profession') || '',
          search: url.searchParams.get('search') || '',
          filter: url.searchParams.get('filter') || 'all',
          page: Number(url.searchParams.get('page') || 0),
          pageSize: Number(url.searchParams.get('pageSize') || 24),
        });
        json(response, 200, {...body, revision: snapshot.revision}, {'cache-control': 'no-store'});
        return;
      }
      json(response, 404, {error: '接口不存在', code: 'NOT_FOUND'});
    })().catch((error) => {
      if (response.headersSent) return response.destroy();
      const details = errorDetails(error);
      json(response, details.status, details.body,details.status===429?{'retry-after':'900'}:{});
    });
  });

  const webSocketServer = new WebSocketServer({noServer: true, maxPayload: maximumBodyBytes});
  server.on('upgrade', (request, socket, head) => {
    void (async () => {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (!sameOrigin(request,origin)) throw new Error('Invalid websocket origin');
      if (url.pathname !== '/api/events') throw new Error('Unknown websocket endpoint');
      const accountId = await selectedAccount(request, url);
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request, accountId);
      });
    })().catch(() => {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    });
  });

  webSocketServer.on('connection', (socket: WebSocket, _request: IncomingMessage, accountId: string) => {
    let selectedCharacter: string | undefined;
    let lastKey = '';
    let deliveryMode: 'snapshot' | 'delta' = 'snapshot';
    let realtime=false,lastFullAt=0,lastAuthAt=0,lastPingAt=0,lastHeartbeatAt=0,backloggedAt=0;
    let baseline: GameSnapshotEvent | null = null;
    let subscriptionId = 0;
    let lastPongAt = Date.now();
    socket.on('pong', () => { lastPongAt = Date.now(); });

    const sendEvent = (event: object) => {
      if (socket.readyState !== socket.OPEN) return false;
      if (socket.bufferedAmount > maximumSocketBufferBytes) return false;
      socket.send(JSON.stringify(event,function(key,value){
        const field=key==='value'&&this?.op==='set'&&Array.isArray(this.path)?this.path.at(-1):key;
        return /^(?:icon|image|src|background|portrait|texture|url|path)$/.test(field)?publicAssetUrl(value,options.publicAssetBase||''):value;
      }));
      return true;
    };

    const sendSnapshot = async (force = false) => {
      if (socket.readyState !== socket.OPEN) return;
      if (Date.now() - lastPongAt > 30_000) { socket.terminate(); return; }
      const now=Date.now();
      // One full baseline may exceed the watermark. Let it drain instead of
      // disconnecting when the immediate heartbeat sees its buffered bytes.
      // Do not enqueue more data behind it; persistently slow peers time out.
      if(socket.bufferedAmount>maximumSocketBufferBytes){
        if(!backloggedAt)backloggedAt=now;
        if(now-backloggedAt>=5000)socket.close(1013,'Slow receiver');
        return;
      }
      backloggedAt=0;
      if(now-lastPingAt>=10000){socket.ping();lastPingAt=now;}
      const fighting=!!baseline?.snapshot?.player?.combat;
      const scope=realtime&&fighting&&!force&&now-lastFullAt<1000?'combat':'full';
      const activeSubscription = subscriptionId;
      const activeCharacter = selectedCharacter;
      try {
        if(now-lastAuthAt>=1000){await accountFrom(_request,options.accounts);lastAuthAt=now;}
        const snapshot = await options.service.snapshot(accountId, activeCharacter, true,scope);
        if (activeSubscription !== subscriptionId || socket.readyState !== socket.OPEN) return;
        if(scope==='full')lastFullAt=now;
        const sequence = snapshot.response?.execution?.streamSequence??snapshot.instance?.sequence ?? 0;
        const key = `${snapshot.response?.execution?.ownerEpoch??0}:${snapshot.revision}:${sequence}:${activeCharacter || ''}:${JSON.stringify(snapshot.state?.serverBuffs||[])}`;
        if (force || key !== lastKey) {
          let next = {type: 'snapshot', sequence, ...gameResponse(snapshot,scope)} as GameSnapshotEvent;
          const sameOwner=baseline&&next.execution?.ownerEpoch===baseline.execution?.ownerEpoch&&next.execution?.instanceId===baseline.execution?.instanceId&&next.execution?.actorId===baseline.execution?.actorId&&next.execution?.controllerGeneration===baseline.execution?.controllerGeneration&&next.snapshot?.player.id===baseline.snapshot?.player.id&&next.contentVersion===baseline.contentVersion;
          // Keep slow metadata in the stream baseline across combat updates.
          // Switching projection cadence must not delete and resend the world.
          if(next.scope==='combat'&&sameOwner&&baseline?.snapshot&&next.snapshot)next={...next,snapshot:{...next.snapshot,view:{...baseline.snapshot.view,...next.snapshot.view}}};
          const event = !force && deliveryMode === 'delta' && baseline && sameOwner &&
            next.execution?.ownerEpoch===baseline.execution?.ownerEpoch&&next.execution?.instanceId===baseline.execution?.instanceId&&
            next.execution?.actorId===baseline.execution?.actorId&&next.execution?.controllerGeneration===baseline.execution?.controllerGeneration&&
            next.contentVersion===baseline.contentVersion&&
            next.revision >= baseline.revision && next.sequence >= baseline.sequence &&
            (next.revision > baseline.revision || next.sequence > baseline.sequence)
            ? createDeltaEvent(baseline, next)
            : next;
          if (sendEvent(event)) {
            baseline = next;
            lastKey = key;
            lastHeartbeatAt=now;
          }
        }
        if(realtime&&now-lastHeartbeatAt>=1000){sendEvent({type:'heartbeat'});lastHeartbeatAt=now;}
      } catch (error) {
        if(activeSubscription!==subscriptionId||socket.readyState!==socket.OPEN)return;
        const details = errorDetails(error);
        sendEvent({type: 'error', ...details.body});
        if (details.status === 401 || details.status === 403 || details.status === 404) socket.close(1008, 'Subscription denied');
      }
    };
    const publication=createPublicationLoop({publish:sendSnapshot,
      interval:()=>realtime&&baseline?.snapshot?.player?.combat?100:pollIntervalMs,
      onError:()=>socket.close(1011,'Publication failed')});

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (!message || message.type !== 'subscribe' ||
          (message.realtime !== undefined && typeof message.realtime !== 'boolean') ||
          (message.mode !== undefined && message.mode !== 'snapshot' && message.mode !== 'delta') ||
          (message.characterId !== undefined && (typeof message.characterId !== 'string' || !message.characterId || message.characterId.length > 200)) ||
          (message.revision !== undefined && (!Number.isSafeInteger(message.revision) || message.revision < 0)) ||
          (message.sequence !== undefined && (!Number.isSafeInteger(message.sequence) || message.sequence < 0))) {
          throw new Error('Invalid subscription');
        }
        selectedCharacter = message.characterId;
        deliveryMode = message.mode ?? 'snapshot';
        realtime=message.realtime===true;lastFullAt=0;
        subscriptionId++;
        lastKey = '';
        baseline = null;
        publication.request();
      } catch {
        sendEvent({type: 'error', error: '订阅请求无效', code: 'INVALID_SUBSCRIPTION'});
        socket.close(1008, 'Invalid subscription');
      }
    });
    socket.once('close', () => publication.close());
  });

  return {
    server,
    webSocketServer,
    async close() {
      for (const socket of webSocketServer.clients) socket.close(1001, 'Server shutting down');
      webSocketServer.close();
      await closeHttp(server);
    },
  };
}
