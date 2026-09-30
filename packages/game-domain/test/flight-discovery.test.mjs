import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance} from '../src/rules/engine.js';

function traveling(options={}){
 const s=createGame('鸟点',11,0,{raceId:2,classId:1});
 s.location='northshire';
 s.activity={type:'travel',from:'northshire',to:'sentinel',startedAt:0,endsAt:3000,path:[
  {a:'northshire',b:'stormwind',duration:1000},
  {a:'stormwind',b:'sentinel',duration:2000},
 ],...options};
 return s;
}
test('passing a flight point unlocks it at the boundary for either faction, before arrival',()=>{
 let s=advance(traveling(),999).state;
 assert.deepEqual(s.flightPoints,[]);
 s=advance(s,1000).state;
 assert.deepEqual(s.flightPoints,['stormwind']);
 assert.equal(s.location,'northshire');
 s=advance(JSON.parse(JSON.stringify(s)),3000).state;
 assert.deepEqual(s.flightPoints,['stormwind','sentinel']);
 assert.equal(s.location,'sentinel');
 assert.deepEqual(advance(s,4000).state.flightPoints,['stormwind','sentinel']);
});
test('offline travel discovers all completed waypoints',()=>{
 assert.deepEqual(advance(traveling(),4000).state.flightPoints,['stormwind','sentinel']);
});
test('a redirected partial leg does not discover its virtual origin',()=>{
 const s=traveling({from:'stormwind',path:[{a:'stormwind',b:'sentinel',duration:3000,startProgress:.5}]});
 assert.deepEqual(advance(s,1000).state.flightPoints,[]);
 assert.deepEqual(advance(s,3000).state.flightPoints,['sentinel']);
});
test('flying does not discover ground waypoints underneath the route',()=>{
 assert.deepEqual(advance(traveling({flight:true}),1000).state.flightPoints,[]);
});
test('being at a flight point discovers it without talking to the flight master',()=>{
 const s=createGame('鸟点',11,0);s.location='stormwind';
 assert.deepEqual(advance(s,0).state.flightPoints,['stormwind']);
});
