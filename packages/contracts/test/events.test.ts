import assert from 'node:assert/strict';
import test from 'node:test';
import {applyGameEvent,applyProjectedState,createDeltaEvent,diffProjectedState,type GameSnapshotEvent} from '../src/events.ts';

const initial:GameSnapshotEvent={
 type:'snapshot',sequence:4,protocolVersion:1,contentVersion:'content',revision:2,scope:'full',
 snapshot:{player:{id:'hero',money:10,bag:[{id:1,count:1}]},view:{location:{id:'town'}}},
};

test('projected state patches reconstruct changes without mutating the baseline',()=>{
 const next={...initial,revision:3,sequence:5,snapshot:{player:{id:'hero',money:25,bag:[{id:1,count:2}]},view:{location:{id:'forest'}}}};
 const operations=diffProjectedState(initial,next);
 assert.deepEqual(applyProjectedState(initial,operations),next);
 assert.equal((initial.snapshot!.player as any).money,10);
});

test('event application enforces revision and sequence bases',()=>{
 const delta={type:'delta' as const,protocolVersion:1 as const,contentVersion:'content',baseRevision:2,revision:3,baseSequence:4,sequence:5,operations:diffProjectedState(
  {protocolVersion:1,contentVersion:'content',revision:2,snapshot:initial.snapshot},
  {protocolVersion:1,contentVersion:'content',revision:3,snapshot:{...initial.snapshot,player:{...initial.snapshot!.player,money:20}}},
 )};
 const rebuilt=applyGameEvent(initial,delta);
 assert.equal((rebuilt.snapshot!.player as any).money,20);
 assert.throws(()=>applyGameEvent({...initial,revision:1},delta),/base revision/i);
 assert.throws(()=>applyGameEvent({...initial,sequence:3},delta),/base sequence/i);
});

test('patch paths reject prototype mutation and malformed indexes',()=>{
 for(const path of [['__proto__','polluted'],['constructor','prototype','polluted'],[-1],['safe','']]){
  assert.throws(()=>applyProjectedState({},[{op:'set',path,value:true} as any]),/path/i);
 }
 assert.equal(({} as any).polluted,undefined);
});

test('delta ownership cannot change through matching revision numbers or patch contents',()=>{
 const previous:GameSnapshotEvent={...initial,execution:{pendingInputs:0,receipts:[],instanceId:'room',ownerEpoch:2,actorId:'hero',controllerGeneration:1,clientSequence:3,streamSequence:5}};
 const next:GameSnapshotEvent={...previous,sequence:5,revision:3,execution:{...previous.execution!,streamSequence:6}};
 const delta=createDeltaEvent(previous,next);
 assert.deepEqual(applyGameEvent(previous,delta),next);
 for(const execution of [undefined,{...next.execution!,ownerEpoch:1},{...next.execution!,ownerEpoch:3},
   {...next.execution!,instanceId:'different'},{...next.execution!,actorId:'other'},
   {...next.execution!,controllerGeneration:2},{...next.execution!,streamSequence:4}]){
  const changed={...next,execution};
  if(execution===undefined)delete changed.execution;
  assert.throws(()=>createDeltaEvent(previous,changed),/owner/);
  const operations=[...delta.operations,execution===undefined?{op:'remove' as const,path:['execution']}:{op:'set' as const,path:['execution'],value:execution}];
  assert.throws(()=>applyGameEvent(previous,{...delta,operations}),/owner/);
 }
});


test('delta application shares untouched metadata while copying each mutated path',()=>{
 const current=applyGameEvent(null,initial);
 const changed={...current,sequence:5,revision:3,snapshot:{...current.snapshot!,player:{...current.snapshot!.player,money:20}}};
 const result=applyGameEvent(current,createDeltaEvent(current,changed));
 assert.equal(result.snapshot!.view,current.snapshot!.view);
 assert.equal((result.snapshot!.player as any).bag,(current.snapshot!.player as any).bag);
 assert.notEqual(result.snapshot!.player,current.snapshot!.player);
 assert.equal((current.snapshot!.player as any).money,10);
 const next=applyProjectedState(current,[{op:'set',path:['snapshot','player','bag',0,'count'],value:9},{op:'set',path:['snapshot','player','bag',0,'id'],value:2}]) as any;
 assert.deepEqual(next.snapshot.player.bag,[{id:2,count:9}]);
 assert.deepEqual((current.snapshot!.player as any).bag,[{id:1,count:1}]);
 assert.throws(()=>applyProjectedState(current,[{op:'set',path:['snapshot','player','money'],value:99},{op:'remove',path:['snapshot','missing','key']}]),/path/);
 assert.equal((current.snapshot!.player as any).money,10);
 assert.throws(()=>applyProjectedState({bad:Infinity},[]),/JSON/);
 assert.throws(()=>applyProjectedState({},[{op:'set',path:['value'],value:JSON.parse('{"__proto__":{}}')}]),/unsafe/);
});


test('rolling log deltas only trim expired records and append new ones',()=>{
 const logs=Array.from({length:500},(_,id)=>({id,text:'combat log '.repeat(10)}));
 const previous={logs},next={logs:[...logs.slice(20),{id:500,text:'new'}]};
 const operations=diffProjectedState(previous,next);
 assert.equal(operations.length,2);assert.ok(operations.every(op=>op.op==='splice'));
 assert.ok(JSON.stringify(operations).length<300);
 assert.deepEqual(applyProjectedState(previous,operations),next);assert.equal(previous.logs.length,500);
 const changed={logs:[{...logs[20],text:'corrected'},...logs.slice(21),{id:500,text:'new'}]};
 assert.deepEqual(applyProjectedState(previous,diffProjectedState(previous,changed)),changed);
 assert.equal(logs[20].text,'combat log '.repeat(10));
 for(const op of [{index:-1,deleteCount:0,values:[]},{index:0,deleteCount:501,values:[]},{index:0,deleteCount:0,values:null}])assert.throws(()=>applyProjectedState(previous,[{op:'splice',path:['logs'],...op} as any]));
});
