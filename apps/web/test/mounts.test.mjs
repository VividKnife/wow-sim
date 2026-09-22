import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {route,baseTravelSpeed,travelSpeedMultiplier,monsterIdsAt} from '../../../packages/game-domain/src/rules/catalog.js';
import {journeyPosition} from '../../../packages/game-domain/src/rules/navigation.js';
import {startCombat,hurtPlayer} from '../../../packages/game-domain/src/rules/combat.js';
import {mountView} from '../../../packages/game-domain/src/rules/mounts.js';

const command=(s,a)=>act(s,a,s.wallAt);
const finish=s=>advance(s,s.wallAt+s.activity.endsAt-s.clock).state;
function buyer(level=20){const s=createGame('骑乘测试',37,0);s.level=level;s.location='logging';s.money=20000000;return s;}
function owner(level=20,id=5656){let s=command(buyer(level),{type:'trainRiding'});return command(s,{type:'buyMount',id});}
function rider(level=20,id=5656){return finish(command(owner(level,id),{type:'mount',id}));}

test('a mounted traveler can turn around mid-road without remounting or losing its speed',()=>{
 let s=rider();s.location='northshire';s=command(s,{type:'travel',to:'goldshire'});
 const elapsed=10000;s=advance(s,s.wallAt+elapsed).state;const mounted=s.mounted;
 s=command(s,{type:'travel',to:'northshire'});
 assert.equal(s.mounted,mounted);assert.ok(Math.abs(s.activity.endsAt-s.clock-elapsed)<=1);
 s=finish(s);assert.equal(s.location,'northshire');assert.equal(s.mounted,mounted);
});

test('new characters expose a locked collection without granting riding or mounts',()=>{
 const s=createGame('新存档',37,0);s.level=19;
 const copy=JSON.stringify(s),d=view(s);
 assert.equal(d.mounts.trained,false);assert.equal(d.mounts.collection.length,6);
 assert.ok(d.mounts.collection.every(m=>!m.owned&&!m.canBuy&&!m.canMount));
 assert.equal(JSON.stringify(s),copy);
 const restored=advance(s,0).state;assert.deepEqual(restored.mounts,[]);assert.deepEqual(restored.riding,{});assert.equal(restored.mounted,null);
 for(const type of ['trainRiding','buyMount','mount'])assert.throws(()=>command(s,{type,id:5656}),/20/);
});

test('training and purchasing require local service, eligibility, funds and no duplicate charges',()=>{
 let s=buyer();s.location='northshire';assert.throws(()=>command(s,{type:'trainRiding'}),/东谷/);
 s.location='logging';s.money=199999;assert.throws(()=>command(s,{type:'trainRiding'}),/不足/);
 s.money=1000000;s=command(s,{type:'trainRiding'});assert.equal(s.money,800000);
 assert.throws(()=>command(s,{type:'trainRiding'}),/已经/);
 s=command(s,{type:'buyMount',id:5656});assert.equal(s.money,0);assert.ok(s.mounts.includes(5656));
 assert.throws(()=>command(s,{type:'buyMount',id:5656}),/已经/);
 assert.throws(()=>command(s,{type:'buyMount',id:999999}),/坐骑/);
 assert.throws(()=>command(s,{type:'buyMount',id:2414}),/不足/);
 assert.throws(()=>command(s,{type:'mount',id:2414}),/拥有/);
});

test('other Alliance races need exalted reputation; Horde cannot learn horse riding',()=>{
 const s=buyer();s.raceId=3;assert.throws(()=>command(s,{type:'trainRiding'}),/崇拜/);
 s.reputation[72]=42000;const trained=command(s,{type:'trainRiding'});assert.equal(trained.money,19820000);
 const purchased=command(trained,{type:'buyMount',id:5656});assert.equal(purchased.money,19100000);
 s.raceId=2;assert.throws(()=>command(s,{type:'trainRiding'}),/联盟/);
});

test('summon takes three seconds and can be cancelled or restored without duplicate mounts',()=>{
 let s=command(owner(),{type:'mount',id:5656});assert.equal(s.activity.type,'mount');assert.equal(s.mounted,null);
 assert.equal(s.activity.endsAt-s.clock,3000);
 const before=advance(s,2999).state;assert.equal(before.mounted,null);
 s=advance(before,3000).state;assert.equal(s.mounted,5656);assert.equal(s.activity.type,'idle');
 assert.deepEqual(advance(JSON.parse(JSON.stringify(before)),3000).state,s);
 s=command(s,{type:'dismount'});assert.equal(s.mounted,null);
 s=command(s,{type:'mount',id:5656});s=command(s,{type:'stop'});s=advance(s,7000).state;
 assert.equal(s.mounted,null);assert.equal(s.mounts.length,1);
});

