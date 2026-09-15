import { assertJson } from './json.js';
import { assertRandomState } from './random.js';

// Call only after JSON validation. Canonical trees have identical alias semantics
// before and after persistence; structuredClone would preserve in-memory aliases.
const copyJson = value => JSON.parse(JSON.stringify(value));

function integer(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}, excluding negative zero`);
  }
}

function object(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}

function eventFields(event, nowMs) {
  object(event, 'event');
  integer(event.atMs, 'event.atMs', nowMs);
  if (!Number.isSafeInteger(event.priority)) throw new RangeError('event.priority must be a safe integer');
  if (typeof event.type !== 'string' || !event.type.trim()) throw new TypeError('event.type must be nonempty');
  assertJson(event.payload, 'event.payload');
}

function compareEvents(a, b) {
  return a.atMs - b.atMs || a.priority - b.priority || a.sequence - b.sequence;
}

function enqueue(state, request) {
  object(request, 'event request');
  assertJson(request, 'event request');
  const event = {
    atMs: request.atMs, type: request.type,
    priority: Object.hasOwn(request, 'priority') ? request.priority : 0,
    payload: Object.hasOwn(request, 'payload') ? request.payload : null,
    sequence: state.nextSequence,
  };
  eventFields(event, state.nowMs);
  if (state.nextSequence >= Number.MAX_SAFE_INTEGER) throw new RangeError('event sequence exhausted');
  state.nextSequence++;
  // Binary insertion keeps the queue ordered, including new events at the current time.
  let lo = 0; let hi = state.events.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (compareEvents(state.events[mid], event) <= 0) lo = mid + 1;
    else hi = mid;
  }
  state.events.splice(lo, 0, copyJson(event));
}

export function createTimeline({ seed, world }) {
  assertRandomState(seed);
  assertJson(world, 'world');
  return { version: 1, nowMs: 0, rngState: seed, nextSequence: 0, world: copyJson(world), events: [] };
}

/** Validate persisted state before it can affect simulation or rewards. */
export function restoreTimeline(snapshot) {
  object(snapshot, 'timeline');
  assertJson(snapshot, 'timeline');
  if (snapshot.version !== 1) throw new RangeError('unsupported timeline version');
  integer(snapshot.nowMs, 'nowMs');
  integer(snapshot.nextSequence, 'nextSequence');
  assertRandomState(snapshot.rngState);
  assertJson(snapshot.world, 'world');
  if (!Array.isArray(snapshot.events)) throw new TypeError('events must be an array');
  const sequences = new Set();
  for (const event of snapshot.events) {
    eventFields(event, snapshot.nowMs);
    integer(event.sequence, 'event.sequence');
    if (event.sequence >= snapshot.nextSequence || sequences.has(event.sequence)) {
      throw new RangeError('event sequences must be unique and below nextSequence');
    }
    sequences.add(event.sequence);
  }
  const state = copyJson(snapshot);
  state.events.sort(compareEvents);
  return state;
}

export function scheduleEvent(state, event) {
  const next = restoreTimeline(state);
  enqueue(next, event);
  return next;
}

/** Pure bounded catch-up. Only advance the target cursor once all due events are handled. */
export function advanceTimeline(snapshot, untilMs, handler, { maxEvents = 10000 } = {}) {
  const state = restoreTimeline(snapshot);
  integer(untilMs, 'untilMs', state.nowMs);
  integer(maxEvents, 'maxEvents', 1);
  if (typeof handler !== 'function') throw new TypeError('handler must be a synchronous function');
  let processed = 0;
  while (state.events.length && state.events[0].atMs <= untilMs && processed < maxEvents) {
    const event = state.events.shift();
    state.nowMs = event.atMs;
    const result = handler({ event, nowMs: state.nowMs, world: state.world, rngState: state.rngState });
    object(result, 'handler result');
    assertJson(result, 'handler result');
    assertJson(result.world, 'handler world');
    assertRandomState(result.rngState);
    if (!Array.isArray(result.events)) throw new TypeError('handler events must be an array');
    state.world = copyJson(result.world);
    state.rngState = result.rngState;
    for (const request of result.events) enqueue(state, request);
    processed++;
  }
  const complete = state.events.length === 0 || state.events[0].atMs > untilMs;
  if (complete) state.nowMs = untilMs;
  return { state, processed, complete };
}
