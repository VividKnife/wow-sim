import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../lib/game/engine.js';
import {addItem,countItem,stats} from '../lib/game/character.js';

const fresh=()=>{const s=createGame('生活技能',37,0);s.level=20;s.learned.push(5504,5505,587,3561,1459);s.mana=stats(s).maxMana;return s;};
const command=(s,a)=>act(s,a,s.wallAt);
const wait=(s,ms)=>advance(s,s.wallAt+ms,{dungeonOnline:true,maxTicks:50000}).state;
const item=(s,id)=>s.bag.find(i=>i.id===id);

test('spellbook casts the selected conjuration rank, completing only after its cast',()=>{
 let s=fresh();const before=countItem(s,5350);s=command(s,{type:'cast',id:5504});
 assert.equal(s.activity.startedAt,0);assert.equal(s.activity.endsAt,3000);assert.equal(s.activity.spell,5504);
 assert.equal(countItem(wait(s,2999),5350),before);
 s=wait(s,3000);assert.equal(countItem(s,5350),before+20);assert.equal(s.activity.type,'idle');
 s=command(s,{type:'cast',id:587});s=command(s,{type:'stop'});s=wait(s,4000);assert.equal(countItem(s,5349),0);
});

test('teleport consumes its reagent on completion, changes location, and preserves hearth cooldown',()=>{
 let s=fresh();addItem(s,17031,2);s.hearthReady=12345;
 s=command(s,{type:'cast',id:3561});assert.equal(s.activity.endsAt,10000);assert.equal(countItem(s,17031),2);
 const partial=wait(s,5000);assert.equal(partial.location,'northshire');
 const cancelled=wait(command(partial,{type:'stop'}),6000);assert.equal(cancelled.location,'northshire');assert.equal(countItem(cancelled,17031),2);
 s=wait(JSON.parse(JSON.stringify(s)),10000);assert.equal(s.location,'stormwind');assert.equal(countItem(s,17031),1);assert.equal(s.hearthReady,12345);
});

test('unavailable utility casts expose reasons and reject without consuming mana',()=>{
 const s=fresh(),mana=s.mana;
 assert.match(view(s).skillUses[3561].reason,/材料/);
 assert.throws(()=>command(s,{type:'cast',id:3561}),/材料/);assert.equal(s.mana,mana);
 s.learned=s.learned.filter(id=>id!==587);assert.throws(()=>command(s,{type:'cast',id:587}),/学习/);
 s.mana=0;assert.equal(view(s).skillUses[5504].canUse,false);assert.throws(()=>command(s,{type:'cast',id:5504}),/法力/);
});

test('conjuring into a full bag is rejected before spending mana',()=>{
 const s=fresh();while(s.bag.length<16)addItem(s,6477);const mana=s.mana;
 assert.throws(()=>command(s,{type:'cast',id:587}),/背包/);assert.equal(s.mana,mana);
});

test('backpack hearthstone uses the existing timed return and cooldown',()=>{
 let s=fresh();s.location='goldshire';const uid=item(s,6948).uid;
 assert.equal(view(s).itemUses[uid].canUse,true);
 s=command(s,{type:'useItem',uid});assert.equal(s.activity.type,'hearth');assert.equal(s.activity.endsAt,10000);
 s=wait(s,10000);assert.equal(s.location,'northshire');assert.equal(countItem(s,6948),1);assert.equal(s.hearthReady,3610000);
});

test('manual potions consume exactly the selected stack and share automatic potion cooldown',()=>{
 let s=fresh();s.hp=1;addItem(s,118,2);const uid=item(s,118).uid;
 s=command(s,{type:'useItem',uid});assert.ok(s.hp>=71&&s.hp<=91);assert.equal(item(s,118).count,1);assert.equal(s.potionReady,120000);
 assert.match(view(s).itemUses[uid].reason,/冷却/);assert.throws(()=>command(s,{type:'useItem',uid}),/冷却/);
});

test('stat elixirs affect stats, refresh without stacking, and expire',()=>{
 let s=fresh();addItem(s,2454,2);const base=stats(s).str,uid=item(s,2454).uid;
 s=command(s,{type:'useItem',uid});assert.equal(stats(s).str,base+4);
 s=wait(s,3000);s=command(s,{type:'useItem',uid});assert.equal(stats(s).str,base+4);assert.equal(countItem(s,2454),0);
 s=wait(s,3600000);assert.equal(stats(s).str,base);
});

test('common stat elixirs apply their sourced bonuses and enforce their shared cooldown',()=>{
 for(const [id,key,amount] of [[2457,'agi',4],[2458,'maxHp',27],[3383,'int',6],[3389,'armor',150],[3390,'agi',8],[3391,'str',8]]){
  let s=fresh();const base=stats(s)[key];addItem(s,id,2);const uid=item(s,id).uid;
  assert.equal(view(s).itemUses[uid]?.canUse,true,String(id));s=command(s,{type:'useItem',uid});assert.equal(stats(s)[key],base+amount);
  assert.throws(()=>command(s,{type:'useItem',uid}),/冷却/);
 }
});

test('scroll ranks replace the same buff family and cannot overwrite a stronger rank',()=>{
 let s=fresh();const base=stats(s).sta;addItem(s,1180,2);addItem(s,1711,1);
 s=command(s,{type:'useItem',uid:item(s,1180).uid});s=wait(s,3000);
 s=command(s,{type:'useItem',uid:item(s,1711).uid});assert.equal(stats(s).sta,base+8);
 s=wait(s,3000);assert.throws(()=>command(s,{type:'useItem',uid:item(s,1180).uid}),/更强/);assert.equal(stats(s).sta,base+8);
});

test('selected food and water recover over time and can be cancelled',()=>{
 let s=fresh();s.hp=1;s.mana=0;addItem(s,117,2);addItem(s,159,2);
 const before=countItem(s,117);s=command(s,{type:'useItem',uid:item(s,117).uid});
 assert.equal(countItem(s,117),before-1);assert.equal(s.hp,1);assert.ok(s.rest.food>0);
 s=command(s,{type:'useItem',uid:item(s,159).uid});assert.ok(s.rest.food>0&&s.rest.water>0);
 s=wait(s,5000);assert.ok(s.hp>1);assert.ok(s.mana>0);
 s=command(s,{type:'stop'});assert.equal(s.rest,null);
});

test('item use rejects locked, missing, level-gated and busy uses',()=>{
 let s=fresh();addItem(s,118);const uid=item(s,118).uid;item(s,118).locked=true;
 assert.throws(()=>command(s,{type:'useItem',uid}),/锁定/);assert.equal(view(s).itemUses[uid].canUse,false);
 assert.throws(()=>command(s,{type:'useItem',uid:'missing'}),/物品/);
 addItem(s,2458);s.level=1;assert.throws(()=>command(s,{type:'useItem',uid:item(s,2458).uid}),/等级|支持/);
 item(s,118).locked=false;s.activity={type:'conjure',startedAt:0,endsAt:3000};
 assert.throws(()=>command(s,{type:'useItem',uid}),/活动/);
});
