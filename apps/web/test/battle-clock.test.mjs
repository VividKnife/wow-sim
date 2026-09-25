import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleClock} from '../lib/battle-clock.js';

test('frames advance between snapshots without rewinding on a delayed snapshot',()=>{
 const clock=createBattleClock(1000,0);
 assert.equal(clock.read(16),1016);
 assert.equal(clock.read(300),1300);
 clock.observe(1200,300);
 assert.equal(clock.read(300),1300);
 assert.equal(clock.read(500),1400);
});
test('duplicate snapshots do not stall animation and a lost connection bounds prediction',()=>{
 const clock=createBattleClock(1000,0);
 clock.observe(1000,100);
 assert.equal(clock.read(200),1200);
 assert.equal(clock.read(20000),2000);
});
test('a deterministic pull countdown reaches every second but never predicts past its deadline',()=>{
 const clock=createBattleClock(1000,0);
 assert.equal(clock.read(999,true,3000),1999);
 assert.equal(clock.read(1000,true,3000),2000);
 assert.equal(clock.read(2000,true,3000),3000);
 assert.equal(clock.read(3000,true,3000),4000);
 assert.equal(clock.read(20000,true,3000),4000);
});
test('new encounters reset and completed fights stop interpolating',()=>{
 const clock=createBattleClock(5000,0);
 clock.read(500);
 clock.observe(0,600,true);
 assert.equal(clock.read(700),100);
 assert.equal(clock.read(20000,false),0);
});
