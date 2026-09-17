import assert from 'node:assert/strict';
import test from 'node:test';
import {applyGameEvent,applyProjectedState,diffProjectedState,type GameSnapshotEvent} from '../src/events.ts';

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
