import test from 'node:test';
import assert from 'node:assert/strict';
import {assetRedirect} from '../lib/static-assets.mjs';
const version='a'.repeat(40), origin='https://wow-sim.dota.run';
const redirect=(path,overrides={})=>assetRedirect({url:`https://wow-sim.zeabur.app${path}`,method:'GET',origin,version,assetMode:'r2',...overrides});
test('R2 only receives versioned public assets; API, cookies and worker paths stay local',()=>{
  for(const path of ['/creatures/wolf.glb','/sounds/hit.ogg','/icons/a%20b.png','/scenes/elwynn.webp','/favicon.svg']) {
    assert.equal(redirect(path),`${origin}/public/${version}${path}`);
    assert.equal(redirect(path,{method:'HEAD'}),`${origin}/public/${version}${path}`);
  }
  assert.equal(redirect('/maps/world.webp?v=2'),`${origin}/public/${version}/maps/world.webp?v=2`);
  for(const path of ['/','/login','/api/auth/login','/api/game','/_next/static/worker.js','/model-viewer/index.html','/model-viewer/bridge.js','/model-viewer/asset-cache-sw.js','/__deployment.json','/.env','/maps/../api/game','/maps/%2e%2e%2fapi/game'])assert.equal(redirect(path),null,path);
  assert.equal(redirect('/maps/a.webp',{method:'POST'}),null);
});
test('invalid or looping configuration cannot redirect',()=>{
  for(const origin of ['',undefined,'garbage','http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com?q=x','https://example.com#x','https://wow-sim.zeabur.app'])assert.equal(redirect('/maps/a.webp',{origin}),null);
  for(const version of ['',undefined,'latest','../other'])assert.equal(redirect('/maps/a.webp',{version}),null);
});
test('bundled and local builds serve local assets even when R2 origin remains configured',()=>{
  for (const assetMode of ['bundled', undefined, 'invalid']) {
    assert.equal(redirect('/maps/a.webp', {assetMode}), null);
  }
});
