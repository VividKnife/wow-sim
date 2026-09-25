import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {clientContent} from '../../../packages/game-domain/src/rules/client-content.js';
import {contentPack} from '../../../packages/game-domain/src/rules/content-packs.js';
import {createGame,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {workshopView} from '../../../packages/game-domain/src/rules/workshop.js';
import {createContentLoader,referencedItemIds} from '../lib/content-loader.js';

const catalog=clientContent();
const query=pack=>new URLSearchParams({pack});
const size=value=>Buffer.byteLength(JSON.stringify(value));
test('bootstrap is bounded and never embeds item catalogs or boss loot',()=>{
 const core=contentPack(catalog,query('core'));
 assert.deepEqual(core.items,{});assert.deepEqual(core.market,[]);
 for(const dungeon of core.dungeonJournal)for(const boss of dungeon.bosses){
  assert.equal(boss.loot,undefined);
  assert.deepEqual(contentPack(catalog,query(boss.lootPack)).loot,catalog.dungeonJournal.find(d=>d.id===dungeon.id).bosses.find(b=>b.id===boss.id).loot);
 }
 assert.ok(size(core)<150_000,'bootstrap budget: 150 KB uncompressed');
 assert.ok(gzipSync(JSON.stringify(core)).length<40_000,'bootstrap budget: 40 KB gzip');
 const extra={...catalog,items:{...catalog.items,99999999:{description:'x'.repeat(1_000_000)}}};
 assert.deepEqual(contentPack(extra,query('core')),core,'unrelated content cannot inflate bootstrap');
});
test('item and market packs contain only their requested scope',()=>{
 const pack=contentPack(catalog,new URLSearchParams({pack:'items',ids:'118,6948,99999999'}));
 assert.deepEqual(Object.keys(pack.items).map(Number),[118,6948]);
 assert.deepEqual(pack.missing,[99999999]);
 const market=contentPack(catalog,query('market'));
 assert.deepEqual(Object.keys(market.items).map(Number).sort((a,b)=>a-b),[...new Set(market.market.map(row=>row.id))].sort((a,b)=>a-b));
 for(const ids of ['', '0','-1','1.5','118,x','9007199254740992',Array(201).fill('118').join(',')])assert.throws(()=>contentPack(catalog,new URLSearchParams({pack:'items',ids})),error=>error.status===400);
 for(const pack of ['all','boss:unknown:1','boss:stockades:1696:extra'])assert.throws(()=>contentPack(catalog,query(pack)),error=>error.status===404);
});
test('snapshot and workshop references hydrate equipment, inventory, rewards and recipe materials',async()=>{
 const state=createGame('加载测试',23,0);
 const snapshot=projectClientSnapshot(state,view(state));
 const original=view(state).quests;
 assert.deepEqual(snapshot.view.quests.map(q=>q.id),original.filter(q=>q.active||q.canAccept||q.canTurnIn).map(q=>q.id));
 assert.ok(snapshot.view.quests.length<original.length);
 const requests=[];
 const loader=createContentLoader(async url=>{
  const params=new URL(url,'http://local').searchParams;requests.push(params);
  return Response.json(contentPack(catalog,params));
 });
 const items=await loader.ensureItems(catalog.contentVersion,referencedItemIds(snapshot));
 for(const item of [...Object.values(state.equipment),...state.bag])assert.deepEqual(items[item.id],catalog.items[item.id]);
 for(const q of snapshot.view.quests)for(const reward of [...q.rewards,...q.choices])assert.ok(items[reward.id]);
 const workshop=workshopView(state,{profession:'alchemy'});
 const recipeItems=await loader.ensureItems(catalog.contentVersion,referencedItemIds(workshop.recipes));
 for(const r of workshop.recipes){assert.ok(recipeItems[r.item]);for(const material of [...r.materials,...r.tools])assert.ok(recipeItems[material.id]);}
 assert.ok(requests.every(params=>params.get('ids').split(',').length<=200));
 assert.ok(Object.keys(items).length<1000,'first view must not load all 9,000+ items');
});
test('quest projection keeps remote active quests and carried-item starters',()=>{
 const state=createGame('任务范围',24,0);
 const quests=[
  {id:1,active:true,canAccept:false,canTurnIn:false},
  {id:2,active:false,canAccept:true,canTurnIn:false},
  {id:3,active:false,canAccept:false,canTurnIn:true},
  {id:4,active:false,canAccept:false,canTurnIn:false},
 ];
 const snapshot=projectClientSnapshot(state,{quests});
 assert.deepEqual(snapshot.view.quests.map(q=>q.id),[1,2,3]);
 snapshot.view.quests[0].id=999;
 assert.equal(quests[0].id,1,'projected records must not mutate rule views');
});
test('overlapping requests coalesce, missing IDs are cached, and versions are isolated',async()=>{
 let calls=0;
 const loader=createContentLoader(async url=>{
  calls++;await new Promise(resolve=>setTimeout(resolve,5));
  const p=new URL(url,'http://local').searchParams;
  const data=contentPack(catalog,p);return Response.json({...data,contentVersion:p.get('version')});
 });
 const [a,b]=await Promise.all([loader.ensureItems('v1',[118,6948,99999999]),loader.ensureItems('v1',[118,6948])]);
 assert.ok(a[118]&&b[6948]);assert.equal(calls,1);
 await loader.ensureItems('v1',[118,99999999]);assert.equal(calls,1);
 await loader.ensureItems('v2',[118]);assert.equal(calls,2);
});
test('failed and incomplete responses can retry; stale versions are rejected',async()=>{
 for(const failure of ['network','incomplete','version']){
  let count=0;
  const loader=createContentLoader(async url=>{
   if(count++===0){
    if(failure==='network')throw new Error('offline');
    return Response.json({contentVersion:failure==='version'?'wrong':catalog.contentVersion,pack:'items',items:{},missing:[]});
   }
   return Response.json(contentPack(catalog,new URL(url,'http://local').searchParams));
  });
  await assert.rejects(loader.ensureItems(catalog.contentVersion,[118]));
  assert.ok((await loader.ensureItems(catalog.contentVersion,[118]))[118]);
 }
});
