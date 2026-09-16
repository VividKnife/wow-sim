import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../lib/game/engine.js';
import {addItem,countItem} from '../lib/game/character.js';

test('priority rules are editable, validated, and used by the next fight',()=>{
 let s=createGame('优先级',12,0);s=act(s,{type:'strategy',rules:[{spell:133,condition:'manaAbove',value:0,enabled:true}]},0);s=act(s,{type:'hunt',id:299},0);s=advance(s,200).state;assert.equal(s.cast.spell,133);
 assert.throws(()=>act(s,{type:'strategy',rules:[{spell:133,condition:'bad',value:0,enabled:true}]},200));
});
test('default and legacy strategies retain the now-supported Counterspell rule',()=>{
 let s=createGame('默认策略',12,0);
 s=act(s,{type:'strategy',rules:s.rules.map(r=>({...r,enabled:false}))},0);
 assert.ok(s.rules.every(r=>!r.enabled));
 s.rules.unshift({spell:2139,condition:'targetCasting',value:0,enabled:true});
 s=advance(s,100).state;
 assert.ok(s.rules.some(r=>r.spell===2139));
 assert.doesNotThrow(()=>act(s,{type:'strategy',rules:s.rules},100));
 assert.equal(view(s).skills.find(a=>a.spellId===168).nameEn,'Frost Armor');
});
test('Frost Armor spends mana, grants original armor, and expires with game time',()=>{
 let s=createGame('护甲',1,0);const armor=stats(s).armor;s=act(s,{type:'cast',id:168},0);assert.equal(s.mana,105);assert.equal(stats(s).armor,armor+30);s=advance(s,1800001).state;assert.equal(stats(s).armor,armor);
});
test('pending loot is transferred once after a backpack slot is freed',()=>{
 let s=createGame('背包',1,0);while(s.bag.length<16)addItem(s,35);addItem(s,159,30);const pending=s.pending.reduce((n,i)=>n+i.count,0);assert.ok(pending>0);s.bag.pop();s=act(s,{type:'loot'},0);const sum=countItem(s,159)+s.pending.filter(i=>i.id===159).reduce((n,i)=>n+i.count,0);s=act(s,{type:'loot'},0);assert.equal(countItem(s,159)+s.pending.filter(i=>i.id===159).reduce((n,i)=>n+i.count,0),sum);
});
test('equipping a bag expands actual capacity and consumes one bag item',()=>{
 let s=createGame('行囊',1,0);addItem(s,4496,1);const bag=s.bag.find(i=>i.id===4496);s=act(s,{type:'equipBag',uid:bag.uid},0);assert.equal(s.bags.length,1);assert.equal(countItem(s,4496),0);
});
test('server simulation rejects unbounded or NaN thresholds',()=>{
 const s=createGame('设置',1,0);assert.throws(()=>act(s,{type:'settings',health:NaN,mana:60},0));assert.throws(()=>act(s,{type:'settings',health:1000,mana:60},0));const a=act(s,{type:'settings',health:80,mana:50},0);assert.equal(a.settings.health,80);
});
test('a cloak occupies the back slot without displacing the main-hand staff',()=>{
 let s=createGame('装备槽',1,0);const staff=s.equipment[16].id;addItem(s,1270);s=act(s,{type:'equip',uid:s.bag.find(i=>i.id===1270).uid},0);assert.equal(s.equipment[16].id,staff);assert.equal(s.equipment[15].id,1270);
});
