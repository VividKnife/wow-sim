import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

// Read-only production smoke test. No accounts, saves or gameplay are created.
export async function checkDeployment(origin, expected, {fetchImpl = fetch, signal} = {}) {
  const request = async (url, status = 200, options = {}) => {
    const response = await fetchImpl(new URL(url, origin), {
      signal, redirect: 'error', headers: {'cache-control': 'no-cache', origin}, ...options,
    });
    assert.equal(response.status, status, `${url}: expected HTTP ${status}, got ${response.status}`);
    return response;
  };
  const metadata = await (await request('/__deployment.json')).json();
  for (const key of ['commit', 'buildId', 'assetMode', 'publicAssetVersion', 'assetBase', 'publicAssetBase']) {
    assert.equal(metadata[key], expected[key], `Deployed ${key} does not match CI artifact`);
  }
  const html = await (await request('/login')).text();
  assert.ok(html.includes('id="root"'), 'Login page is not the application shell');
  const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => match[1]).filter(url => /\.(?:js|css)(?:\?|$)/.test(url));
  assert.ok(resources.some(url => /\.js(?:\?|$)/.test(url)), 'Missing application module');
  if (expected.assetMode === 'r2') assert.ok(resources.every(url => url.startsWith(expected.assetBase)), 'HTML uses a different CDN build');
  resources.push(expected.publicAssetBase + '/favicon.svg');
  for (const resource of resources) {
    const response = await request(resource, 200, {method: 'HEAD'});
    const type = response.headers.get('content-type') || '';
    assert.match(type, /javascript|text\/css|image\/svg\+xml/, `Invalid asset content type: ${resource}`);
    if (new URL(resource, origin).origin !== origin) {
      assert.ok([origin, '*'].includes(response.headers.get('access-control-allow-origin')), `Missing CDN CORS: ${resource}`);
    }
  }
  const session = await (await request('/api/auth/session', 401)).json();
  assert.equal(typeof session.error, 'string', 'API must return the unauthenticated session response');
  if (expected.assetMode === 'r2') {
    const web = await (await request(expected.assetBase + '__release.json')).json();
    assert.equal(web.buildId, expected.buildId, 'CDN web release does not match');
    assert.equal(web.commit, expected.commit, 'CDN source does not match');
    const assets = await (await request(expected.publicAssetBase + '/__release.json')).json();
    assert.equal(assets.version, expected.publicAssetVersion, 'CDN public release does not match');
  }
}

export async function waitForDeployment({origin, expected, timeoutMs = 20 * 60_000, intervalMs = 15_000,
  currentSource, check = checkDeployment, now = Date.now, pause = sleep, log = console.log}) {
  assert.ok(expected.commit && expected.buildId, 'Expected CI build metadata is required');
  const deadline = now() + timeoutMs;
  let lastError;
  while (now() < deadline) {
    // A later push owns the release; an obsolete run must not report a timeout.
    if (currentSource && await currentSource() !== expected.commit) {
      log('Superseded by a newer main commit; its workflow owns deployment verification.');
      return 'superseded';
    }
    try {
      await check(origin, expected, {signal: AbortSignal.timeout(Math.min(30_000, Math.max(1, deadline - now())))});
      log(`Deployment verified: ${expected.commit} / ${expected.buildId}`);
      return 'verified';
    } catch (error) {
      lastError = error;
      log(`Waiting for deployment: ${error.message}`);
    }
    await pause(Math.max(0, Math.min(intervalMs, deadline - now())));
  }
  throw new Error(`Deployment did not become ready within ${timeoutMs / 60_000} minutes: ${lastError?.message}`, {cause: lastError});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = new URL(process.env.DEPLOYMENT_ORIGIN || 'https://wow-sim.zeabur.app').origin;
  const expected = JSON.parse(await readFile('apps/web/dist/__deployment.json', 'utf8'));
  let result = 'failed';
  try {
    result = await waitForDeployment({origin, expected, currentSource: () => {
      const head = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {encoding: 'utf8', timeout: 15_000}).trim().split(/\s/)[0];
      assert.match(head, /^[a-f0-9]{40}$/, 'Cannot determine current main commit');
      return head;
    }});
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `### Production deployment: ${result}\n\nSource: \`${expected.commit}\`\n\nBuild: \`${expected.buildId}\`\n\nSite: ${origin}\n\nChecks: Web build identity, login shell, API session endpoint, static assets and R2 release markers. This does not attest the worker version or authenticated gameplay.\n`);
  }
}
