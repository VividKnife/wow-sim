const MAX_UINT32 = 0xffffffff;

export function assertRandomState(state) {
  if (!Number.isInteger(state) || state < 1 || state > MAX_UINT32) {
    throw new RangeError('random state must be a nonzero uint32');
  }
}

/** Deterministic simulation RNG; not a claim about Blizzard's RNG implementation. */
export function nextRandom(state) {
  assertRandomState(state);
  let x = state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return { state: x, value: x / 0x100000000 };
}

export function randomInteger(state, min, max) {
  assertRandomState(state);
  if (![min, max].every(value => Number.isInteger(value) && value >= 0 && value <= MAX_UINT32)
      || min > max || max - min + 1 > MAX_UINT32) {
    throw new RangeError('integer interval must have 1..0xffffffff uint32 values');
  }
  const width = max - min + 1;
  // Xorshift32 visits every nonzero uint32: subtract one before rejection sampling.
  const limit = Math.floor(MAX_UINT32 / width) * width;
  let draw;
  do {
    draw = nextRandom(state);
    state = draw.state;
  } while (draw.state - 1 >= limit);
  return { state, value: min + (draw.state - 1) % width };
}
