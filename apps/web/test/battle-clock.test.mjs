import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleClock,createSceneClock} from '../lib/battle-clock.js';

test('delayed samples correct at no more than ten percent without jumping or rewinding',()=>{
 const clock=createBattleClock(1000,0);
 assert.equal(clock.read(300),1300);
 clock.observe(1200,300);
 assert.equal(clock.read(300),1300);
 assert.equal(clock.read(500),1480);
 clock.observe(3000,500);
 assert.equal(clock.read(500),1480,'packet arrival must not jump presentation time');
 assert.equal(clock.read(600),1590);
});
test('30 FPS display remains continuous across a two second packet gap',()=>{
 const clock=createBattleClock(1000,0);let last=1000;
 for(let frame=1;frame<=180;frame++){
  const now=frame*1000/30;
  if(frame<=30||frame>=90)clock.observe(1000+now,now);
  const value=clock.read(now),step=value-last;
  assert.ok(step>=30-1e-6&&step<=1000/30*1.1+1e-6,`frame ${frame}: ${step}ms`);
  last=value;
 }
 assert.ok(Math.abs(last-7000)<1e-6);
});
test('duplicate samples do not move the anchor and an outage bounds prediction',()=>{
 const clock=createBattleClock(1000,0);
 clock.observe(1000,100);
 assert.equal(clock.read(200),1200);
 assert.equal(clock.read(20000),4000);
 assert.equal(clock.read(21000),4000);
 clock.observe(22000,21000);
 assert.equal(clock.read(21000),4000);
 assert.equal(clock.read(21100),4110,'recovery cannot fast-forward the clock');
});
test('known pull countdown may extend the prediction horizon to its deadline',()=>{
 const clock=createBattleClock(1000,0);
 assert.equal(clock.read(1000,true,5000),2000);
 assert.equal(clock.read(5000,true,5000),6000);
 assert.equal(clock.read(20000,true,5000),6000);
});
test('scene pause/resume resets the anchor even without a new simulation time',()=>{
 const clock=createSceneClock(),scene={clock:1000,sampledAt:0,live:true,encounterId:'a'};
 assert.equal(clock.read(scene,300),1300);
 assert.equal(clock.read({...scene,live:false,sampledAt:300},300),1000);
 assert.equal(clock.read({...scene,live:false,sampledAt:300},10000),1000);
 const resumed={...scene,sampledAt:10000};
 assert.equal(clock.read(resumed,10000),1000);
 assert.equal(clock.read(resumed,10100),1100);
 assert.equal(clock.read({...scene,encounterId:'b',clock:0,sampledAt:10200},10200),0);
});
test('HUD renders cannot restart canvas extrapolation, and recordings never overrun',()=>{
 const clock=createSceneClock(),scene={clock:100,sampledAt:0,live:true,encounterId:'a'};
 for(let now=0;now<10000;now+=100)assert.equal(clock.read({...scene},now),100+Math.min(now,3000));
 const replay=createSceneClock();
 assert.equal(replay.read({...scene,endClock:450},1000),450);
 assert.equal(replay.read({...scene,live:false},5000),100);
});
