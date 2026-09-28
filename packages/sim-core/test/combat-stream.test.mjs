import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatStreamSender,CombatStreamReceiver,eventBatch} from '../src/combat-stream.js';
function transfer(packet){return structuredClone(packet,{transfer:packet.buffer?[packet.buffer]:[]});}
test('numeric masks preserve exact IDs/times, array changes, removals and transferred buffer reuse',()=>{
 const sender=new CombatStreamSender(),receiver=new CombatStreamReceiver();
 const frames=[{id:'a',time:2**40,units:[{hp:100,x:1.000000000001}],aura:{until:2**42}}, {id:'a',time:2**40+100,units:[{hp:99,x:-0}],aura:null}, {id:'b',time:2**40+200,units:[{hp:99,x:-2},{hp:13}],next:12}];
 for(const snapshot of frames){const packet=sender.encode(snapshot),buffer=packet.buffer,wire=transfer(packet);if(buffer)assert.equal(buffer.byteLength,0);assert.deepEqual(receiver.apply(wire).snapshot,snapshot);const recycled=wire.buffer&&structuredClone(wire.buffer,{transfer:[wire.buffer]});assert.equal(sender.acknowledge(packet.sequence,recycled),true);}
 assert.ok(sender.pool.length<=2);
});
test('backpressure coalesces unsent state; gaps request baseline and duplicates cannot rewind',()=>{
 const sender=new CombatStreamSender(),receiver=new CombatStreamReceiver();const first=sender.encode({hp:100});receiver.apply(first);
 assert.equal(sender.encode({hp:99}),null);sender.acknowledge(first.sequence);
 const second=sender.encode({hp:50});assert.equal(receiver.apply({...second,base:999}).status,'baseline-required');assert.equal(receiver.snapshot.hp,100);
 assert.equal(receiver.apply(second).snapshot.hp,50);assert.equal(receiver.apply(first).status,'duplicate');
 sender.acknowledge(second.sequence);const baseline=sender.encode({hp:25},{baseline:true});assert.equal(receiver.apply(baseline).snapshot.hp,25);
});
test('malformed packets fail atomically and event gaps are explicit',()=>{
 const sender=new CombatStreamSender(),receiver=new CombatStreamReceiver();const first=sender.encode({hp:100});receiver.apply(first);sender.acknowledge(1);
 const delta=sender.encode({hp:99});new DataView(delta.buffer).setUint32(12,1,true);assert.throws(()=>receiver.apply(delta));assert.equal(receiver.snapshot.hp,100);assert.equal(receiver.sequence,1);
 assert.deepEqual(eventBatch([{id:5},{id:6}],2),{after:2,through:6,gap:true,events:[{id:5},{id:6}]});
});

test('recovery baseline remains monotonic and numeric deltas never mutate a previously delivered frame',()=>{
 const sender=new CombatStreamSender(),receiver=new CombatStreamReceiver();let packet=sender.encode({units:{a:{hp:100},b:{hp:200}},metadata:{name:'stable'}});
 const original=receiver.apply(packet).snapshot;sender.acknowledge(packet.sequence);
 packet=sender.encode({units:{a:{hp:90},b:{hp:200}},metadata:{name:'stable'}});const next=receiver.apply(packet).snapshot;
 assert.equal(original.units.a.hp,100);assert.equal(next.units.a.hp,90);assert.equal(next.units.b,original.units.b);assert.equal(next.metadata,original.metadata);
 sender.rebase();packet=sender.encode({units:{a:{hp:70}},metadata:{name:'stable'}});assert.equal(receiver.apply(packet).status,'applied');assert.equal(receiver.snapshot.units.a.hp,70);
});
