// Isolated integration check: builds must already exist. Never uses the user's DB.
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import WebSocket from 'ws';
import {applyGameEvent} from '../packages/contracts/src/events.ts';

const name = `wow-sim-check-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
const children = [],network=`${name}-network`,runtimeImage=process.env.RUNTIME_IMAGE;
let pool,created=false,networkCreated=false;
function docker(args) {
  const result = spawnSync('docker', args, {encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(`Docker operation ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}
async function port() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function ready(check, label) {
  for (let n = 0; n < 80; n++) {
    try { if (await check()) return; } catch {}
    await delay(500);
  }
  throw new Error(`${label} did not become ready`);
}
function start(args, env, cwd = process.cwd(),executable=process.execPath) {
  const child = spawn(executable, args, {cwd, env: {...process.env, ...env}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  children.push(child);
  child.on('exit', code => { if (code && !child.killed && !child.expectedExit) console.error(`Child exited ${code}: ${output.replaceAll(password, '[redacted]').replaceAll(secret, '[redacted]')}`); });
  return child;
}

try {
  docker(['network','create',network]);networkCreated=true;
  docker(['run', '--rm', '-d', '--name', name,'--network',network, '--tmpfs', '/var/lib/postgresql/data',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=wow_sim', '-p', '127.0.0.1::5432', 'postgres:17']);
  created = true;
  const dbPort = docker(['port', name, '5432/tcp']).split(':').at(-1);
  const database = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/wow_sim`;
  pool = new pg.Pool({connectionString: database,options:'-c search_path=wow_sim_v2'});
  await ready(() => pool.query('SELECT 1'), 'PostgreSQL');
  await pool.query('CREATE TABLE public.wallets (marker text PRIMARY KEY)');
  await pool.query("INSERT INTO public.wallets VALUES ('previous-release-preserved')");
  const apiPort = await port(), webPort = await port(),simulationPort=await port();
  const origin = `http://127.0.0.1:${webPort}`;
  const env = {NODE_ENV: 'production', DATABASE_URL: database,GAME_DATABASE_SCHEMA:'wow_sim_v2',
    GAME_SERVER_URL: `http://127.0.0.1:${apiPort}`, APP_ORIGIN: origin,SIMULATION_PORT:String(simulationPort),SIMULATION_TOKEN:secret,SIMULATION_URL:`http://127.0.0.1:${simulationPort}`};
  const gameEnvironment={...env,HOST:'127.0.0.1',PORT:String(apiPort),SERVICE_ROLE:'game'};
  const startRuntime=()=>{
    if(!runtimeImage)return start(['scripts/start-runtime.mjs'],gameEnvironment);
    const containerEnv={...gameEnvironment,HOST:'0.0.0.0',DATABASE_URL:`postgresql://postgres:${password}@${name}:5432/wow_sim`};
    return start(['run','--rm','--name',`${name}-runtime`,'--network',network,'-p',`127.0.0.1:${apiPort}:${apiPort}`,...Object.keys(containerEnv).flatMap(key=>['-e',key]),runtimeImage],containerEnv,process.cwd(),'docker');
  };
  let runtime=startRuntime();
  start(['scripts/start-runtime.mjs'], {...env, SERVICE_ROLE: 'worker'});
  start(['server.mjs'], {...env, PORT: String(webPort)}, `${process.cwd()}/apps/web`);
  await ready(async () => (await fetch(`${env.GAME_SERVER_URL}/api/health`)).ok, 'API');
  await ready(async () => (await fetch(`${origin}/login`)).ok, 'Web');
  const request = (path, {method = 'GET', body, cookie, requestOrigin = origin, headers = {}} = {}) => fetch(`${origin}${path}`, {
    method, headers: {origin: requestOrigin, 'x-forwarded-for': '127.0.0.1', ...(body ? {'content-type': 'application/json'} : {}), ...(cookie ? {cookie} : {}), ...headers},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const credentials = {username: 'deploy_check', password: 'test-password-for-deployment-123'};
  assert.equal((await request('/api/game?saveId=invalid', {headers: {'oai-authenticated-user-id': 'forged', 'oai-authenticated-user-email': 'fake@example.com'}})).status, 401);
  assert.equal((await request('/api/auth/register', {method: 'POST', body: credentials, requestOrigin: 'https://evil.example'})).status, 403);
  const registration = await request('/api/auth/register', {method: 'POST', body: credentials});
  assert.equal(registration.status, 200, await registration.text());
  const setCookie = registration.headers.get('set-cookie');
  assert.match(setCookie, /httponly/i); assert.match(setCookie, /secure/i); assert.match(setCookie, /samesite=lax/i);
  const cookie = setCookie.split(';')[0];
  const creation = await request('/api/saves', {method: 'POST', cookie, body: {name: '部署验证', classId: 1, raceId: 1, requestId: randomUUID()}});
  assert.equal(creation.status, 201, await creation.clone().text());
  const save = await creation.json();
  assert.ok(save.id);
  const gamePath = `/api/game?saveId=${encodeURIComponent(save.id)}`;
  const firstResponse = await request(gamePath, {cookie});
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.snapshot.player.name, '部署验证');
  const restore = await request(gamePath, {cookie});
  assert.equal(restore.status, 200);
  const saved = await restore.json();
  assert.equal(saved.snapshot.player.id, first.snapshot.player.id);
  assert.ok(saved.execution?.instanceId,'login must establish a resident owner');
  assert.equal(saved.combatMode,'realtime');
  const socket=new WebSocket(origin.replace('http:','ws:')+'/api/events'+new URL(gamePath,origin).search,{headers:{Origin:origin,Cookie:cookie}});
  let stream=null;
  let frameTimeout;
  const initialFrame=new Promise((resolve,reject)=>{
    frameTimeout=setTimeout(()=>reject(new Error('WebSocket initial baseline timed out')),10000);
    socket.on('error',reject);
    socket.on('message',raw=>{try{const event=JSON.parse(raw.toString());if(event.type==='heartbeat')return;stream=applyGameEvent(stream,event);resolve();}catch(error){reject(error);}});
  });
  try{
    await once(socket,'open');socket.send(JSON.stringify({type:'subscribe',characterId:saved.snapshot.player.id,mode:'delta',realtime:true}));
    await initialFrame;
    const settings=await request(gamePath,{method:'POST',cookie,body:{type:'settings',autoLoot:true,characterId:saved.snapshot.player.id,requestId:'deployment-settings',execution:{instanceId:saved.execution.instanceId,controllerGeneration:saved.execution.controllerGeneration,clientSequence:saved.execution.clientSequence+1}}});
    assert.equal(settings.status,200);const applied=await settings.json();
    assert.equal(applied.commandReceipt.status,'applied');assert.equal(applied.commandReceipt.durable,true);
    await ready(()=>stream?.snapshot?.player.settings.autoLoot===true,'WebSocket owner input');
  }finally{clearTimeout(frameTimeout);socket.close();await once(socket,'close');}
  const stopped=once(runtime,'exit');runtime.kill('SIGTERM');await stopped;
  assert.equal(runtime.exitCode,0,'combined runtime must seal checkpoints on SIGTERM');
  runtime=startRuntime();
  await ready(async()=> (await fetch(`${env.GAME_SERVER_URL}/api/health`)).ok,'restarted runtime');
  const recoveredResponse=await request(gamePath,{cookie});assert.equal(recoveredResponse.status,200);const recovered=await recoveredResponse.json();
  assert.equal(recovered.snapshot.player.settings.autoLoot,true);
  assert.equal(recovered.execution.instanceId,saved.execution.instanceId);
  assert.ok(recovered.execution.ownerEpoch>saved.execution.ownerEpoch);
  assert.deepEqual(recovered.snapshot.player.bag,saved.snapshot.player.bag);
  if(runtimeImage){
    runtime.expectedExit=true;const crashed=once(runtime,'exit');
    docker(['exec',`${name}-runtime`,'node','--input-type=module','-e',
      "import {readdirSync,readFileSync} from 'node:fs';for(const pid of readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){try{const args=readFileSync('/proc/'+pid+'/cmdline','utf8').split('\\0');if(args.some(arg=>arg.endsWith('/apps/simulation-host/src/main.ts'))){process.kill(Number(pid),'SIGKILL');process.exit(0);}}catch{}}process.exit(1);"]);
    await crashed;assert.equal(runtime.exitCode,1,'simulation crash must stop the API deployment unit');
    runtime=startRuntime();await ready(async()=> (await fetch(`${env.GAME_SERVER_URL}/api/health`)).ok,'fault recovery runtime');
    let afterCrash;
    await ready(async()=>{const response=await request(gamePath,{cookie});if(!response.ok)return false;afterCrash=await response.json();return true;},'durable lease expiry and recovery');
    assert.ok(afterCrash.execution.ownerEpoch>recovered.execution.ownerEpoch);
    assert.equal(afterCrash.snapshot.player.settings.autoLoot,true);
    assert.deepEqual(afterCrash.snapshot.player.bag,saved.snapshot.player.bag);
  }

  assert.equal((await request(gamePath, {method: 'POST', cookie, requestOrigin: 'https://evil.example', body: {type: 'advance'}})).status, 403);
  const other = await request('/api/auth/register', {method: 'POST', body: {...credentials, username: 'second_account'}});
  assert.equal(other.status, 200);
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  const isolated = await request('/api/saves', {cookie: otherCookie});
  assert.deepEqual((await isolated.json()).saves, []);
  assert.equal((await request(gamePath, {cookie: otherCookie})).status, 404);
  assert.equal((await request('/api/auth/logout', {method: 'POST', cookie})).status, 200);
  assert.equal((await request(gamePath, {cookie})).status, 401);
  const login = await request('/api/auth/login', {method: 'POST', body: credentials});
  assert.equal(login.status, 200);
  const restored = await request(gamePath, {cookie: login.headers.get('set-cookie').split(';')[0]});
  assert.equal((await restored.json()).snapshot.player.id, first.snapshot.player.id);
  assert.deepEqual((await pool.query('SELECT marker FROM public.wallets')).rows,[{marker:'previous-release-preserved'}]);
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema,'wow_sim_v2');
  console.log('Production integration passed: secure cookies, registration, login, CSRF, forged headers, resident creation, durable input, proxied WebSocket, graceful process restart/epoch recovery, persistence, account isolation and logout revocation.');
} finally {
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => child.exitCode !== null ? undefined : once(child, 'exit').catch(() => {})));
  if (pool) await pool.end();
  if (created) docker(['stop', name]);
  if(networkCreated)docker(['network','rm',network]);
}
