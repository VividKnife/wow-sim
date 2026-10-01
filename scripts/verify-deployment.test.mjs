import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDeployment, waitForDeployment} from './verify-deployment.mjs';

const origin = 'https://game.test';
const expected = {commit: 'source', buildId: 'build', assetMode: 'r2', publicAssetVersion: 'public',
  assetBase: 'https://cdn.test/web/build/', publicAssetBase: 'https://cdn.test/public/public'};
function fixture(overrides = {}, metadata = expected) {
  const responses = {
    [origin + '/__deployment.json']: [JSON.stringify(metadata)],
    [origin + '/login']: [`<div id="root"></div><script src="${metadata.assetBase}assets/app.js"></script>`],
    [origin + '/api/health']: [JSON.stringify({ready:true,deployment:{commit:metadata.commit,buildId:metadata.buildId}})],
    [origin + '/api/auth/session']: [JSON.stringify({error: 'Login required'}), {status: 401}],
    [metadata.assetBase + '__release.json']: [JSON.stringify(metadata)],
    [metadata.publicAssetBase + '/__release.json']: [JSON.stringify({version: metadata.publicAssetVersion})],
    ...overrides,
  };
  return async (url, options) => {
    if (options.method === 'HEAD' && !Object.hasOwn(overrides, url.href)) return new Response(null, {
      headers: {'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : 'image/svg+xml', 'access-control-allow-origin': origin},
    });
    assert.ok(responses[url.href], `Unexpected request: ${url}`);
    return new Response(...responses[url.href]);
  };
}

test('verifies deployed artifact, API and CDN without authenticated writes', async () => {
  await checkDeployment(origin, expected, {fetchImpl: fixture()});
});

test('rejects a previous build of the same source commit', async () => {
  await assert.rejects(checkDeployment(origin, expected, {fetchImpl: fixture({
    [origin + '/__deployment.json']: [JSON.stringify({...expected, buildId: 'old-build'})],
  })}), /buildId/);
});

test('rejects unhealthy API, incorrect HTML build, missing CORS and incomplete CDN releases', async () => {
  for (const overrides of [
    {[origin + '/api/auth/session']: ['unavailable', {status: 502}]},
    {[origin + '/login']: ['<div id="root"></div><script src="https://cdn.test/web/old/app.js"></script>']},
    {[expected.assetBase + 'assets/app.js']: [null, {headers: {'content-type': 'text/javascript'}}]},
    {[expected.assetBase + '__release.json']: [JSON.stringify({...expected, buildId: 'old'})]},
    {[expected.publicAssetBase + '/__release.json']: ['missing', {status: 404}]},
  ]) await assert.rejects(checkDeployment(origin, expected, {fetchImpl: fixture(overrides)}));
});

test('supports bundled deployment without R2 release markers', async () => {
  const bundled = {...expected, assetMode: 'bundled', assetBase: '/', publicAssetBase: ''};
  await checkDeployment(origin, bundled, {fetchImpl: fixture({}, bundled)});
});

test('waits through old versions and temporary outages', async () => {
  let time = 0, attempts = 0;
  const result = await waitForDeployment({origin, expected, timeoutMs: 100, intervalMs: 10,
    now: () => time, pause: async ms => {time += ms;}, log: () => {},
    check: async () => {if (++attempts < 3) throw new Error('Still deploying');},
  });
  assert.equal(result, 'verified');
  assert.equal(attempts, 3);
});

test('fails when the release never arrives', async () => {
  let time = 0;
  await assert.rejects(waitForDeployment({origin, expected, timeoutMs: 20, intervalMs: 10,
    now: () => time, pause: async ms => {time += ms;}, log: () => {},
    check: async () => {throw new Error('Old build');},
  }), /did not become ready.*Old build/);
});

test('hands verification to a newer push instead of timing out the old run', async () => {
  assert.equal(await waitForDeployment({origin, expected, currentSource: async () => 'new-source',
    check: () => assert.fail('Superseded builds should not be checked'), log: () => {},
  }), 'superseded');
});

test('rejects a healthy API running a different deployment',async()=>{
 await assert.rejects(checkDeployment(origin,expected,{fetchImpl:fixture({[origin+'/api/health']:[JSON.stringify({ready:true,deployment:{commit:expected.commit,buildId:'old'}})]})}),/runtime buildId/);
});
test('does not declare a web-only deployment ready when simulation is unavailable',async()=>{
 await assert.rejects(checkDeployment(origin,expected,{fetchImpl:fixture({[origin+'/api/health']:[JSON.stringify({ready:false}),{status:503}]})}),/503/);
});