test('epic mounts require level sixty and reuse horse riding training',()=>{
 assert.throws(()=>command(owner(),{type:'buyMount',id:18777}),/60/);
 let s=owner(60);const gold=s.money;s=command(s,{type:'buyMount',id:18777});assert.equal(s.money,gold-10000000);
 s=finish(command(s,{type:'mount',id:18777}));assert.equal(view(s).mounts.speedBonus,100);
 s.location='northshire';const trip=command(s,{type:'travel',to:'goldshire'});assert.equal(trip.activity.endsAt-trip.clock,Math.ceil(route('northshire','goldshire').path[0].distance/(baseTravelSpeed*2)*1000));
});

test('mounting rejects combat, indoor locations, death, forms, escort and active travel',()=>{
 const base=owner();
 for(const changes of [{combat:{enemies:[]}},{location:'fargodeep'},{location:'bluerecluse'},{hp:0},{form:'bear'},{escort:{}},{dungeon:{}},{activity:{type:'travel',endsAt:50000}}]){
  const s={...base,...changes};assert.throws(()=>command(s,{type:'mount',id:5656}));assert.equal(mountView(s).collection.find(m=>m.id===5656).canMount,false);
 }
});

test('ground trip, map and quest estimates agree; travel cannot be shortened by mount toggles',()=>{
 let s=rider();s.location='northshire';const estimate=view(s).map.find(n=>n.id==='goldshire').travel;
 s=command(s,{type:'travel',to:'goldshire'});assert.equal(s.activity.endsAt-s.clock,estimate);
 assert.equal(estimate,Math.ceil(route('northshire','goldshire').path[0].distance/(baseTravelSpeed*1.6)*1000));
 assert.throws(()=>command(s,{type:'dismount'}),/旅行|活动/);
 const halfway={...s,clock:s.clock+(s.activity.endsAt-s.clock)/2};assert.ok(Math.abs(journeyPosition(halfway).progress-.5)<.001);
 const restored=finish(JSON.parse(JSON.stringify(s)));assert.equal(restored.location,'goldshire');assert.equal(restored.mounted,5656);
 s=command(restored,{type:'accept',id:62});const nav=view(s).quests.find(q=>q.id===62).navigation;
 s=command(s,{type:'navigateQuest',id:62});assert.equal(s.activity.endsAt-s.clock,nav.duration);
 assert.equal(finish(s).mounted,null);
});

test('restricted legs remove riding speed and keep later legs on foot; tram gets the global travel boost',()=>{
 let s=rider();s.location='dwarven';s=command(s,{type:'travel',to:'thelsamar'});
 assert.equal(s.activity.path[0].duration,Math.ceil(180000/travelSpeedMultiplier));
 assert.equal(s.activity.endsAt-s.clock,route('dwarven','thelsamar').duration);
 assert.equal(s.mounted,null);
 assert.equal(finish(s).mounted,null);
});

test('flight and combat remove mount without losing ownership',()=>{
 let s=rider();s.location='stormwind';s.flightPoints=['stormwind','sentinel'];const gold=s.money;
 s=command(s,{type:'fly',to:'sentinel'});assert.equal(s.mounted,null);assert.equal(s.activity.endsAt-s.clock,Math.ceil(78000/travelSpeedMultiplier));assert.equal(s.money,gold-110);
 s=rider();startCombat(s,[monsterIdsAt(s.location)[0]]);assert.equal(s.mounted,null);assert.ok(s.mounts.includes(5656));
});

test('casting utility spells, gathering and resting automatically dismount',()=>{
 let s=rider();s.location='goldshire';s=command(s,{type:'useHearth'});assert.equal(s.mounted,null);
 s=rider();s.learned.push(587);s=command(s,{type:'conjure',water:false});assert.equal(s.mounted,null);
 s=rider();s=command(s,{type:'rest'});assert.equal(s.mounted,null);
});

test('damage cancels a summon and death removes an active mount',()=>{
 let s=command(owner(),{type:'mount',id:5656});
 hurtPlayer(s,{id:'test-enemy',name:'敌人'},s,1,'伤害',{periodic:true});
 assert.equal(s.activity.type,'idle');assert.equal(advance(s,3000).state.mounted,null);
 s=rider();hurtPlayer(s,{id:'test-enemy',name:'敌人'},s,100000,'伤害',{periodic:true});assert.equal(s.mounted,null);
});

test('mixed riding and tram trips dismount at the same instant across save/advance partitions',()=>{
 let s=rider();s.location='northshire';s=command(s,{type:'travel',to:'thelsamar'});
 const path=s.activity.path,index=path.findIndex(leg=>!leg.riding);
 assert.ok(index>0);const boundary=Math.ceil(path.slice(0,index).reduce((sum,leg)=>sum+leg.duration,0))+s.clock;
 assert.equal(advance(s,boundary-1).state.mounted,5656);
 const split=advance(advance(s,boundary+1).state,s.activity.endsAt).state;
 const single=advance(s,s.activity.endsAt).state;
 assert.deepEqual(split,single);assert.equal(single.logs.find(l=>l.text.startsWith('收起坐骑')).at,boundary);
});
