import test from 'node:test';
import assert from 'node:assert/strict';
import {modelEquipment} from '../lib/model-viewer.js';
import {assetUrl,parseAppearance,parseItemIds,handleModelRequest} from '../lib/wowhead-model-assets.js';

test('viewer uses inventory slots for cloak and robe, and explicit weapon hands',()=>{
 const equipment={5:{id:56},15:{id:1270},16:{id:35},17:{id:15925},18:{id:5069}};
 const items={56:{slot:20},1270:{slot:16},35:{slot:17},15925:{slot:23},5069:{slot:26}};
 assert.deepEqual(modelEquipment(equipment,items),[{id:56,slot:20},{id:1270,slot:16},{id:35,slot:21},{id:15925,slot:22},{id:5069,slot:26}]);
});
test('invisible jewellery and absent item data do not become model attachments',()=>{
 assert.deepEqual(modelEquipment({2:{id:1},11:{id:2},13:{id:3},1:{id:4}}, {1:{slot:2},2:{slot:11},3:{slot:12}}),[]);
});
test('Wowhead appearance IDs are read from the matching item, without importing gameplay stats',()=>{
 assert.deepEqual(parseAppearance('<wowhead><item id="56"><icon displayId="10455">robe</icon><inventorySlot id="5">Chest</inventorySlot><jsonEquip>armor:999</jsonEquip></item></wowhead>',56),{id:56,displayId:10455});
 assert.throws(()=>parseAppearance('<item id="57"><icon displayId="10455"/></item>',56));
 assert.throws(()=>parseAppearance('<item id="56"><icon displayId="0"/></item>',56));
});
test('asset relay is restricted to Classic viewer files and numeric model resources',()=>{
 assert.equal(assetUrl('meta/armor/20/10455.json'),'https://wow.zamimg.com/modelviewer/classic/meta/armor/20/10455.json');
 assert.ok(assetUrl('textures/123.webp'));
 assert.ok(assetUrl('m2/119940.m2'));
 for(const path of ['../live/viewer/viewer.min.js','https://evil.test/a','meta/armor/5/1.json?url=https://evil.test','textures/%2e%2e/secret','viewer/other.js','meta/character/../../a.json'])assert.equal(assetUrl(path),null,path);
});
test('appearance batches are bounded, deduplicated and reject malformed identifiers',()=>{
 assert.deepEqual(parseItemIds('56,35,56'),[56,35]);
 for(const input of ['', '0', '-1', '56/path', '1.5', Array.from({length:20},(_,i)=>i+1).join(',')])assert.throws(()=>parseItemIds(input));
});

test('relay never forwards credentials, rejects arbitrary paths and keeps upstream failures uncached',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return new Response('missing',{status:404});});
 const bad=await handleModelRequest(new Request('https://game.test/api/model-viewer/textures/1.webp?url=https://other.test'));
 assert.equal(bad.status,404);assert.equal(calls.length,0);
 const response=await handleModelRequest(new Request('https://game.test/api/model-viewer/m2/119940.m2',{headers:{Cookie:'private=test',Authorization:'private'}}));
 assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(calls[0].url,'https://wow.zamimg.com/modelviewer/classic/m2/119940.m2');
 assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].options.redirect,'manual');
});

test('one unavailable appearance does not discard the other equipped items',async t=>{
 t.mock.method(globalThis,'fetch',async url=>url.includes('item=7509&')?new Response('<item id="7509"><icon displayId="12671">robe</icon></item>'):new Response('unavailable',{status:503}));
 const response=await handleModelRequest(new Request('https://game.test/api/model-viewer/appearance?items=7509,9513'));
 assert.deepEqual(await response.json(),{items:[{id:7509,displayId:12671},{id:9513,unavailable:true}]});
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('asset relay retries a transient network failure once',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{if(++calls===1)throw new TypeError('fetch failed');return new Response('{}');});
 const response=await handleModelRequest(new Request('https://game.test/api/model-viewer/meta/character/3.json'));
 assert.equal(response.status,200);assert.equal(calls,2);
});
