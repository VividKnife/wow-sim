import {test} from 'node:test';
import assert from 'node:assert/strict';
import {holdDeathPose,createMotionController} from '../public/model-viewer/motion.js';

test('death clamps at the final pose across repeated and oversized frames; living clips still loop',()=>{
 const model={af:false,X(state,delta){state.d.b+=delta;if(!this.af)state.b.d=0;if(state.d.b>=state.d.c.f)state.d.b%=state.d.c.f;}};
 holdDeathPose(model);
 const state={d:{c:{i:'Death',f:1800},b:0},b:{d:0}};
 model.X(state,500);assert.equal(state.d.b,500);
 model.X(state,10000);assert.equal(state.d.b,1799);
 for(let i=0;i<100;i++)model.X(state,33);
 assert.equal(state.d.b,1799);assert.equal(state.b.d,-1);assert.equal(model.af,false);
 state.d={c:{i:'Run',f:1000},b:0};model.X(state,1200);
 assert.equal(state.d.b,200);assert.equal(state.b.d,0);
 state.d={c:{i:'Death',f:2400},b:0};model.X(state,3000);assert.equal(state.d.b,2399);
});
test('duplicate snapshots and pause/resume do not restart death; resurrection and another death do',()=>{
 const calls=[];const update=createMotionController({method:(...args)=>calls.push(args)});
 update({animation:'Death',paused:false});update({animation:'Death',paused:true});
 update({animation:'Death',paused:false});update({animation:'Death',paused:false},true);
 assert.equal(calls.filter(([name])=>name==='setAnimation').length,1);
 assert.deepEqual(calls.at(-1),['setAnimPaused',[true]]);
 update({animation:'Stand',paused:false});update({animation:'Death',paused:false});
 assert.deepEqual(calls.filter(([name])=>name==='setAnimation').map(([,args])=>args[0]),['Death','Stand','Death']);
});

test('releasing a spirit switches held death to running without restarting strides on pause',()=>{
 const calls=[],update=createMotionController({method:(...args)=>calls.push(args)});
 for(const motion of [{animation:'Death',paused:false},{animation:'Run',paused:false},{animation:'Run',paused:true},{animation:'Run',paused:false},{animation:'Stand',paused:false}])update(motion);
 assert.deepEqual(calls.filter(([name])=>name==='setAnimation').map(([,args])=>args[0]),['Death','Run','Stand']);
 assert.deepEqual(calls.filter(([name])=>name==='setAnimPaused').map(([,args])=>args[0]),[false,false,true,false,false]);
});
