import test from 'node:test';
import assert from 'node:assert/strict';
import { groundTravelDuration, flightTravelDuration } from '../src/travel.js';
import { createTimeline, scheduleEvent, advanceTimeline, restoreTimeline } from '../src/timeline.js';

// Synthetic geometry: these numbers are not asserted to be original WoW route measurements.
test('uses each ground segment speed and fixed delays', () => {
  assert.equal(groundTravelDuration([
    { distanceYards: 10, speedYardsPerSecond: 2 },
    { distanceYards: 10, speedYardsPerSecond: 4, delayMs: 500 },
  ]), 8000);
});
test('rounds up only after summing the whole route', () => {
  assert.equal(groundTravelDuration([
    { distanceYards: 0.0001, speedYardsPerSecond: 1 },
    { distanceYards: 0.0001, speedYardsPerSecond: 1 },
  ]), 1);
});
test('zero distance can still include a fixed travel delay', () => {
  assert.equal(groundTravelDuration([{ distanceYards: 0, speedYardsPerSecond: 1, delayMs: 250 }]), 250);
});
test('rejects absent routes, malformed segments and unrepresentable durations', () => {
  for (const segments of [[], null, [null], [undefined], Array(1),
    [{ distanceYards: -1, speedYardsPerSecond: 1 }], [{ distanceYards: 1, speedYardsPerSecond: 0 }],
    [{ distanceYards: NaN, speedYardsPerSecond: 1 }], [{ distanceYards: 1, speedYardsPerSecond: Infinity }],
    [{ distanceYards: 1, speedYardsPerSecond: 1, delayMs: -1 }],
    [{ distanceYards: 1, speedYardsPerSecond: 1, delayMs: 0.5 }],
    [{ distanceYards: 1, speedYardsPerSecond: 1, delayMs: NaN }],
    [{ distanceYards: 1, speedYardsPerSecond: 1, delayMs: null }],
    [{ distanceYards: Number.MAX_VALUE, speedYardsPerSecond: Number.MIN_VALUE }],
    [{ distanceYards: Number.MAX_SAFE_INTEGER, speedYardsPerSecond: 1 }],
  ]) assert.throws(() => groundTravelDuration(segments));
});
test('sums flight legs without applying a ground movement multiplier', () => {
  assert.equal(flightTravelDuration([{ durationMs: 2000 }, { durationMs: 3000 }]), 5000);
  assert.equal(flightTravelDuration([{ durationMs: 0 }]), 0);
});
test('flight rejects invalid legs and integer overflow', () => {
  for (const legs of [[], null, [null], Array(1), [{ durationMs: -1 }], [{ durationMs: 1.5 }],
    [{ durationMs: Infinity }], [{ durationMs: '5' }],
    [{ durationMs: Number.MAX_SAFE_INTEGER }, { durationMs: 1 }]]) {
    assert.throws(() => flightTravelDuration(legs));
  }
});
test('arrival is exact and occurs once across save and restore boundaries', () => {
  const duration = groundTravelDuration([{ distanceYards: 20, speedYardsPerSecond: 2 }]);
  let state = scheduleEvent(createTimeline({ seed: 1, world: { location: 'a', arrivals: 0 } }), {
    atMs: duration, type: 'arrive', payload: { destination: 'b' },
  });
  const arrive = ({ world, rngState, event }) => ({
    world: { location: event.payload.destination, arrivals: world.arrivals + 1 }, rngState, events: [],
  });
  state = advanceTimeline(state, 9999, arrive).state;
  assert.equal(state.world.location, 'a');
  state = restoreTimeline(JSON.parse(JSON.stringify(state)));
  state = advanceTimeline(state, 10000, arrive).state;
  assert.deepEqual(state.world, { location: 'b', arrivals: 1 });
  state = advanceTimeline(restoreTimeline(JSON.parse(JSON.stringify(state))), 20000, arrive).state;
  assert.equal(state.world.arrivals, 1);
});

test('a fractional movement cannot disappear into a near-limit integer delay', () => {
  assert.throws(() => groundTravelDuration([
    { distanceYards: 0.0001, speedYardsPerSecond: 1, delayMs: Number.MAX_SAFE_INTEGER },
  ]));
  assert.equal(groundTravelDuration([
    { distanceYards: 0.0001, speedYardsPerSecond: 1, delayMs: Number.MAX_SAFE_INTEGER - 1 },
  ]), Number.MAX_SAFE_INTEGER);
  assert.throws(() => groundTravelDuration([
    { distanceYards: 0.0001, speedYardsPerSecond: 1 },
    { distanceYards: 0, speedYardsPerSecond: 1, delayMs: Number.MAX_SAFE_INTEGER },
  ]));
});
