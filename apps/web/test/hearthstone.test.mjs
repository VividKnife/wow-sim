import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../lib/game/engine.js';

const fresh=()=>createGame('炉石测试',17,0);
const command=(s,action)=>act(s,action,s.wallAt);
const finish=s=>advance(s,s.wallAt+s.activity.endsAt-s.clock,{dungeonOnline:true}).state;

test('binding is available at local inns, persists, and does not reset cooldown',()=>{
 let s=fresh();s.location='goldshire';s.hearthReady=30000;
 s=command(s,{type:'bindHearth'});
 assert.equal(s.hearth,'goldshire');assert.equal(s.hearthReady,30000);
 assert.equal(view(JSON.parse(JSON.stringify(s))).hearthstone.destinationName,'闪金镇');
 for(const location of ['stormwind','sentinel']){s.location=location;s=command(s,{type:'bindHearth'});assert.equal(s.hearth,location);}
 s.location='fargodeep';assert.throws(()=>command(s,{type:'bindHearth'}),/旅店/);
});

test('hearthstone casts for ten seconds then returns once and starts its hour cooldown',()=>{
 let s=fresh();s.location='goldshire';s=command(s,{type:'useHearth'});
 assert.equal(s.activity.type,'hearth');assert.equal(s.activity.endsAt-s.clock,10000);
 const before=advance(s,9999).state;assert.equal(before.location,'goldshire');assert.equal(before.hearthReady,0);
 s=advance(before,10000).state;assert.equal(s.location,'northshire');assert.equal(s.activity.type,'idle');
 assert.equal(s.hearthReady,3610000);assert.equal(s.bag.filter(i=>i.id===6948).length,1);
 s.location='goldshire';assert.throws(()=>command(s,{type:'useHearth'}),/冷却/);
 assert.equal(view(s).hearthstone.remaining,3600000);
 s.clock=s.hearthReady;s.nextTick=s.clock+100;s.nextRegen=s.clock+2000;
 assert.equal(command(s,{type:'useHearth'}).activity.type,'hearth');
});

test('cancelling or reloading a hearth cast preserves location and cooldown semantics',()=>{
 let s=fresh();s.location='goldshire';s=command(s,{type:'useHearth'});
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(finish(restored),finish(s));
 s=advance(s,4000).state;s=command(s,{type:'stop'});s=advance(s,11000).state;
 assert.equal(s.location,'goldshire');assert.equal(s.hearthReady,0);assert.equal(s.activity.type,'idle');
});

test('hearthstone rejects combat, death, travel, duplicate use and missing items',()=>{
 for(const action of ['bindHearth','useHearth']){
  let s=fresh();s.location='goldshire';s.combat={enemies:[]};assert.throws(()=>command(s,{type:action}),/活动/);
  s.combat=null;s.hp=0;assert.throws(()=>command(s,{type:action}),/死亡/);
  s.hp=10;s=command(s,{type:'travel',to:'sentinel'});assert.throws(()=>command(s,{type:action}),/活动/);
 }
 let s=fresh();s.location='goldshire';s=command(s,{type:'useHearth'});assert.throws(()=>command(s,{type:'useHearth'}),/活动/);
 s=fresh();s.location='goldshire';s.bag=s.bag.filter(i=>i.id!==6948);assert.throws(()=>command(s,{type:'useHearth'}),/炉石/);
 assert.equal(view(s).hearthstone.canUse,false);
});

test('using hearthstone exits a cleared dungeon safely and preserves its saved progress',()=>{
 let s=fresh();s.location='deadmines';s.dungeon={id:'deadmines',runId:'saved-run',cursor:3,defeated:{one:true},spawns:{}};
 s=command(s,{type:'useHearth'});assert.ok(s.dungeon);s=finish(s);
 assert.equal(s.location,'northshire');assert.equal(s.dungeon,undefined);assert.equal(s.dungeonSave.cursor,3);assert.equal(s.dungeonSave.defeated.one,true);
});

test('innkeepers replace a missing hearthstone only when there is bag space',()=>{
 let s=fresh();s.location='goldshire';s.bag=s.bag.filter(i=>i.id!==6948);s.hearthReady=90000;
 s=command(s,{type:'bindHearth'});assert.equal(s.bag.filter(i=>i.id===6948).length,1);assert.equal(s.hearthReady,90000);
 s=command(s,{type:'bindHearth'});assert.equal(s.bag.filter(i=>i.id===6948).length,1);
 s.hearth='northshire';s.bag=Array.from({length:16},(_,i)=>({uid:'full'+i,id:117,count:20}));
 assert.throws(()=>command(s,{type:'bindHearth'}),/背包空间/);assert.equal(s.hearth,'northshire');
});

test('cancelling a dungeon hearth leaves the run active and does not spend cooldown',()=>{
 let s=fresh();s.location='deadmines';s.dungeon={id:'deadmines',runId:'saved-run',cursor:3,defeated:{},spawns:{}};
 s=command(s,{type:'useHearth'});s=command(s,{type:'stop'});
 assert.equal(s.dungeon.runId,'saved-run');assert.equal(s.location,'deadmines');assert.equal(s.hearthReady,0);
});
