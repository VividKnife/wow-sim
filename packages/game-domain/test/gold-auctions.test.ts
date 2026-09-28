import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {enterGoldRaid,goldRaidAction,openGoldAuctions,goldAuctionStep,goldRaidView,emergencyGoldExit,nextGoldAuctionAt} from '../src/rules/gold-raid.js';
import {npcBidValuation,npcAuctionLoadout,GOLD} from '../src/rules/gold-raid-npcs.js';
import {items} from '../src/rules/catalog.js';
import {advance} from '../src/rules/engine.js';
import {itemBis,characterBis} from '../src/rules/item-bis.js';
import type {Rules} from '../src/model.ts';
const base=createMoltenCoreDemo().state;base.party=[];base.growthPolicy='player';enterGoldRaid(base);
for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(base,{type});
function fixture(ids=[19147,18814]){
 const s=structuredClone(base);s.money=1000*GOLD;
 openGoldAuctions(s,ids.map((itemId,i)=>({id:`parallel-${i}`,bossId:'lucifron',itemId,count:1,rare:false})));
 return s;
}
const assets=(s:Rules)=>s.money+s.party.reduce((n:number,c:Rules)=>n+c.money,0)+s.goldRaid.pot+s.goldRaid.auctions.reduce((n:number,a:Rules)=>n+a.price,0);
test('parallel bids escrow independently and refund all open lots on emergency exit',()=>{
 const s=fixture(),before=assets(s),cash=s.money;
 for(const a of s.goldRaid.auctions)goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:20*GOLD,recipient:s.id});
 assert.equal(s.money,cash-40*GOLD);assert.equal(assets(s),before);
 assert.equal(goldRaidView(s).auctions.filter((a:Rules)=>a.leader==='player').length,2);
 emergencyGoldExit(s);assert.equal(s.money,cash);assert.equal(s.goldRaid.auctions.length,0);
});
test('per-lot caps persist, reject invalid bids and cannot erase escrow',()=>{
 const s=fixture(),a=s.goldRaid.auctions[0];
 for(const amount of [0,-1,NaN,Infinity,1.5,'100'])assert.throws(()=>goldRaidAction(s,{type:'goldBidLimit',lotId:a.id,amount}));
 goldRaidAction(s,{type:'goldBidLimit',lotId:a.id,amount:15*GOLD});
 const reloaded=JSON.parse(JSON.stringify(s));assert.equal(goldRaidView(reloaded).auctions[0].playerLimit,15*GOLD);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:20*GOLD,recipient:s.id}),/上限/);
 goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:15*GOLD,recipient:s.id});
 assert.throws(()=>goldRaidAction(s,{type:'goldBidLimit',lotId:a.id,amount:10*GOLD}),/托管/);
 assert.equal(s.goldRaid.auctions[1].playerLimit,null);
});
test('all due auctions advance and settle from game time, with conserved funds and one delivery each',()=>{
 let s=fixture();const total=assets(s),clock=s.clock;
 for(const a of s.goldRaid.auctions){a.limits={};goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:10*GOLD,recipient:s.id});}
 assert.equal(nextGoldAuctionAt(s),clock+4000);
 s=advance(s,s.wallAt+12001).state;
 assert.equal(s.goldRaid.auctions.length,0);assert.equal(s.goldRaid.sales.length,2);assert.equal(s.pending.length,2);assert.equal(assets(s),total);
 const again=advance(s,s.wallAt+12001).state;assert.equal(again.goldRaid.sales.length,2);assert.equal(again.pending.length,2);
});
test('passing and stale quotes do not advance or reset another player response window',()=>{
 const s=fixture(),a=s.goldRaid.auctions[0],end=a.endsAt,next=a.nextRoundAt;
 goldRaidAction(s,{type:'goldPass',lotId:a.id});assert.equal(a.playerPassed,true);assert.equal(a.round,0);assert.equal(a.endsAt,end);
 goldRaidAction(s,{type:'goldPass',lotId:a.id});assert.equal(a.playerPassed,false);
 a.price=15*GOLD;a.leader=s.party[0].id;
 const before=s.money;s.clock+=1000;
 goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:10*GOLD,quotedMinimum:10*GOLD,recipient:s.id});
 assert.equal(s.money,before);assert.equal(a.endsAt,end);assert.equal(a.nextRoundAt,next);assert.match(a.bidNotice,/未扣款/);
});
test('impulsive NPCs still reject downgrades, duplicates and wrong role gear',()=>{
 const s=fixture(),c=s.party.find((c:Rules)=>c.classId===8);c.goldProfile.personality='impulsive';c.money=5000*GOLD;
 c.equipment={8:{id:16800}};
 assert.equal(npcBidValuation(c,items[16800],false,s).limit,0);
 assert.equal(npcBidValuation(c,items[16866],false,s).limit,0);
 c.equipment={};c.raidPendingEquipment=[{id:18820,count:1}];
 assert.equal(npcBidValuation(c,items[18820],false,s).limit,0);
});
test('NPCs account for other escrowed equipment and never mutate their combat loadout',()=>{
 const s=fixture([18820,18820]),c=s.party.find((c:Rules)=>c.classId===8);c.equipment={};c.money=5000*GOLD;
 const before=JSON.stringify(c);s.goldRaid.auctions[0].leader=c.id;
 assert.equal(npcBidValuation(c,items[18820],false,s,{lotId:'parallel-1'}).limit,0);
 assert.equal(JSON.stringify(c),before);assert.ok(Object.values(npcAuctionLoadout(c,s,'parallel-1').equipment).some((i:any)=>i.id===18820));
});
test('current-phase BIS raises bounded valuation only for matching specs, and material budgets reserve supplies',()=>{
 const s=fixture(),c=s.party.find((c:Rules)=>c.classId===8);c.equipment={};c.money=5000*GOLD;c.goldProfile.personality='collector';
 s.goldRaid.bisPhase=1;const p1=npcBidValuation(c,items[17103],false,s);assert.equal(p1.bis,true);
 s.goldRaid.bisPhase=6;const p6=npcBidValuation(c,items[17103],false,s);assert.equal(p6.bis,false);assert.ok(p1.limit>p6.limit);
 c.money=11*GOLD;assert.ok(npcBidValuation(c,items[17010],false,s).limit<=1*GOLD);
 assert.equal(characterBis({...c,classId:1,strategyPolicy:{role:'tank'}},17103,1).length,0);
 assert.ok(itemBis(18814).some((e:Rules)=>e.spec==='paladin-holy'));
});
test('concurrent NPC auctions respect wallet and updated gear throughout settlement',()=>{
 const s=fixture([18820,18820,17103,16800,18814]);const total=assets(s);
 for(let rounds=0;rounds<500&&s.goldRaid.auctions.length;rounds++){
  const lot=s.goldRaid.auctions[0];goldAuctionStep(s,lot.id);
  assert.equal(assets(s),total);assert.ok(s.party.every((c:Rules)=>c.money>=0));
 }
 assert.equal(s.goldRaid.auctions.length,0);assert.equal(s.goldRaid.sales.length,5);
 const uniqueWinners=s.goldRaid.sales.filter((a:Rules)=>a.itemId===18820&&a.winnerId).map((a:Rules)=>a.winnerId);
 assert.equal(new Set(uniqueWinners).size,uniqueWinners.length);
 assert.ok(!JSON.stringify(goldRaidView(s)).includes('variations'));
});
