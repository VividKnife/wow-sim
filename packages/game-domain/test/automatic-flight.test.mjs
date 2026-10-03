import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../src/rules/engine.js';
import {flights} from '../src/rules/catalog.js';
import {automaticTravelRoute,travelRoute,boostMount} from '../src/rules/mounts.js';
import {movementMultiplier} from '../src/rules/experience.js';

const flight=flights.find(f=>f.a==='stormwind'&&f.b==='sentinel'||f.b==='stormwind'&&f.a==='sentinel');
function ready(raceId=1){
 const s=createGame('自动飞行',11,0,{raceId,classId:1});
 Object.assign(s,{location:'stormwind',flightPoints:['stormwind','sentinel'],money:flight.cost+100});
 return s;
}
for(const raceId of [1,2])test('ordinary travel automatically flies for race '+raceId,()=>{
 const s=ready(raceId),duration=Math.ceil(flight.duration/movementMultiplier(s));
 assert.equal(view(s).map.find(n=>n.id==='sentinel').travel,duration);
 assert.equal(view(s).city.departures.find(n=>n.to==='sentinel').travel,duration);
 const moving=act(s,{type:'travel',to:'sentinel'},0);
 assert.equal(moving.activity.flight,true);
 assert.equal(moving.activity.endsAt,duration);
 assert.equal(moving.money,100);
 assert.throws(()=>act(moving,{type:'travel',to:'goldshire'},0),/飞行途中/);
 const arrived=advance(JSON.parse(JSON.stringify(moving)),duration).state;
 assert.equal(arrived.location,'sentinel');
 assert.equal(arrived.activity.type,'idle');
 assert.equal(arrived.money,100);
});
test('locked flights, missing routes, and insufficient funds retain ground travel',()=>{
 for(const changes of [{flightPoints:['stormwind']},{money:flight.cost-1}]){
  const s=Object.assign(ready(),changes),moving=act(s,{type:'travel',to:'sentinel'},0);
  assert.ok(!moving.activity.flight);
  assert.equal(moving.activity.endsAt,travelRoute(s,'sentinel').duration);
  assert.equal(moving.money,s.money);
 }
 assert.ok(!automaticTravelRoute(ready(),'goldshire').flight);
});
test('automatic flight takes precedence over summoning a mount and dismounts existing riders',()=>{
 for(const mounted of [null,boostMount.id]){
  const s=Object.assign(ready(),{level:60,mounts:[boostMount.id],riding:{horse:true},mounted});
  const moving=act(s,{type:'travel',to:'sentinel',quest:123},0);
  assert.equal(moving.activity.type,'travel');
  assert.equal(moving.activity.flight,true);
  assert.equal(moving.activity.quest,123);
  assert.equal(moving.mounted,null);
 }
});

test('passing two unlocked flight points flies between them and resumes ground travel',()=>{
 const s=Object.assign(ready(2),{location:'magetower'});
 const plan=automaticTravelRoute(s,'moonbrook');
 assert.deepEqual(plan.path.map(e=>!!e.flight),[false,true,false]);
 let moving=act(s,{type:'travel',to:'moonbrook',quest:123},0);
 const takeoff=Math.ceil(plan.path[0].duration),landing=Math.ceil(plan.path[0].duration+plan.path[1].duration);
 assert.equal(moving.activity.flight,false);
 assert.equal(moving.money,s.money);
 assert.equal(moving.activity.endsAt,plan.duration);
 moving=advance(moving,takeoff-1).state;
 assert.equal(moving.activity.flight,false);
 moving=advance(moving,takeoff).state;
 assert.equal(moving.activity.flight,true);
 assert.equal(moving.money,100);
 assert.equal(view(moving).journey.from,'stormwind');
 assert.equal(view(moving).journey.to,'sentinel');
 moving=advance(JSON.parse(JSON.stringify(moving)),landing).state;
 assert.equal(moving.activity.flight,false);
 assert.equal(moving.money,100);
 assert.equal(view(moving).journey.from,'sentinel');
 assert.equal(moving.activity.quest,123);
 const arrived=advance(moving,plan.duration).state;
 assert.equal(arrived.location,'moonbrook');
 assert.equal(arrived.activity.type,'idle');
 const offline=advance(act(s,{type:'travel',to:'moonbrook'},0),plan.duration).state;
 assert.equal(offline.location,'moonbrook');
 assert.equal(offline.money,100);
});
test('stopping a mixed flight lands at the current flight endpoint and drops the remaining route',()=>{
 const s=Object.assign(ready(),{location:'magetower'});
 let moving=act(s,{type:'travel',to:'moonbrook'},0);
 const takeoff=Math.ceil(moving.activity.path[0].duration);
 moving=act(moving,{type:'stop'},takeoff);
 assert.equal(moving.activity.to,'sentinel');
 assert.equal(moving.activity.path.length,2);
 const arrived=advance(moving,moving.activity.endsAt).state;
 assert.equal(arrived.location,'sentinel');
 assert.equal(arrived.activity.type,'idle');
 assert.equal(arrived.money,100);
});
test('redirecting on the ground replans flights without paying for abandoned future legs',()=>{
 const s=Object.assign(ready(),{location:'magetower'});
 let moving=act(s,{type:'travel',to:'moonbrook'},0);
 moving=act(moving,{type:'travel',to:'magetower'},1000);
 assert.ok(moving.activity.path.every(e=>!e.flight));
 const returned=advance(moving,moving.activity.endsAt).state;
 assert.equal(returned.location,'magetower');
 assert.equal(returned.money,s.money);
 let redirected=act(s,{type:'travel',to:'goldshire'},0);
 redirected=act(redirected,{type:'travel',to:'moonbrook'},1000);
 assert.ok(redirected.activity.path.some(e=>e.flight));
 const arrived=advance(redirected,redirected.activity.endsAt).state;
 assert.equal(arrived.location,'moonbrook');
 assert.equal(arrived.money,100);
});

test('Crossroads and Ratchet fly in either direction when both flight points are unlocked',()=>{
 for(const raceId of [1,2])for(const [from,to] of [['crossroads','ratchet'],['ratchet','crossroads']]){
  const s=createGame('贫瘠之地航线',11,0,{raceId,classId:1});
  Object.assign(s,{location:from,flightPoints:[from,to],money:10000});
  const moving=act(s,{type:'travel',to},0);
  assert.equal(moving.activity.flight,true,from+' -> '+to);
  assert.equal(moving.activity.path.length,1);
  assert.ok(moving.money<s.money);
  const arrived=advance(moving,moving.activity.endsAt).state;
  assert.equal(arrived.location,to);
 }
});
