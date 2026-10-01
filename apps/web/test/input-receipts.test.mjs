import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputReceiptTracker,inputReceiptPending} from '../lib/input-receipts.js';
const execution={instanceId:'room',actorId:'hero',ownerEpoch:1,controllerGeneration:1,receipts:[]};
const queued={requestId:'request',inputSequence:1,effectiveWallAt:5000,simTime:null,status:'queued',durable:true,confirmation:'durable'};

test('queued and volatile applied receipts do not report success; durable restored receipts do',async()=>{
 const tracker=createInputReceiptTracker();let finished=false;
 const waiting=tracker.wait(queued,execution).then(value=>{finished=true;return value;});
 tracker.observe({execution:{...execution,receipts:[queued]}});await Promise.resolve();assert.equal(finished,false);
 const applied={...queued,status:'applied',simTime:5000,durable:false};
 tracker.observe({execution:{...execution,receipts:[applied]}});await Promise.resolve();assert.equal(finished,false);
 tracker.observe({execution:{...execution,ownerEpoch:2,receipts:[{...applied,durable:true}]}});assert.equal(await waiting,true);
});

test('different characters cannot fulfill a receipt and durable rejection preserves the reason',async()=>{
 const tracker=createInputReceiptTracker(),waiting=tracker.wait(queued,execution);
 const rejected={...queued,status:'rejected',simTime:5000,reason:'目标已死亡'};
 tracker.observe({execution:{...execution,actorId:'other',receipts:[rejected]}});
 tracker.observe({execution:{...execution,receipts:[rejected]}});
 await assert.rejects(waiting,{message:'目标已死亡',code:'COMMAND_REJECTED'});
});

test('leaving a page releases local waiters without treating saved input as cancelled remotely',async()=>{
 const tracker=createInputReceiptTracker(),waiting=tracker.wait(queued,execution);
 tracker.cancel();await assert.rejects(waiting,/仍由服务器执行/);
});

test('a deleted save or expired session can end a local wait with the actual reason',async()=>{
 const tracker=createInputReceiptTracker(),waiting=tracker.wait(queued,execution);
 tracker.cancel('角色或存档已不存在，请返回角色选择。');
 await assert.rejects(waiting,/存档已不存在/);
});

test('ordinary combat confirms on application without pretending to be durable',async()=>{
 const tracker=createInputReceiptTracker();let finished=false;
 const receipt={...queued,durable:false,confirmation:'applied'};
 const waiting=tracker.wait(receipt,execution).then(value=>{finished=true;return value;});
 assert.equal(inputReceiptPending(receipt),true);await Promise.resolve();assert.equal(finished,false);
 const applied={...receipt,status:'applied',simTime:5000};tracker.observe({execution:{...execution,receipts:[applied]}});
 assert.equal(await waiting,true);assert.equal(inputReceiptPending(applied),false);assert.equal(applied.durable,false);
});

test('rejected operations complete immediately even before the next periodic save',async()=>{
 const tracker=createInputReceiptTracker();
 await assert.rejects(tracker.wait({...queued,status:'rejected',simTime:5000,durable:false,reason:'目标已死亡'},execution),/目标已死亡/);
});

test('recovery of a checkpoint without a volatile queued input ends the wait without resubmission',async()=>{
 const tracker=createInputReceiptTracker();
 const waiting=tracker.wait({...queued,durable:false,confirmation:'applied'},execution);
 tracker.observe({execution:{...execution,ownerEpoch:2,receipts:[]}});await assert.rejects(waiting,/实例已恢复/);
});

test('stale epochs cannot fulfill a waiter and moving to another instance ends it',async()=>{
 const tracker=createInputReceiptTracker();let settled=false;
 const waiting=tracker.wait(queued,{...execution,ownerEpoch:2});void waiting.then(()=>{settled=true;},()=>{settled=true;});
 tracker.observe({execution:{...execution,ownerEpoch:1,receipts:[{...queued,status:'applied',simTime:5000}]}});
 await Promise.resolve();assert.equal(settled,false);
 tracker.observe({execution:{...execution,instanceId:'new-room',ownerEpoch:1}});await assert.rejects(waiting,/新的实例/);
});

test('a transferred full baseline preserves pending receipts across room-local epoch changes',async()=>{
 const tracker=createInputReceiptTracker(),waiting=tracker.wait(queued,{...execution,ownerEpoch:7});
 const transferred={...execution,instanceId:'dungeon',controllerGeneration:2,receipts:[queued]};
 tracker.observe({scope:'full',execution:transferred});
 tracker.observe({execution:{...transferred,receipts:[{...queued,status:'applied',simTime:5000}]}});
 assert.equal(await waiting,true);
});

test('partial or unrelated room frames cannot confirm transferred input',async()=>{
 for(const [scope,generation] of [['combat',2],['full',1]]){
  const tracker=createInputReceiptTracker(),waiting=tracker.wait(queued,execution);
  tracker.observe({scope,execution:{...execution,instanceId:'foreign',controllerGeneration:generation,receipts:[{...queued,status:'applied',simTime:5000}]}});
  await assert.rejects(waiting,/新的实例/);
 }
});
