import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../src/evidence.js';

const reference = () => ({
  id: 'fixture:amount', ruleset: 'fixture', status: 'reference', value: 7,
  sources: [{ url: 'https://example.org/fixture', locator: 'row 1', revision: 'fixture-v1' }],
});
const invalid = record => assert.ok(validateEvidence(record, 'fixture').length > 0);

test('accepts a pinned reference without claiming its value is verified', () => {
  assert.deepEqual(validateEvidence(reference(), 'fixture'), []);
});
test('rejects mixing a record from another ruleset', () => invalid({ ...reference(), ruleset: 'other' }));
test('verified requires an audit record as well as a source', () => invalid({ ...reference(), status: 'verified' }));
test('accepts structurally complete verification', () => {
  assert.deepEqual(validateEvidence({ ...reference(), status: 'verified', verification: {
    method: 'measurement', reviewedAt: '2026-09-15', notes: 'Synthetic test fixture only.',
  } }, 'fixture'), []);
});
test('rejects invalid audit dates and unknown verification methods', () => {
  for (const verification of [
    { method: 'guessed', reviewedAt: '2026-09-15', notes: 'fixture' },
    { method: 'official', reviewedAt: '2026-02-30', notes: 'fixture' },
    { method: 'official', reviewedAt: '2026-09-15', notes: ' ' },
  ]) invalid({ ...reference(), status: 'verified', verification });
});
test('unknown can explicitly preserve a gap without inventing a value', () => {
  assert.deepEqual(validateEvidence({ id: 'fixture:missing', ruleset: 'fixture', status: 'unknown', sources: [] }, 'fixture'), []);
  invalid({ ...reference(), value: undefined });
});
test('rejects absent unpinned or non-web reference sources', () => {
  for (const sources of [[], null, [{ url: 'file:///secret', locator: 'row', revision: 'v1' }],
    [{ url: 'https://example.org', locator: ' ', revision: 'v1' }],
    [{ url: 'https://example.org', locator: 'row', revision: '' }]]) {
    invalid({ ...reference(), sources });
  }
});
test('requires a concrete ruleset rather than accepting two missing IDs', () => {
  assert.ok(validateEvidence({ ...reference(), ruleset: undefined }, undefined).length > 0);
});
test('rejects malformed records and status labels', () => {
  for (const record of [null, [], 8, { ...reference(), id: '' }, { ...reference(), status: 'accurate' }]) invalid(record);
});
test('rejects values that cannot round-trip through JSON without loss', () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [NaN, Infinity, undefined, 1n, new Date(), { x: NaN }, [undefined], cyclic,
    new Map(), () => 1, Symbol('x'), { [Symbol('x')]: 1 }, Array(2)]) {
    invalid({ ...reference(), value });
  }
});
test('accepts nested JSON data including repeated non-cyclic references', () => {
  const part = { amount: 7 };
  assert.deepEqual(validateEvidence({ ...reference(), value: [part, part, null, false] }, 'fixture'), []);
});
test('validation does not mutate the record or access a getter', () => {
  const record = reference(); const before = structuredClone(record);
  assert.deepEqual(validateEvidence(record, 'fixture'), []);
  assert.deepEqual(record, before);
  let called = false;
  const value = {}; Object.defineProperty(value, 'x', { enumerable: true, get() { called = true; return 2; } });
  invalid({ ...record, value });
  assert.equal(called, false);
});
