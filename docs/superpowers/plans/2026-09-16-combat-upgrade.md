# Combat Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and test-driven-development. User approved direct implementation on 2026-09-16.

**Goal:** Deliver spatial combat, effects, original creature icons, damage meters and per-member automatic strategies.
**Architecture:** Keep deterministic authority in the existing simulation. Render snapshots/events through a client-only PixiJS adapter with DOM fallback. Metrics are independent of the bounded display log.
**Tech Stack:** Existing JavaScript simulator, React/TypeScript, PixiJS, Node tests.
**Spec:** docs/superpowers/specs/2026-09-16-combat-upgrade-design.md

## Global constraints and rulings

- Work in the current checkout to preserve the extensive uncommitted playable implementation; no reset, bulk staging, commit, publication or new worktree.
- Preserve numeric `position` as x and add `positionY` as y. `point(unit)` exposes `{x,y}`. This is a backward compatible representation of the specified two-dimensional coordinates; all range checks must use `distance(a,b)`.
- New helpers: `combat-space.js`: point(unit), distance(a,b), moveToward(unit,target,range,clock,dtMs=100), moveAway(unit,target,clock,dtMs=100), effectiveSpeed(unit,clock), areaTargets(s,c,e,sp,center?).
- Metrics API: `recordMetric(s,actor,target,amount,detail)`, `finishCombat(s)`, `meterRows(battle,clock)`; snapshots retain old damage keys for compatibility.
- Rendering consumes s.combat/s.lastCombat, s.logs and battle.projectiles; no damage in animation callbacks. New logs include spellId, school, critical and periodic.
- Strategy agent owns engine.js, companion-combat.js, party.js, strategy.tsx and new auto-buff / strategy modules. Root owns combat.js, space module and NPC spatial integration. Renderer agent owns battle.tsx/css, combat-view.js, renderer files and dependency changes. Metrics/assets agent owns metrics module, creature manifest/icon assets and focused tests. Avoid shared-file edits without messaging.

## Tasks

- [x] Spatial combat: write failing tests for y-distance, slow/root movement and range-limited AOE; implement shared geometry; integrate player/NPC melee, spells, healing, ground effects and summons. Run `node --test apps/web/test/combat-space.test.mjs` then affected suites.
- [x] Projectile/event authority: test fireball only damages after its simulated flight, canceled targets and JSON restore consistency; implement serialized pending impacts and structured release events in combat.js; preserve old log compatibility.
- [x] Metrics/assets: test same-name actors, truncated logs, frozen duration and dungeon aggregation; implement metric accumulation and battle end finalizer; import original creature icons with source and checksum manifest, covering species fallback explicitly.
- [x] Strategies/buffs: test missing/expired buffs, resource/GCD handling, no duplicate casts, actor-specific rules and count thresholds; implement pre-pull preparation and party policies; expose controls in strategy.tsx. Keep priest healing priority and warrior stance limits.
- [x] Rendering: install pinned PixiJS in web app; implement browser-only lifecycle, spatial sprites, projectile/effect layers and DOM status overlay; add meter UI and responsive layout. Keep fallback, reduced motion, low-effect budget and cleanup.
- [x] Integration: run `npm test`, `npm run check`, web TypeScript check and web build. Repair regressions with focused failing tests. Run dungeon benchmark and browser fixture on desktop/mobile; inspect console and resource failures.
- [x] Review: independent bounded review of final simulator/UI integration; repair meaningful findings; update design status and validation record with actual outcomes.

## Test anchors

```js
assert.equal(distance({position:0,positionY:0},{position:3,positionY:4}),5);
const rooted={position:0,rootUntil:1000};
moveToward(rooted,{position:20},5,0,100);
assert.equal(rooted.position,0);
// DPS must be based on endedAt after battle completion, never the wall clock.
assert.deepEqual(meterRows(endedBattle,10000),meterRows(endedBattle,90000));
```

## Execution ledger

- Design approved; engine optionality approved. Baseline checkout contains pre-existing changes; they remain in place.
- Implementation, independent review and targeted repairs completed. Final full suite: 217 passing; syntax, TypeScript and production build passed. Desktop/mobile browser checks and six isolated dungeon benchmarks recorded in `../specs/2026-09-16-combat-upgrade-validation.md`.
- No commit/deployment. Original type icons are not NPC-specific texture animation; multiplayer networking and long-duration hardware profiling remain outside this implementation.
