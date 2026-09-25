import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../src/rules/engine.js';
import {makeItem} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';
import {receive} from '../src/rules/inventory.js';
import {lootRows} from '../src/rules/quests.js';

test('obsolete quest-bound loot can be discarded and stops dropping',()=>{
 let s:any=createGame('背包探针',13,0);
 const clam={item:15874,ChanceOrQuestChance:100,groupid:0,mincountOrRef:1,maxcount:1,condition_id:0};
 lootRows(s,[clam]);
 assert.equal(s.bag.some((i:any)=>i.id===15874),false);
 receive(s,15874,1);
 const uid=s.bag.find((i:any)=>i.id===15874)!.uid;
 s=act(s,{type:'discardItem',uid},s.wallAt);
 assert.equal(s.bag.some((i:any)=>i.id===15874),false);
 s.quests[6142]={kills:{},event:false,acceptedAt:0,expiresAt:0};
 lootRows(s,[clam]);
 assert.equal(s.bag.some((i:any)=>i.id===15874),true);
 assert.throws(()=>act(s,{type:'discardItem',uid:s.bag.find((i:any)=>i.id===15874)!.uid},s.wallAt),/正在进行的任务/);
});

test('discarding junk also clears ignored gray loot from pending corpses',()=>{
 let s:any=createGame('灰色战利品探针',17,0);
 const gray=Object.values(items).find((item:any)=>item.Quality===0&&item.class!==12&&item.SellPrice>0);
 assert.ok(gray);
 s.pending.push(makeItem(s,(gray as any).entry,1));
 s=act(s,{type:'discardJunk'},s.wallAt);
 assert.equal(s.pending.length,0);
});
