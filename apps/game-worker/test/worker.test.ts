import assert from 'node:assert/strict';
import test from 'node:test';
import {createGameWorker} from '../src/worker.ts';

test('runOnce passes the clock and batch limit to the domain worker', async () => {
  const calls: unknown[][] = [];
  const service = {async work(...args: unknown[]) { calls.push(args); return {activities: 2, instances: 1, errors: []}; }};
  const worker = createGameWorker({service, now: () => 1234, limit: 17});

  assert.deepEqual(await worker.runOnce(), {activities: 2, instances: 1, errors: []});
  assert.deepEqual(calls, [[1234, 17]]);
});

test('a partial domain failure is observable without losing successful work',async()=>{
 const failures:unknown[]=[];
 const error={id:'stuck-activity',message:'content version unavailable'};
 const worker=createGameWorker({service:{async work(){return{activities:1,instances:0,errors:[error]};}},onError:error=>failures.push(error)});
 assert.deepEqual(await worker.runOnce(),{activities:1,instances:0,errors:[error]});
 assert.deepEqual(failures,[error]);
});

test('start never overlaps work and stop prevents another scheduled run', async () => {
  let active = 0;
  let maxActive = 0;
  let releases: Array<() => void> = [];
  const service = {work: async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active--;
    return {activities: 0, instances: 0, errors: []};
  }};
  const worker = createGameWorker({service, intervalMs: 5});
  worker.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(maxActive, 1);
  assert.equal(releases.length, 1);
  releases.shift()!();
  await worker.stop();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(releases.length, 0);
});
