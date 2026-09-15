import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, scheduleEvent, advanceTimeline, restoreTimeline } from '../src/timeline.js';
import { randomInteger } from '../src/random.js';

const fresh = () => createTimeline({ seed: 1, world: { n: 0, order: [] } });
const remember = ({ event, world, rngState }) => ({
  world: { ...world, n: world.n + 1, order: [...world.order, event.type] }, rngState, events: [],
});
const pulse = ({ world, rngState, nowMs }) => {
  const draw = randomInteger(rngState, 1, 10);
  return { world: { ...world, n: world.n + draw.value }, rngState: draw.state,
    events: [{ atMs: nowMs + 1000, type: 'pulse' }] };
};

test('creates a fresh serializable timeline with no hidden clock', () => {
  assert.deepEqual(fresh(), { version: 1, nowMs: 0, rngState: 1, nextSequence: 0,
    world: { n: 0, order: [] }, events: [] });
});
test('creation copies the world and rejects non-JSON state or invalid seeds', () => {
  const world = { n: 1 }; const state = createTimeline({ seed: 1, world });
  world.n = 2; assert.equal(state.world.n, 1);
  assert.throws(() => createTimeline({ seed: 0, world: {} }));
  assert.throws(() => createTimeline({ seed: 1, world: { n: NaN } }));
});
test('schedules by time, explicit priority, then insertion order', () => {
  let state = fresh();
  for (const event of [{ atMs: 100, type: 'last', priority: 1 }, { atMs: 100, type: 'first', priority: -1 },
    { atMs: 50, type: 'early' }, { atMs: 100, type: 'middle-a' }, { atMs: 100, type: 'middle-b' }]) {
    state = scheduleEvent(state, event);
  }
  const result = advanceTimeline(state, 100, remember);
  assert.deepEqual(result.state.world.order, ['early', 'first', 'middle-a', 'middle-b', 'last']);
  assert.equal(result.processed, 5); assert.equal(result.complete, true);
  assert.equal(result.state.events.length, 0);
});
test('does not fire before the exact event boundary or mutate scheduled payloads', () => {
  const initial = fresh(); const payload = { x: 2 };
  const scheduled = scheduleEvent(initial, { atMs: 1000, type: 'arrive', payload });
  payload.x = 3;
  assert.equal(initial.events.length, 0); assert.equal(scheduled.events[0].payload.x, 2);
  const before = advanceTimeline(scheduled, 999, remember);
  assert.equal(before.state.world.n, 0); assert.equal(before.state.nowMs, 999);
  assert.equal(advanceTimeline(before.state, 1000, remember).state.world.n, 1);
});
test('single advance and split advances with JSON restore produce identical random outcomes', () => {
  const initial = scheduleEvent(fresh(), { atMs: 1000, type: 'pulse' });
  const once = advanceTimeline(initial, 100000, pulse).state;
  let split = advanceTimeline(initial, 3571, pulse).state;
  split = restoreTimeline(JSON.parse(JSON.stringify(split)));
  split = advanceTimeline(split, 43210, pulse).state;
  split = advanceTimeline(split, 100000, pulse).state;
  assert.deepEqual(split, once); assert.equal(initial.world.n, 0);
});
test('event budget stops at the processed cursor and can resume without losing time', () => {
  const initial = scheduleEvent(fresh(), { atMs: 1000, type: 'pulse' });
  let result = advanceTimeline(initial, 10000, pulse, { maxEvents: 3 });
  assert.equal(result.processed, 3); assert.equal(result.complete, false); assert.equal(result.state.nowMs, 3000);
  let calls = 0;
  while (!result.complete && calls++ < 10) result = advanceTimeline(result.state, 10000, pulse, { maxEvents: 3 });
  assert.equal(result.complete, true);
  assert.deepEqual(result.state, advanceTimeline(initial, 10000, pulse).state);
});
test('finishes at the target if the budget exactly covers due events', () => {
  const state = scheduleEvent(fresh(), { atMs: 1000, type: 'one' });
  const result = advanceTimeline(state, 2000, remember, { maxEvents: 1 });
  assert.equal(result.complete, true); assert.equal(result.state.nowMs, 2000);
});
test('zero-delay reentrant events are bounded and preserve the pending event', () => {
  const state = scheduleEvent(fresh(), { atMs: 0, type: 'loop' });
  const loop = ({ world, rngState, nowMs }) => ({ world: { n: world.n + 1 }, rngState,
    events: [{ atMs: nowMs, type: 'loop' }] });
  const result = advanceTimeline(state, 100, loop, { maxEvents: 5 });
  assert.equal(result.processed, 5); assert.equal(result.complete, false);
  assert.equal(result.state.nowMs, 0); assert.equal(result.state.events.length, 1);
});
test('rejects backward, fractional, non-finite and unsafe time', () => {
  const state = advanceTimeline(fresh(), 100, remember).state;
  for (const atMs of [99, -1, 101.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => scheduleEvent(state, { atMs, type: 'invalid' }));
    assert.throws(() => advanceTimeline(state, atMs, remember));
  }
});
test('rejects malformed events, budgets and handlers', () => {
  for (const event of [{ atMs: 0, type: '' }, { atMs: 0, type: 'x', priority: 0.5 },
    { atMs: 0, type: 'x', payload: undefined }, { atMs: 0, type: 'x', payload: { a: Infinity } }]) {
    assert.throws(() => scheduleEvent(fresh(), event));
  }
  for (const maxEvents of [0, -1, 1.2, Infinity]) assert.throws(() => advanceTimeline(fresh(), 1, remember, { maxEvents }));
  assert.throws(() => advanceTimeline(fresh(), 1, null));
});
test('handler errors or invalid results leave the original state unchanged', () => {
  const state = scheduleEvent(fresh(), { atMs: 1000, type: 'pulse' });
  const before = structuredClone(state);
  for (const handler of [
    ({ world }) => { world.n = 99; throw new Error('fixture failure'); },
    () => undefined,
    async () => ({ world: {}, rngState: 1, events: [] }),
    () => ({ world: { n: Infinity }, rngState: 1, events: [] }),
    () => ({ world: {}, rngState: 0, events: [] }),
    () => ({ world: {}, rngState: 1, events: [{ atMs: 999, type: 'past' }] }),
  ]) {
    assert.throws(() => advanceTimeline(state, 2000, handler));
    assert.deepEqual(state, before);
  }
});
test('restoration rejects corrupt version, counters, RNG and event sequences', () => {
  const state = scheduleEvent(fresh(), { atMs: 100, type: 'x' });
  const bad = [
    { ...state, version: 2 }, { ...state, nowMs: -1 }, { ...state, rngState: 0 },
    { ...state, nextSequence: 0 }, { ...state, events: [state.events[0], state.events[0]] },
    { ...state, nowMs: 101 }, { ...state, world: new Map() }, { ...state, events: 'invalid' },
  ];
  for (const snapshot of bad) assert.throws(() => restoreTimeline(snapshot));
});
test('restore canonicalizes queue ordering and detaches snapshot state', () => {
  let state = scheduleEvent(fresh(), { atMs: 20, type: 'later' });
  state = scheduleEvent(state, { atMs: 10, type: 'earlier' });
  state.events.reverse();
  const restored = restoreTimeline(state);
  assert.equal(restored.events[0].atMs, 10);
  restored.world.n = 12; assert.equal(state.world.n, 0);
});
test('rejects sequence exhaustion before losing integer precision', () => {
  const state = { ...fresh(), nextSequence: Number.MAX_SAFE_INTEGER };
  assert.throws(() => scheduleEvent(state, { atMs: 0, type: 'overflow' }));
});
test('does not process an already consumed event again after restoring', () => {
  const initial = scheduleEvent(fresh(), { atMs: 100, type: 'once' });
  const done = advanceTimeline(initial, 100, remember).state;
  const restored = restoreTimeline(JSON.parse(JSON.stringify(done)));
  const result = advanceTimeline(restored, 200, remember);
  assert.equal(result.state.world.n, 1); assert.equal(result.processed, 0);
});
