# Nine-class progression implementation

User scope: all nine Classic classes; retain level 1–20 and current shared Northshire adventure map. User approved all classes in this session. Existing uncommitted implementation is the baseline; preserve it in place, no reset or unsolicited commit/deploy.

## Contract and tasks

1. Import pinned local SQL/DBC/reference talent sources into `data/classes-reference.json`. Export through catalog: `classDefinitions` and `raceDefinitions` arrays, `classAbilities` object keyed by class id, `classStartingItems` keyed by `race:class`, `classTalentTrees` flat array (each tree classId). Extend existing tables/spells/items and preserve mage exports. Each ability has current mage ability shape plus classId, previousSpellId, startingSpell. All talent records preserve existing shape and add classId. Source skill mechanics unsupported by combat must be explicit, never presented as functional.
2. Character/progression: `createGame(name,seed,now,{classId=8,raceId=1}={})`; strict playable combination validation. `newCharacter(name,classId=8,level=1,raceId=1)` initializes correct resources/spells. Race-aware stats/equipment/quest masks. Training validates class, level, previous rank, cost, location. Talent spend validates class, budget, tier, prerequisites and implemented status; reset refunds points and removes granted abilities. view adds creation options, character identity, resource, race traits, current-class skills and trees, talent availability and blocked reason. Preserve legacy mage saves.
3. Combat: class-appropriate default rules and handlers for all nine classes, distinct rage/energy/mana, healing, periodic effects, hunter/warlock pets, druid forms, paladin seals, shaman totems, supported racial effects and talents. Reuse deterministic existing battle engine; no arbitrary nondeterministic effects. Publish exact supported abilities/talents to progression/UI.
4. UI: all nine class/eight race creation choices constrained by combinations, current identity/resource display, class-specific spellbook and dynamic talent trees, prerequisites and reset. Clearly describe shared adventure geography and any unsupported reference nodes. API forwards creation options.
5. Verification: failing regression tests before runtime changes, every valid class/race creation; cross-class rejection; cost/rank/talent guards; meaningful combat effect assertions for every class; JSON save continuation; existing suite, syntax/type/build and browser smoke. Final review resolves actionable defects.

## Integration decisions

- Data owns catalog and generated reference/importer; progression owns character/engine/quests/recovery; UI owns app TSX/CSS/API; coordinator owns combat modules and support declarations.
- `class-support.js` will expose `supportedSpellNames`, `supportedTalentNames` Sets and `defaultClassRules(classId)`; progression imports these to filter actionable skills/nodes. Mage existing behavior stays available. Never charge for unsupported skills or talents.
- First integration targets all nine playable classes with real core mechanics. Reference data may exceed engine mechanics and must remain clearly disabled until supported.
- New races share the existing travel map as a stated 2D adaptation; this does not claim all original starting zones are implemented.

## Progress

- Context and source inventory complete. No existing task files reverted.
- Completed data import, all-class progression, combat integration, and class-aware UI. Eight races / nine classes / 40 legal combinations / 27 talent trees are wired to the engine.
- Completed regression and browser checks; independently reviewed and fixed hunter fallback, pet revival, stealth opener, out-of-combat periodic healing, shared Horde quest progression, and rank-two Strength of Earth.
- Verification details and explicit adaptation boundaries: `docs/research/import/all-classes-validation.md`. Full workspace test run is 340/341 with one concurrent profession module import failure; class-focused checks, syntax, TypeScript and production build pass.
