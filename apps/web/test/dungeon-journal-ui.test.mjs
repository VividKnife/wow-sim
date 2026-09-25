import test from 'node:test';
import assert from 'node:assert/strict';
import {filterJournal, journalSelection, journalLevelStatus} from '../lib/dungeon-journal.js';

const journal=[{id:'deadmines',name:'死亡矿井',zone:'西部荒野',playable:true,bosses:[{id:'vc',name:'范克里夫'}]},{id:'stockades',name:'暴风城监狱',zone:'暴风城',playable:true,bosses:[{id:'bazil',name:'巴基尔'}]},{id:'brd',name:'黑石深渊',zone:'黑石山',playable:false,bosses:[]}];
test('level eligibility does not advertise locked content or confuse entry level with recommended level',()=>{
 const dungeon={playable:true,minimumLevel:10,recommendedLevel:18};
 assert.deepEqual(journalLevelStatus(dungeon,9),{label:'10 级可进入',eligible:false});
 assert.deepEqual(journalLevelStatus(dungeon,10),{label:'等级符合',eligible:true});
 assert.equal(journalLevelStatus({...dungeon,playable:false},60).eligible,false);
 assert.equal(journalLevelStatus({...dungeon,playable:false},60).label,'尚未开放');
});
test('journal searches dungeon, zone and boss names and preserves the complete catalog for an empty query',()=>{
 assert.equal(filterJournal(journal,'  ').length,3);
 assert.deepEqual(filterJournal(journal,'范克里夫').map(x=>x.id),['deadmines']);
 assert.deepEqual(filterJournal(journal,'暴风城').map(x=>x.id),['stockades']);
 assert.deepEqual(filterJournal(journal,'未知'),[]);
});
test('browsing never switches an active expedition and info-only dungeons have no entry controls',()=>{
 const active={id:'deadmines',active:true};
 const data={dungeonJournal:journal,dungeon:active,dungeons:{deadmines:active,stockades:{id:'stockades',active:false}}};
 const stockades=journalSelection(data,'stockades','missing');
 assert.equal(stockades.entry,null);assert.equal(stockades.boss.id,'bazil');assert.equal(stockades.expedition,active);
 assert.equal(journalSelection({...data,dungeon:{active:false}},'brd').entry,null);
 assert.equal(journalSelection({...data,dungeon:{active:false}},'stockades').entry.id,'stockades');
 assert.equal(journalSelection(data,null).selected,null);
});

test('loot hides shared pools by default and paginates search results without dropping unique items',async()=>{
 const {journalLootPage}=await import('../lib/dungeon-journal.js');
 const loot=Array.from({length:76},(_,id)=>({id,name:`战利品 ${id}`,shared:id>=65}));
 const first=journalLootPage(loot);assert.equal(first.total,65);assert.equal(first.items.length,30);assert.equal(first.pages,3);assert.equal(first.hiddenShared,11);
 const last=journalLootPage(loot,{page:99});assert.equal(last.page,3);assert.equal(last.items.length,5);
 const all=journalLootPage(loot,{includeShared:true,page:3});assert.equal(all.items.length,16);assert.equal(all.total,76);
 const search=journalLootPage(loot,{includeShared:true,query:'  战利品 75  ',page:3});assert.deepEqual(search.items.map(i=>i.id),[75]);assert.equal(search.page,1);
 const none=journalLootPage(loot,{query:'不存在'});assert.equal(none.total,0);assert.equal(none.page,1);assert.equal(none.pages,1);
});
