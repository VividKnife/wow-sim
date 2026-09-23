import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheableRequest,createAssetCache} from '../public/model-viewer/asset-cache.js';
const request=id=>new Request('https://game.test/api/model-viewer/m2/'+id+'.m2');
const response=(text='model')=>new Response(text,{headers:{'Cache-Control':'public, max-age=86400'}});
function storage(){
 const values=new Map();
 return {open:async()=>({match:async key=>values.get(key.url)?.clone(),keys:async()=>[...values.keys()].map(url=>new Request(url)),delete:async key=>values.delete(key.url),put:async(key,value)=>values.set(key.url,value.clone())})};
}
test('viewer cache excludes cross origin, saves, mutations and arbitrary query strings',()=>{
 assert.equal(cacheableRequest(request(1),'https://game.test'),true);
 for(const url of ['https://other.test/api/model-viewer/m2/1.m2','https://game.test/api/game','https://game.test/api/model-viewer/m2/1.m2?url=x'])assert.equal(cacheableRequest(new Request(url),'https://game.test'),false);
 assert.equal(cacheableRequest(new Request(request(1),{method:'POST'}),'https://game.test'),false);
});
test('assets persist across cache clients and expire according to response freshness',async()=>{
 let time=1;const disk=storage();
 await createAssetCache(disk,{now:()=>time}).put(request(1),response());
 const next=createAssetCache(disk,{now:()=>time});
 assert.equal(await (await next.match(request(1))).text(),'model');
 time+=86400001;assert.equal(await next.match(request(1)),undefined);
});
test('failed and partial appearance responses remain uncached',async()=>{
 const cache=createAssetCache(storage());
 await cache.put(request(1),new Response('error',{status:502,headers:{'Cache-Control':'public, max-age=60'}}));
 await cache.put(request(2),new Response('partial',{headers:{'Cache-Control':'no-store'}}));
 assert.equal(await cache.match(request(1)),undefined);assert.equal(await cache.match(request(2)),undefined);
});
test('concurrent writes evict oldest entries to respect byte and entry budgets',async()=>{
 const cache=createAssetCache(storage(),{maxBytes:10,maxEntries:2});
 await Promise.all([1,2,3].map(id=>cache.put(request(id),response())));
 assert.equal(await cache.match(request(1)),undefined);
 assert.ok(await cache.match(request(2)));assert.ok(await cache.match(request(3)));
 await cache.put(request(4),response('too large for budget'));
 assert.equal(await cache.match(request(4)),undefined);
});
test('storage denial does not break model loading',async()=>{
 const cache=createAssetCache({open:async()=>{throw new Error('QuotaExceededError');}});
 await cache.put(request(1),response());assert.equal(await cache.match(request(1)),undefined);
});
