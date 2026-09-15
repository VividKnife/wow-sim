import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRandom, randomInteger } from '../src/random.js';

test('has a known deterministic transition and a normalized draw', () => {
  assert.deepEqual(nextRandom(1), { state: 270369, value: 270369 / 0x100000000 });
});
test('rejects zero and malformed RNG states instead of getting stuck at zero', () => {
  for (const seed of [0, -1, 1.5, NaN, Infinity, 0x100000000, '1', null]) assert.throws(() => nextRandom(seed));
});
test('independent simulations resume identically after JSON serialization', () => {
  let first = 123;
  for (let i = 0; i < 50; i++) first = nextRandom(first).state;
  let second = JSON.parse(JSON.stringify({ state: first })).state;
  for (let i = 0; i < 50; i++) {
    const a = nextRandom(first); const b = nextRandom(second);
    assert.deepEqual(a, b); assert.ok(a.value >= 0 && a.value < 1);
    first = a.state; second = b.state;
  }
});
test('integer draws include both boundaries and retain a valid next state', () => {
  let seed = 1; const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const draw = randomInteger(seed, 2, 5); seed = draw.state; seen.add(draw.value);
    assert.ok(Number.isInteger(draw.value) && draw.value >= 2 && draw.value <= 5);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});
test('a constant interval still consumes a draw', () => {
  assert.deepEqual(randomInteger(1, 9, 9), { state: 270369, value: 9 });
  assert.equal(randomInteger(1, 0xffffffff, 0xffffffff).value, 0xffffffff);
});
test('rejects malformed bounds and the unsupported full uint32 interval', () => {
  for (const bounds of [[3, 2], [-1, 2], [1, Infinity], [1.5, 3], [0, 0xffffffff], [0, '3']]) {
    assert.throws(() => randomInteger(1, ...bounds));
  }
  assert.throws(() => randomInteger(0, 1, 3));
});
test('rejects out-of-range candidates rather than biasing a large interval', () => {
  const rejected = nextRandom(8192);
  assert.ok(rejected.state - 1 >= 0x80000000);
  let accepted = nextRandom(rejected.state);
  while (accepted.state - 1 >= 0x80000000) accepted = nextRandom(accepted.state);
  assert.deepEqual(randomInteger(8192, 0, 0x7fffffff), { state: accepted.state, value: accepted.state - 1 });
});
