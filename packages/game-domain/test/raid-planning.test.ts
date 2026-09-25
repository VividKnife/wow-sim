import test from 'node:test';
import assert from 'node:assert/strict';
import { createCooperativePreviewRaid, createPreviewRaid, inspectRaidPlan, makePreviewSquad, validateRaidPlan } from '../src/raid-planning.ts';

test('1–8 accounts replace guild squads while keeping 40 unique seats', () => {
  for (let count = 1; count <= 8; count++) {
    const plan = createPreviewRaid(count, 40), result = inspectRaidPlan(plan, 'gate');
    assert.deepEqual(validateRaidPlan(plan), []);
    assert.equal(result.humanCount, count);
    assert.equal(result.guildCount, 8 - count);
    assert.equal(result.members, 40);
    assert.equal(new Set(plan.squads.flatMap(s => s.members.map(m => m.id))).size, 40);
  }
});
test('default solo composition covers the three illustrative encounters', () => {
  const plan = createPreviewRaid(1, 40);
  for (const encounter of ['gate', 'pack', 'lava'] as const) assert.equal(inspectRaidPlan(plan, encounter).ready, true);
  assert.deepEqual(inspectRaidPlan(plan, 'gate').roles, { tank: 3, healer: 8, melee: 10, ranged: 19 });
});
test('capability alone is insufficient without assigning its task', () => {
  const plan = createPreviewRaid(1, 40);
  plan.squads[3].order = 'boss';
  const result = inspectRaidPlan(plan, 'gate');
  assert.equal(result.ready, false);
  assert.equal(result.checks.find(c => c.id === 'dispellers')?.actual, 0);
  assert.equal(result.roles.ranged, 19);
});
test('replacing a specialist changes readiness, restoring it repairs the plan', () => {
  const plan = createPreviewRaid(1, 40);
  plan.squads[1] = makePreviewSquad('squad-2', 'vanguard', { kind: 'guild' }, 'adds');
  assert.equal(inspectRaidPlan(plan, 'pack').checks.find(c => c.id === 'addTanks')?.met, false);
  plan.squads[1] = makePreviewSquad('squad-2', 'bulwark', { kind: 'guild' }, 'adds');
  assert.equal(inspectRaidPlan(plan, 'pack').ready, true);
});
test('eight dungeon parties reveal excess tanks and missing raid assignments', () => {
  const result = inspectRaidPlan(createPreviewRaid(8, 40), 'gate');
  assert.equal(result.roles.tank, 8);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.ready, false);
});
test('planning is deterministic, JSON serializable and does not mutate input', () => {
  const plan = createPreviewRaid(), before = JSON.stringify(plan);
  assert.deepEqual(inspectRaidPlan(plan, 'lava'), inspectRaidPlan(JSON.parse(before), 'lava'));
  assert.equal(JSON.stringify(plan), before);
});
test('reject duplicate members, duplicate owners, missing commander and wrong size', () => {
  const plan = createPreviewRaid();
  plan.squads[1].members[0].id = plan.squads[0].members[0].id;
  plan.squads[1].controller = { kind: 'account', accountId: plan.commanderAccountId };
  plan.commanderAccountId = 'absent';
  plan.squads[2].members.pop();
  plan.squads[3].members[0].level = 59;
  assert.equal(validateRaidPlan(plan).length, 5);
  assert.throws(() => inspectRaidPlan(plan, 'gate'));
});
test('reject invalid account counts and unknown encounters', () => {
  for (const count of [0, 6, 9, 1.5, NaN]) assert.throws(() => createPreviewRaid(count));
  // @ts-expect-error Deliberately invalid encounter input.
  assert.throws(() => inspectRaidPlan(createPreviewRaid(), 'unknown'));
});

test('25-player default has 2 tanks, 5 healers, 18 damage and supports 1–5 accounts', () => {
  const result = inspectRaidPlan(createPreviewRaid(), 'gate');
  assert.deepEqual(result.roles, {tank:2, healer:5, melee:6, ranged:12});
  assert.equal(result.ready, true);
  assert.equal(inspectRaidPlan(createPreviewRaid(), 'lava').ready, true);
  for (let count = 1; count <= 5; count++) {
    const report = inspectRaidPlan(createPreviewRaid(count), 'gate');
    assert.equal(report.members, 25);
    assert.equal(report.humanCount, count);
    assert.equal(report.guildCount, 5 - count);
  }
});
test('five humans can keep their five-member ownership groups and fill raid-wide roles', () => {
  const original = inspectRaidPlan(createPreviewRaid(5), 'gate');
  assert.equal(original.roles.tank, 5);
  assert.equal(original.ready, false);
  const plan = createCooperativePreviewRaid(), result = inspectRaidPlan(plan, 'gate');
  assert.equal(result.humanCount, 5);
  assert.equal(result.guildCount, 0);
  assert.deepEqual(result.roles, {tank:2, healer:5, melee:8, ranged:10});
  assert.equal(result.ready, true);
  assert.equal(inspectRaidPlan(plan, 'lava').ready, true);
});
test('three-tank encounter requires a deliberate role and assignment change', () => {
  const plan = createPreviewRaid();
  assert.equal(inspectRaidPlan(plan, 'pack').ready, false);
  // An illustrative hybrid switches from healer to tank, preserving 18 damage seats.
  plan.squads[1].members[1].role = 'tank';
  assert.equal(inspectRaidPlan(plan, 'pack').ready, true);
  assert.deepEqual(inspectRaidPlan(plan, 'pack').roles, {tank:3, healer:4, melee:6, ranged:12});
});
