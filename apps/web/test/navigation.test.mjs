import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../lib/game/engine.js';
import {questNavigation,journeyPosition} from '../lib/game/navigation.js';
import {nodes} from '../lib/game/catalog.js';
import {mapPoints,mapRegion,mapRegions,playerMapPoint} from '../lib/world-map.js';

test('quest navigation travels to an unfinished exploration objective, then its turn-in',()=>{
 let s=createGame('导航',11,0);s.level=4;s.location='goldshire';s=act(s,{type:'accept',id:62},0);
 assert.equal(view(s).quests.find(q=>q.id===62).navigation?.to,'fargodeep');
 s=act(s,{type:'navigateQuest',id:62},0);
 assert.equal(s.activity.type,'travel');assert.equal(s.activity.to,'fargodeep');assert.ok(s.activity.endsAt>0);
 s=advance(s,s.activity.endsAt).state;
 assert.equal(s.location,'fargodeep');assert.equal(s.activity.type,'idle');
 assert.equal(view(s).quests.find(q=>q.id===62).navigation.to,'goldshire');
 s=act(s,{type:'navigateQuest',id:62},s.wallAt);assert.equal(s.activity.to,'goldshire');
});

test('navigation rejects inactive quests and cannot interrupt travel or combat',()=>{
 let s=createGame('导航',11,0);s.level=4;s.location='goldshire';
 assert.throws(()=>act(s,{type:'navigateQuest',id:62},0),/任务/);
 s=act(s,{type:'accept',id:62},0);s=act(s,{type:'navigateQuest',id:62},0);
 assert.throws(()=>act(s,{type:'navigateQuest',id:62},0),/活动/);
 s.activity={type:'idle'};s.combat={enemies:[]};
 assert.throws(()=>act(s,{type:'navigateQuest',id:62},0),/活动/);
});

test('map identifies every flight point and reflects discovery without unlocking it remotely',()=>{
 const s=createGame('地图',11,0);s.flightPoints=['stormwind'];const d=view(s);
 assert.deepEqual(d.map.filter(n=>n.hasFlight).map(n=>n.id).sort(),['sentinel','stormwind']);
 assert.equal(d.map.find(n=>n.id==='stormwind').flightUnlocked,true);
 assert.equal(d.map.find(n=>n.id==='sentinel').flightUnlocked,false);
 assert.throws(()=>act(s,{type:'unlockFlight'},0),/飞行管理员/);
});

test('partial tasks skip completed objectives and choose the nearest remaining source',()=>{
 const s=createGame('导航',11,0);
 const q={active:true,complete:false,endLocations:['northshire'],objectives:[
  {kind:'kill',count:5,required:5,locations:['northshire']},
  {kind:'item',count:0,required:1,locations:['sentinel','goldshire']},
 ]};
 assert.equal(questNavigation(s,q).to,'goldshire');
 s.location='goldshire';assert.equal(questNavigation(s,q).here,true);
 q.objectives[1].locations=[];assert.equal(questNavigation(s,q),null);
});

test('rift navigation first collects its tools, then directs the player to the inn',()=>{
 let s=createGame('导航',11,0);s.level=20;s.location='magetower';s=act(s,{type:'accept',id:1920},0);
 assert.equal(view(s).quests.find(q=>q.id===1920).navigation.here,true);
 for(const id of [105174,105175]){s=act(s,{type:'gather',id},s.wallAt);s=advance(s,s.wallAt+s.activity.endsAt-s.clock).state;}
 assert.equal(view(s).quests.find(q=>q.id===1920).navigation.to,'bluerecluse');
});

test('every playable node can be placed on its region map',()=>{
 for(const n of Object.values(nodes)){
  assert.ok(mapRegions[mapRegion(n.region)],n.id);
  assert.ok(mapPoints[n.id]?.every(v=>Number.isFinite(v)&&v>0&&v<100),n.id);
 }
});

test('player marker follows timed road legs and returns to the destination after arrival',()=>{
 let s=createGame('地图',11,0);s=act(s,{type:'travel',to:'echo'},0);
 // First leg northshire -> northwood, halfway through its own travel cost.
 const leg=s.activity.path[0];s.clock=leg.distance/7*1000/2;
 const journey=journeyPosition(s);assert.equal(journey.from,'northshire');assert.equal(journey.to,'northwood');
 assert.ok(Math.abs(journey.progress-.5)<.001);
 const player=playerMapPoint(journey,Object.values(nodes));
 assert.equal(player.region,'艾尔文');assert.ok(Math.abs(player.x-48.5)<.001);assert.ok(Math.abs(player.y-38)<.001);
 s.clock=0;s=advance(s,s.activity.endsAt).state;
 assert.deepEqual(journeyPosition(s),{from:'echo',to:'echo',progress:0});
});

test('cross-region flight shows transit at departure map until actual arrival',()=>{
 let s=createGame('地图',11,0);s.location='stormwind';s.flightPoints=['stormwind','sentinel'];s.money=200;
 s=act(s,{type:'fly',to:'sentinel'},0);s.clock=39000;
 const p=playerMapPoint(journeyPosition(s),Object.values(nodes));
 assert.equal(p.region,'暴风城');assert.equal(p.crossing,true);assert.equal(p.x,57);
 s.clock=0;s=advance(s,78000).state;assert.equal(s.location,'sentinel');assert.equal(s.money,90);
 assert.equal(playerMapPoint(journeyPosition(s),Object.values(nodes)).region,'西部荒野');
});
