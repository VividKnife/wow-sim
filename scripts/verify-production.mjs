// Isolated integration check: builds must already exist. Never uses the user's DB.
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import pg from 'pg';

const name = `wow-sim-check-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
const children = [];
let pool, created = false;
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
function start(args, env, cwd = process.cwd()) {
  const child = spawn(process.execPath, args, {cwd, env: {...process.env, ...env}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  children.push(child);
  child.on('exit', code => { if (code && !child.killed) console.error(`Child exited ${code}: ${output.replaceAll(password, '[redacted]').replaceAll(secret, '[redacted]')}`); });
}

try {
  docker(['run', '--rm', '-d', '--name', name, '--tmpfs', '/var/lib/postgresql/data',
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_DB=wow_sim', '-p', '127.0.0.1::5432', 'postgres:17']);
  created = true;
  const dbPort = docker(['port', name, '5432/tcp']).split(':').at(-1);
  const database = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/wow_sim`;
  pool = new pg.Pool({connectionString: database});
  await ready(() => pool.query('SELECT 1'), 'PostgreSQL');
  const apiPort = await port(), webPort = await port();
  const origin = `http://127.0.0.1:${webPort}`;
  const env = {NODE_ENV: 'production', DATABASE_URL: database, GAME_SERVER_SECRET: secret,
    GAME_SERVER_URL: `http://127.0.0.1:${apiPort}`, APP_ORIGIN: origin};
  start(['scripts/start-runtime.mjs'], {...env, HOST: '127.0.0.1', PORT: String(apiPort), SERVICE_ROLE: 'api'});
  start(['scripts/start-runtime.mjs'], {...env, SERVICE_ROLE: 'worker'});
  start(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1'], {...env, PORT: String(webPort)}, `${process.cwd()}/apps/web`);
  await ready(async () => (await fetch(`${env.GAME_SERVER_URL}/content`)).ok, 'API');
  await ready(async () => (await fetch(`${origin}/login`)).ok, 'Web');
  const request = (path, {method = 'GET', body, cookie, requestOrigin = origin, headers = {}} = {}) => fetch(`${origin}${path}`, {
    method, headers: {origin: requestOrigin, ...(body ? {'content-type': 'application/json'} : {}), ...(cookie ? {cookie} : {}), ...headers},
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
  console.log('Production integration passed: secure cookies, registration, login, CSRF, forged headers, character creation, persistence, account isolation and logout revocation.');
} finally {
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(children.map(child => child.exitCode !== null ? undefined : once(child, 'exit').catch(() => {})));
  if (pool) await pool.end();
  if (created) docker(['stop', name]);
}
