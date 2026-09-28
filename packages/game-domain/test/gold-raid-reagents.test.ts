import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {stockGoldReagents,goldReagentTargets} from '../src/rules/gold-raid-reagents.js';
import {buffReagents} from '../src/rules/group-buffs.js';
import {spellInfo} from '../src/rules/character.js';
import {usableCount,marketPrice} from '../src/rules/inventory.js';
import {beginPartyBuffs} from '../src/rules/party-buffs.js';
import type {Rules} from '../src/model.ts';
function fixture(){
 const s:Rules=createGame('备料',491,0);s.level=60;
 const c:Rules={...structuredClone(s),id:'priest',classId:5,npcPlayer:true,goldNpc:true,money:1000000,learned:[21562,21564,27681,27683],bag:[],bags:[],goldProfile:{consumableSpent:0,personality:'saver'}};
 s.party=[c];return {s,c};
}
test('gold priests bring ten full raid rounds, pay once, and consume real stock',()=>{
 const {s,c}=fixture(),leader=JSON.stringify(s.bag),money=s.money;
 stockGoldReagents(s,c);
 assert.equal(usableCount(c,17029),150);
 assert.equal(c.goldProfile.consumableSpent,150*marketPrice(17029)!.buy);
 assert.equal(c.money+c.goldProfile.consumableSpent,1000000);
 const wallet=c.money;stockGoldReagents(s,c);assert.equal(c.money,wallet);
 const sp=spellInfo(c,21564);assert.ok(buffReagents(c,sp,true));
 assert.equal(usableCount(c,17029),149);assert.equal(c.money,wallet);
 s.goldRaid={active:true,phase:'camp'};s.activity={type:'idle'};beginPartyBuffs(s);
 assert.equal(usableCount(c,17029),150);assert.equal(c.money,wallet-marketPrice(17029)!.buy);
 assert.equal(JSON.stringify(s.bag),leader);assert.equal(s.money,money);
});
test('paladins share one symbol stock across blessing choices; ordinary NPCs are untouched',()=>{
 const {s,c}=fixture();c.classId=2;c.learned=[25898,25782,25894,25895,25899,25890,19752];
 assert.equal(goldReagentTargets(c).get(21177),90);assert.equal(goldReagentTargets(c).get(17033),10);
 stockGoldReagents(s,c);assert.equal(usableCount(c,21177),90);assert.equal(usableCount(c,17033),10);
 c.goldNpc=false;c.bag=[];const money=c.money;stockGoldReagents(s,c);assert.deepEqual(c.bag,[]);assert.equal(c.money,money);
});
test('empty wallets and full bags cannot mint materials or spend below zero',()=>{
 const {s,c}=fixture();c.money=0;stockGoldReagents(s,c);
 assert.equal(usableCount(c,17029),0);assert.equal(buffReagents(c,spellInfo(c,21564)),false);
 c.money=1000000;c.bag=Array.from({length:16},()=>({id:6948,count:1}));stockGoldReagents(s,c);
 assert.equal(c.money,1000000);assert.equal(c.bag.length,16);assert.ok(s.logs.some((l:Rules)=>l.text?.includes('备料不足')||l.message?.includes('备料不足')));
});
