function route(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('route must contain at least one segment');
}

function segment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('segment must be an object');
}

function duration(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('duration must be a nonnegative safe integer in milliseconds');
  return value;
}

/** Uses supplied route measurements and effective speeds; contains no historical constants. */
export function groundTravelDuration(segments) {
  route(segments);
  let wholeMs = 0;
  let fractionMs = 0;
  const add = value => {
    const whole = duration(Math.floor(value));
    if (whole > Number.MAX_SAFE_INTEGER - wholeMs) throw new RangeError('route duration overflow');
    wholeMs += whole;
    // Do not add a fractional movement directly to a large integer delay:
    // IEEE-754 rounding could erase that movement before the final ceil.
    fractionMs += value - whole;
    const carry = Math.floor(fractionMs);
    wholeMs = duration(wholeMs + carry);
    fractionMs -= carry;
  };
  for (const part of segments) {
    segment(part);
    const { distanceYards, speedYardsPerSecond } = part;
    if (!Number.isFinite(distanceYards) || distanceYards < 0
        || !Number.isFinite(speedYardsPerSecond) || speedYardsPerSecond <= 0) {
      throw new RangeError('ground segments need finite nonnegative distance and positive speed');
    }
    const delayMs = Object.hasOwn(part, 'delayMs') ? duration(part.delayMs) : 0;
    add(distanceYards / speedYardsPerSecond * 1000);
    add(delayMs);
  }
  return duration(wholeMs + (fractionMs > 0 ? 1 : 0));
}

/** Flight duration is measured along flight legs, independent of ground mount speed. */
export function flightTravelDuration(legs) {
  route(legs);
  let totalMs = 0;
  for (const leg of legs) {
    segment(leg);
    totalMs = duration(totalMs + duration(leg.durationMs));
  }
  return totalMs;
}
