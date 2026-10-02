import type {Rules} from './model.ts';

// Boundary-only clock translation. These are simulation timestamps, never
// durations, counters, asset identities or wall-clock deadlines.
const deadlineMaps = new Set(['cooldowns', 'globalCooldowns', 'itemCooldowns', 'professionCooldowns',
  'resourceCooldowns', 'questWaits', 'schoolLockouts', 'controlCooldowns', 'timers']);
const times = new Set(['clock', 'time', 'at', 'next', 'until', 'lastTick', 'lastManaUse', 'lastControlEnd',
  'lastRetaliation', 'globalCooldown', 'nextTick', 'nextRegen', 'nextPull', 'nextFood', 'nextAction',
  'nextSwing', 'nextAttack', 'nextSpell', 'nextRanged', 'nextOffhand', 'nextPowerRegen', 'nextInfernalFire',
  'nextControlledAttack', 'nextDrown', 'nextLoyaltyTick', 'nextHappinessTick', 'nextHealthRegen',
  'nextCheck', 'nextControl', 'nextBreath', 'nextCurse', 'nextDoom', 'nextFear', 'nextFrenzy', 'nextPulse',
  'nextShock', 'nextSpecial', 'nextSubmerge', 'nextTail', 'nextThink', 'nextWhelps', 'polyNextHeal',
  'partyBlessingPrepared', 'regenTick', 'nextTalentTick', 'nextAngerManagement', 'nextSpiritBond',
  'nextSacrificeTick', 'nextBomb', 'nextManaBomb', 'nextHeal']);
const originTimes = new Set(['startedAt', 'startsAt', 'acceptedAt', 'joinedAt', 'createdAt', 'receivedAt',
  'updatedAt', 'lastProgressAt', 'announcedAt', 'swingStartedAt', 'offhandStartedAt', 'rangedStartedAt',
  'phaseStartedAt', 'engagedAt', 'endedAt', 'completedAt', 'lastAt', 'takenAt', 'armedAt', 'armAt']);

/** Mutates a detached boundary state, preserving all relative simulation
 * deadlines. Validate every write before applying any: failed admission must
 * not leave half a character on the destination clock. */
export function rebaseSimulation(state: Rules, targetClock: number): Rules {
  if (!Number.isSafeInteger(state.clock) || state.clock < 0 || !Number.isSafeInteger(targetClock) || targetClock < 0)
    throw new Error('Invalid simulation clock');
  const delta = targetClock - state.clock;
  if (!delta) return state;
  const writes: [Rules, string, unknown][] = [];
  const seen = new WeakSet<object>();
  const shift = (object: Rules, key: string, value: number, nonnegative = false) => {
    const result = value + delta;
    if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER ||
      Number.isInteger(value) && !Number.isSafeInteger(result) || nonnegative && result < 0)
      throw new Error('Simulation timestamp exceeds clock range');
    writes.push([object, key, result]);
  };
  const walk = (value: Rules, parentKey = '', eventStorage = false, presentation = false) => {
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (entry && typeof entry === 'object') {
        if (key === 'simulationEvents') {
          // Frozen scheduled events and WeakMap runtime indexes belong to the
          // old clock. Adopt fresh storage once, retaining every ID and cursor.
          const storage = structuredClone(entry);
          walk(storage, key, true); writes.push([value, key, storage]);
        } else if (key === 'slots' && parentKey === 'policy') {
          for (const slot of Object.values(entry)) if (slot && typeof slot === 'object') walk(slot, 'slots');
        } else if (deadlineMaps.has(key)) {
          if (seen.has(entry)) continue;
          seen.add(entry);
          for (const [id, deadline] of Object.entries(entry)) {
            if (typeof deadline === 'number' && deadline !== 0 && Number.isFinite(deadline)) shift(entry, id, deadline);
            else if (deadline && typeof deadline === 'object') walk(deadline, key, eventStorage, presentation);
          }
        } else if (Array.isArray(entry)) {
          for (const child of entry) if (child && typeof child === 'object') walk(child, key, eventStorage, presentation);
        } else walk(entry, key, eventStorage, presentation || key === 'view');
      } else if (typeof entry === 'number' && Number.isFinite(entry)) {
        // NPC recruitment/growth and character creation use real elapsed time.
        if (key === 'wallAt' || key === 'lastProgressWall' || presentation && key === 'globalCooldown' ||
          parentKey === 'board' && key === 'refreshAt' ||
          key === 'createdAt' && parentKey !== 'auctions') continue;
        if (eventStorage && ['atMs', 'nowMs', 'readySweepAt'].includes(key)) {
          if (key !== 'readySweepAt' || entry !== -1) shift(value, key, entry, true);
        } else if (parentKey === 'slots' && ['reaction', 'dirty', 'inflight'].includes(key)) {
          shift(value, key, entry);
        } else if (times.has(key) || /(?:At|Until|Ready|Next)$/.test(key) || key === 'detonate') {
          if (entry !== 0 || times.has(key) || originTimes.has(key)) shift(value, key, entry);
        }
      }
    }
  };
  walk(state);
  for (const [object, key, value] of writes) object[key] = value;
  return state;
}
