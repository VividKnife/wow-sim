import {createHash} from 'node:crypto';
import {localScenarios} from '../../game-domain/test/support/local-scenarios.ts';
import {advanceOwned} from '../../game-domain/src/rules/engine.js';
import {behaviorState} from './behavior-state.ts';
export {localScenarios};
/** Normalize only JSON representation, never combat fields or RNG. */
export const durableState = (value: unknown) => JSON.parse(JSON.stringify(value));
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(durableState(value))).digest('hex');
export function captureBaseline({behaviorOnly=false,scenarios=localScenarios(),advance=advanceOwned}={}) {
  const hash=(value:unknown)=>digest(behaviorOnly?behaviorState(value):value);
  return Object.fromEntries(Object.entries(scenarios).map(([name, initial]) => {
    const state = structuredClone(initial), samples = [];
    for (let time = 50; time <= 15_000; time += 50) {
      advance(state, time);
      if (time % 5000 === 0) samples.push({wallAt: state.wallAt, simTime: state.clock, hash: hash(state), rngState: state.rngState,
        totals: durableState(state.totals), living: [state, ...state.party].filter(actor => actor.hp > 0).length});
    }
    return [name, {initialHash: hash(initial), participants: [initial, ...initial.party].length, samples}];
  }));
}
