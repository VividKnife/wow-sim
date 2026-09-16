import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance} from '../lib/game/engine.js';
import {startCombat} from '../lib/game/combat.js';
import * as sessions from '../lib/game/session.js';

const idA='tab-a-123456',idB='tab-b-123456';
function dungeon(){const s=createGame('在线副本',33,0);s.dungeon={id:'deadmines'};startCombat(s,[598],true);return s;}
test('dungeon clock, random state, casts and health freeze when no live client is present',()=>{
 const s=dungeon(),next=advance(s,3600000).state;
 assert.equal(next.wallAt,3600000);assert.deepEqual({...next,wallAt:0},s);
});
test('only a live controlling page advances dungeon time; reconnect never catches up the gap',()=>{
 let s=dungeon();s=sessions.stepSession(s,{type:'sync',clientId:idA},0).state;
 s=sessions.stepSession(s,{type:'sync',clientId:idA},500).state;assert.equal(s.clock,500);
 const before=structuredClone(s);s=sessions.stepSession(s,{type:'sync',clientId:idA},3600000).state;
 assert.equal(s.clock,500);assert.deepEqual(s.combat,before.combat);assert.equal(s.rngState,before.rngState);
 s=sessions.stepSession(s,{type:'sync',clientId:idA},3600500).state;assert.equal(s.clock,1000);
});
test('observer tabs cannot mutate or renew another page lease; takeover freezes the unsettled gap',()=>{
 let s=sessions.stepSession(dungeon(),{type:'sync',clientId:idA},0).state;
 const observer=sessions.stepSession(s,{type:'sync',clientId:idB},500);assert.equal(observer.controlled,false);assert.deepEqual(observer.state,s);
 assert.throws(()=>sessions.stepSession(s,{type:'stop',clientId:idB},500),/页面/);
 s=sessions.stepSession(s,{type:'takeControl',clientId:idB},500).state;assert.equal(s.clock,0);
 assert.equal(sessions.stepSession(s,{type:'sync',clientId:idA},1000).controlled,false);
 s=sessions.stepSession(s,{type:'sync',clientId:idB},1000).state;assert.equal(s.clock,500);
});
test('hiding the controlling page freezes subsequent time and outdoor activity still catches up normally',()=>{
 let s=sessions.stepSession(dungeon(),{type:'sync',clientId:idA},0).state;s=sessions.stepSession(s,{type:'pause',clientId:idA},500).state;
 const paused=structuredClone(s);s=sessions.stepSession(s,{type:'sync',clientId:idA},2000).state;assert.equal(s.clock,paused.clock);assert.deepEqual(s.combat,paused.combat);
 const outside=createGame('野外离线',3,0);const resumed=sessions.stepSession(outside,{type:'sync',clientId:idA},10000).state;assert.equal(resumed.clock,10000);
});
