import test from 'node:test';
import assert from 'node:assert/strict';
import {EventQueue, type EventRequest} from '../scheduling/event-queue.ts';

const event = (atMs: number, phase = 0, extra: Partial<EventRequest> = {}): EventRequest =>
  ({atMs, phase, kind: 'CastComplete', entitySlot: 0, entityGeneration: 1, subjectId: 81, subjectVersion: 1, ...extra});

test('heap agrees with stable reference ordering across thousands of insertions', () => {
  const queue = new EventQueue(), reference = [];
  for (let i = 0; i < 5000; i++) reference.push(queue.schedule(event((i * 71) % 997, i % 7)));
  reference.sort((a, b) => a.atMs - b.atMs || a.phase - b.phase || a.sequence - b.sequence);
  const actual: unknown[] = [];
  assert.equal(queue.advance(1000, 5000, () => true, e => { actual.push(e); }).complete, true);
  assert.deepEqual(actual, reference);
});

test('budget exhaustion retains a same-time causal chain and phase across restoration', () => {
  let queue = new EventQueue(); queue.schedule(event(100, 2)); queue.schedule(event(200));
  const seen: number[] = [];
  const handle = (e: {sequence: number; atMs: number; phase: number}) => {
    seen.push(e.sequence);
    if (e.sequence === 0) queue.schedule(event(100, 3));
  };
  assert.deepEqual(queue.advance(500, 1, () => true, handle), {complete: false, processed: 1, invalid: 0, nowMs: 100, queued: 2});
  queue = EventQueue.restore(JSON.parse(JSON.stringify(queue.checkpoint())));
  assert.throws(() => queue.schedule(event(100, 1)), /completed phase/);
  assert.equal(queue.advance(500, 1, () => true, handle).complete, false);
  assert.equal(queue.nowMs, 100);
  assert.equal(queue.advance(500, 1, () => true, handle).complete, true);
  assert.deepEqual(seen, [0, 2, 1]); assert.equal(queue.nowMs, 500);
});

test('incarnation and subject cancellation do not cancel an independent projectile', () => {
  const queue = new EventQueue();
  queue.schedule(event(3000));
  queue.schedule(event(3000, 0, {kind: 'ProjectileImpact', subjectId: 82}));
  queue.schedule(event(3000, 0, {entityGeneration: 2, subjectId: 83}));
  const output: string[] = [];
  const result = queue.advance(3000, 10, e => e.entityGeneration === 1 && e.subjectId !== 81, e => { output.push(e.kind); });
  assert.deepEqual(output, ['ProjectileImpact']); assert.equal(result.invalid, 2);
});

test('invalid events also consume budget; queue limits, corruption and handler faults fail closed', () => {
  const queue = new EventQueue(2); queue.schedule(event(1)); queue.schedule(event(2));
  assert.throws(() => queue.schedule(event(3)), /capacity/);
  assert.equal(queue.advance(10, 1, () => false, () => {}).complete, false);
  const bad = queue.checkpoint(); bad.events.push({...bad.events[0]});
  assert.throws(() => EventQueue.restore(bad), /cursor/);
  assert.throws(() => queue.advance(10, 1, () => true, () => { throw new Error('broken rule'); }), /broken rule/);
  assert.throws(() => queue.checkpoint(), /quarantined/);
  assert.throws(() => queue.advance(10, 1, () => true, () => {}), /quarantined/);
});

test('async handlers cannot create an untracked causal continuation', () => {
  const queue = new EventQueue(); queue.schedule(event(1));
  assert.throws(() => queue.advance(1, 1, () => true, async () => {}), /synchronous/);
  assert.throws(() => queue.checkpoint(), /quarantined/);
});

test('owned plain storage captures heap mutations and resumes a bounded same-time phase',()=>{
 const queue=new EventQueue(),state={queue:queue.ownedState()};
 queue.schedule(event(100,20));queue.schedule(event(100,20));queue.schedule(event(100,30));
 const seen:number[]=[];
 assert.equal(queue.advancePhase(100,20,1,()=>true,e=>{seen.push(e.sequence);}).complete,false);
 assert.equal(state.queue.events.length,2);assert.equal(state.queue.nowMs,100);
 const restored=EventQueue.own(JSON.parse(JSON.stringify(state)).queue);
 assert.equal(restored.advancePhase(100,20,1,()=>true,e=>{seen.push(e.sequence);}).complete,true);
 assert.equal(restored.size,1);
 assert.throws(()=>restored.schedule(event(100,10)),/completed phase/);
 assert.equal(restored.advancePhase(100,30,1,()=>true,e=>{seen.push(e.sequence);}).complete,true);
 assert.deepEqual(seen,[0,1,2]);
});

test('poison state survives an ordinary boundary clone and cannot be adopted',()=>{
 const queue=new EventQueue(),state=queue.ownedState();queue.schedule(event(1));
 assert.throws(()=>queue.advance(1,1,()=>true,()=>{throw new Error('fault');}),/fault/);
 assert.equal(state.failed,true);
 assert.throws(()=>EventQueue.own(structuredClone(state)),/quarantined/);
});

test('indexed cancellation stays ordered across removal, insertion and boundary restoration',()=>{
 let queue=new EventQueue(2048);const remaining=new Map<number,ReturnType<EventQueue['schedule']>>();
 for(let round=0;round<8;round++){
  for(let i=0;i<200;i++){const e=queue.schedule(event(1000+(i*71+round*97)%991,i%7));remaining.set(e.sequence,e);}
  for(const [id]of remaining)if((id+round)%3===0){assert.equal(queue.cancel(id),true);assert.equal(queue.cancel(id),false);remaining.delete(id);}
  queue=EventQueue.own(structuredClone(queue.ownedState()));
  assert.equal(queue.size,remaining.size);assert.equal(queue.nowMs,0);assert.equal(queue.cancel(999999),false);
 }
 const expected=[...remaining.values()].sort((a,b)=>a.atMs-b.atMs||a.phase-b.phase||a.sequence-b.sequence),actual:unknown[]=[];
 queue.advance(3000,2048,()=>true,e=>{actual.push(e);});assert.deepEqual(actual,expected);
});

test('cancellation frees bounded capacity without reusing stable event sequence or changing the cursor',()=>{
 const queue=new EventQueue(1),old=queue.schedule(event(100));assert.equal(queue.cancel(old.sequence),true);
 const next=queue.schedule(event(50));assert.ok(next.sequence>old.sequence);assert.equal(queue.nowMs,0);
 assert.throws(()=>queue.cancel(-1),/sequence/);
 queue.advance(50,1,()=>true,()=>{});assert.equal(queue.cancel(next.sequence),false);assert.equal(queue.nowMs,50);
});
