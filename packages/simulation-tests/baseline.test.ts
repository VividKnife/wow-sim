import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/baseline.json' with {type: 'json'};
import behavior from './fixtures/behavior.json' with {type: 'json'};
import current from './fixtures/current.json' with {type:'json'};
import manifest from '../game-data/manifest.json' with {type: 'json'};
import {captureBaseline} from './support/baseline.ts';
test('reviewed current structure: five scenarios preserve exact state, RNG and rewards', () => {
  // The pinned historical capture retains its own content version. Reviewed
  // content changes belong to current.json, never overwrite that reference.
  assert.equal(fixture.sourceCommit,behavior.baselineCommit);
  assert.equal(behavior.baselineCommit,'d2d43b9041768603a0c52b8ce55c64b2a03fb6a2');
  assert.equal(current.referenceCommit,behavior.baselineCommit);
  assert.equal(current.contentHash,manifest.contentVersion);
  assert.ok(current.reviewReason.length>=20);
  // Current goldens compare every durable field, without the historical
  // representation normalizer. The original commit's fixtures stay immutable.
  const actual=captureBaseline();
  assert.deepEqual(actual,current.scenarios);
  const summary=(s:any)=>({participants:s.participants,samples:s.samples.map(({hash,...sample}:any)=>sample)});
  const reference=behavior.scenarios as Record<string,unknown>;
  assert.deepEqual(Object.fromEntries(Object.entries(actual).map(([key,value])=>[key,JSON.stringify(summary(value))===JSON.stringify(summary(reference[key]))])),current.referenceSummaryMatches);
});
