import test from 'node:test';
import assert from 'node:assert/strict';
import {assetRedirect} from '../lib/static-assets.mjs';
import {createReadinessCheck} from '../lib/r2-readiness.mjs';
const version='a'.repeat(40), origin='https://wow-sim.dota.run';
const redirect=(path,overrides={})=>assetRedirect({url:`https://wow-sim.zeabur.app${path}`,method:'GET',origin,version,...overrides});
test('R2 only receives versioned public assets; API, cookies and worker paths stay local',()=>{
  for(const path of ['/creatures/wolf.glb','/sounds/hit.ogg','/icons/a%20b.png','/scenes/elwynn.webp','/favicon.svg']) {
    assert.equal(redirect(path),`${origin}/public/${version}${path}`);
    assert.equal(redirect(path,{method:'HEAD'}),`${origin}/public/${version}${path}`);
  }
  assert.equal(redirect('/maps/world.webp?v=2'),`${origin}/public/${version}/maps/world.webp?v=2`);
  for(const path of ['/','/login','/api/auth/login','/api/game','/_next/static/worker.js','/model-viewer/index.html','/model-viewer/bridge.js','/model-viewer/asset-cache-sw.js','/__deployment.json','/.env','/maps/../api/game','/maps/%2e%2e%2fapi/game'])assert.equal(redirect(path),null,path);
  assert.equal(redirect('/maps/a.webp',{method:'POST'}),null);
});
test('disabled, invalid or looping configuration restores bundled assets',()=>{
  for(const origin of ['',undefined,'garbage','http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com?q=x','https://example.com#x','https://wow-sim.zeabur.app'])assert.equal(redirect('/maps/a.webp',{origin}),null);
  for(const version of ['',undefined,'latest','../other'])assert.equal(redirect('/maps/a.webp',{version}),null);
});
test('readiness deduplicates checks and falls back when the release is absent or unavailable',async()=>{
  let calls=0,clock=0, available=true;
  const ready=createReadinessCheck({now:()=>clock,fetcher:async()=>{calls++;return new Response(JSON.stringify({version,prefix:`public/${version}`,files:3}),{status:available?200:404});}});
  assert.deepEqual(await Promise.all([ready(origin,version),ready(origin,version)]),[true,true]);assert.equal(calls,1);
  available=false; clock=60_001;
  assert.equal(await ready(origin,version),false);assert.equal(calls,2);
  assert.equal(await createReadinessCheck({fetcher:async()=>{throw new Error('offline');}})(origin,version),false);
  assert.equal(await createReadinessCheck({fetcher:async()=>new Response(JSON.stringify({version:'wrong',files:1}))})(origin,version),false);
});
