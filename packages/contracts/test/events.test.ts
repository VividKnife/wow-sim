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

test('array insertion retains stable spell and unit ends but still patches their changed fields',()=>{
 const skills=Array.from({length:80},(_,i)=>({spellId:i+1,name:'Spell '+i,description:'metadata '.repeat(40),range:30}));
 const previous={skills},next={skills:[{...skills[0],range:40},...skills.slice(1,40),{spellId:100,name:'New'},...skills.slice(40,79),{...skills[79],range:10}]};
 const patch=diffProjectedState(previous,next);
 assert.ok(JSON.stringify(patch).length<700);assert.equal(patch.filter(op=>op.op==='splice').length,1);
 assert.deepEqual(applyProjectedState(previous,patch),next);assert.equal(skills[0].range,30);
 for(const rows of [[],[{id:'a',hp:1}],[{id:'a',hp:1},{id:'b',hp:2}],[{id:'b',hp:5},{id:'c',hp:3},{id:'a',hp:4}],[{id:'a',hp:1},{id:'a',hp:2}],['a','b','c']]){
  for(const target of [[],rows.slice(1),[null,...rows],[...rows,1],[...rows].reverse(),[{id:'a',hp:10},...rows]]){
   const before={rows},after={rows:target};assert.deepEqual(applyProjectedState(before,diffProjectedState(before,after)),after);
  }
 }
});

test('diff validation covers unchanged, removed, inserted and replaced branches',()=>{
 const invalid=[undefined,NaN,Infinity,1n,()=>0,new Date(),new Map(),JSON.parse('{"__proto__":{}}'),{constructor:1},new Array(2)];
 for(const value of invalid){
  for(const [before,after] of [
   [value,value],[{value},{value}],[{value},{}],[{value},{value:null}], [{}, {value}],
   [{rows:[{id:1,bad:value},{id:2}]},{rows:[{id:2}]}],
   [{rows:[{id:1}]},{rows:[{id:1},{id:2,bad:value}]}],
   [{logs:[{id:1,bad:value},{id:2}]},{logs:[{id:2}]}],
   [{logs:[{id:1},{id:2,bad:value}]},{logs:[{id:1}]}],
   [{rows:[{id:1},{id:2,bad:value},{id:3}]},{rows:[{id:1},{id:3}]}],
  ])assert.throws(()=>diffProjectedState(before,after),TypeError);
 }
 const shared={metadata:{value:1}};
 assert.deepEqual(diffProjectedState({shared},{shared}),[]);
 shared.metadata.value=Infinity;
 assert.throws(()=>diffProjectedState({shared},{shared}),/JSON/,'shared identities are revalidated on every call');
});

test('replacement and splice validation count depth from their actual position',()=>{
 const chain=(depth:number)=>{let value:any=1;while(depth--)value={next:value};return value;};
 assert.doesNotThrow(()=>diffProjectedState(null,chain(100)));
 assert.throws(()=>diffProjectedState(null,chain(101)),/deep/);
 assert.throws(()=>diffProjectedState({rows:[{id:1}]},{rows:[{id:1},{id:2,value:chain(98)}]}),/deep/);
 assert.throws(()=>diffProjectedState({logs:[{id:1}]},{logs:[{id:1},{id:2,value:chain(98)}]}),/deep/);
 assert.throws(()=>diffProjectedState({removed:chain(100)},{}),/deep/);
 assert.throws(()=>applyGameEvent(null,{...initial,snapshot:{player:{sparse:new Array(1)},view:{}}}),/JSON/);
});

test('generated nested patches round-trip without mutating either input or sharing inserted values',()=>{
 let seed=137;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const tree=(depth:number):any=>{
  const choice=random()%(depth?6:3);
  if(choice===0)return random()%30;if(choice===1)return 'value'+random()%10;if(choice===2)return null;
  if(choice===3)return Array.from({length:random()%5},()=>tree(depth-1));
  const result:Record<string,unknown>={};for(let i=0,n=random()%5;i<n;i++)result['k'+random()%8]=tree(depth-1);
  return result;
 };
 for(let i=0;i<500;i++){
  const before=tree(4),after=tree(4),savedBefore=structuredClone(before),savedAfter=structuredClone(after);
  const patch=diffProjectedState(before,after);
  assert.deepEqual(applyProjectedState(before,patch),after);
  assert.deepEqual(before,savedBefore);assert.deepEqual(after,savedAfter);
 }
 const before={rows:[{id:1}]},after={rows:[{id:1},{id:2,nested:{value:3}}]};
 const patch=diffProjectedState(before,after);after.rows[1].nested!.value=4;
 assert.equal((applyProjectedState(before,patch) as typeof after).rows[1].nested!.value,3);
});
