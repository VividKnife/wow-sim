import test from 'node:test';
import assert from 'node:assert/strict';
import {compileStrategies,DecisionTrace} from '../src/decision.js';

test('priority and stable ties select lazily without evaluating losing actions',()=>{
 const calls=[],intent={kind:'cast',spellId:1};
 const strategy=(id,priority,result)=>({id,priority,trigger:()=>true,actions:[{id,select:()=>{calls.push(id);return result;}}]});
 const definitions=[strategy('damage',30,{}),strategy('rescue',10,null),strategy('first-heal',20,intent),strategy('second-heal',20,{})];
 const select=compileStrategies(definitions),trace=new DecisionTrace();
 // Changing the declaration container after compilation cannot reorder it.
 definitions.reverse();definitions[1].priority=0;
 assert.equal(select({},trace),intent);
 assert.deepEqual(calls,['rescue','first-heal']);
 assert.deepEqual(trace.entries.map(row=>row.status),['unavailable','selected']);
});

test('explicit idle stops lower strategies but unavailable candidates fall through',()=>{
 let fallthrough=0;
 const select=compileStrategies([
  {id:'conserve',priority:0,trigger:ctx=>ctx.conserve,terminal:true,actions:[{id:'dispel',select:()=>null},{id:'auto-attack',select:()=>null}]},
  {id:'rotation',priority:1,trigger:()=>true,actions:[{id:'damage',select:()=>{fallthrough++;return {kind:'cast'};}}]},
 ]);
 assert.equal(select({conserve:true}),null);assert.equal(fallthrough,0);
 assert.deepEqual(select({conserve:false}),{kind:'cast'});assert.equal(fallthrough,1);
});

test('bounded diagnostics neither alter selection nor accumulate without limit',()=>{
 const select=compileStrategies(Array.from({length:20},(_,i)=>({id:String(i),priority:i,trigger:()=>true,actions:[{id:'skip',select:()=>null}]})));
 const trace=new DecisionTrace(3);
 assert.equal(select({},trace),select({}));assert.equal(trace.entries.length,3);assert.equal(trace.truncated,true);
 assert.throws(()=>new DecisionTrace(129),RangeError);
});

test('async decisions are rejected instead of entering authoritative intent execution',()=>{
 const strategy={id:'invalid',priority:0,trigger:()=>true,actions:[{id:'async',select:async()=>null}]};
 assert.throws(()=>compileStrategies([strategy])({}),/synchronous/);
 assert.throws(()=>compileStrategies([{...strategy,trigger:async()=>false}])({}),/synchronous/);
});
