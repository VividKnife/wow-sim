import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';
import {sellBatch,auctionSellBatch,marketPrice,storageAction} from '../../../packages/game-domain/src/rules/inventory.js';

function fixture(){
 const s=createGame('批量交易',283,0);s.location='stormwind';
 addItem(s,2589,10);addItem(s,769,5);addItem(s,35);
 const selected=s.bag.filter(i=>[2589,769].includes(i.id));
 return {s,selected,uids:selected.map(i=>i.uid)};
}

test('merchant batch sale pays for selected whole stacks and preserves other inventory',()=>{
 const {s,selected,uids}=fixture(),before=structuredClone(s);
 const result=act(s,{type:'sellBatch',uids},0);
 assert.equal(result.money-before.money,selected.reduce((n,i)=>n+items[i.id].SellPrice*i.count,0));
 assert.deepEqual(result.bag,before.bag.filter(i=>!uids.includes(i.uid)));
 assert.deepEqual(s,before);
});

test('auction batch keeps item identity and enchants, deducts fees per listing, and settles once',()=>{
 const {s,selected,uids}=fixture();selected[0].enchant='mana';
 const result=act(s,{type:'auctionSellBatch',uids},0);
 assert.deepEqual(result.auctions.map(a=>a.item),selected);
 const expected=selected.reduce((n,i)=>n+Math.floor(marketPrice(i.id).sell*i.count*.95),0);
 assert.equal(result.auctions.reduce((n,a)=>n+a.net,0),expected);
 assert.equal(result.money,s.money);
 const settled=advance(result,30000).state;
 assert.equal(settled.money,s.money+expected);assert.equal(settled.auctions.length,0);
 assert.equal(advance(settled,60000).state.money,settled.money);
});

test('batch validation rejects empty, malformed, duplicate and stale selections without mutation',()=>{
 for(const trade of [sellBatch,auctionSellBatch]){
  const {s,uids}=fixture();
  for(const selection of [undefined,[],uids[0],[null],[uids[0],uids[0]],[uids[0],'missing']]){
   const before=structuredClone(s);assert.throws(()=>trade(s,selection));assert.deepEqual(s,before);
  }
 }
});

test('protected items reject the entire merchant or auction batch',()=>{
 for(const trade of [sellBatch,auctionSellBatch]){
  for(const protection of ['locked','issued']){
   const {s,selected,uids}=fixture();selected[1][protection]=true;
   const before=structuredClone(s);assert.throws(()=>trade(s,uids));assert.deepEqual(s,before);
  }
  const {s,uids}=fixture();addItem(s,7207);uids.push(s.bag.find(i=>i.id===7207).uid);
  const before=structuredClone(s);assert.throws(()=>trade(s,uids));assert.deepEqual(s,before);
 }
 const {s,selected,uids}=fixture();selected[1].bound=true;
 const before=structuredClone(s);assert.throws(()=>auctionSellBatch(s,uids));assert.deepEqual(s,before);
 assert.doesNotThrow(()=>sellBatch(s,uids));
});

test('auction batch and quick listing preflight the entire capacity limit',()=>{
 const {s,uids}=fixture();s.auctions=Array.from({length:99},(_,n)=>({id:'existing'+n}));
 const before=structuredClone(s);
 assert.throws(()=>auctionSellBatch(s,uids),/100/);assert.deepEqual(s,before);
 assert.throws(()=>storageAction(s,{type:'auctionSellAll'}),/100/);assert.deepEqual(s,before);
 auctionSellBatch(s,[uids[0]]);assert.equal(s.auctions.length,100);
});

test('batch commands enforce merchant availability and activity restrictions',()=>{
 const {s,uids}=fixture();s.location='northwood';
 assert.throws(()=>act(s,{type:'sellBatch',uids},0),/附近没有商人/);
 s.location='stormwind';s.activity={type:'travel',from:'northshire',to:'stormwind',startedAt:0,endsAt:10000,path:[]};
 for(const type of ['sellBatch','auctionSellBatch'])assert.throws(()=>act(s,{type,uids},0),/结束当前活动/);
 s.activity={type:'idle'};s.dungeon={};
 for(const type of ['sellBatch','auctionSellBatch'])assert.throws(()=>act(s,{type,uids},0),/离开副本/);
});
