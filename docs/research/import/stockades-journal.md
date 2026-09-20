# Stockades and Classic dungeon journal

Rebuild both artifacts with `python docs/research/import/import-stockades-journal.py`.
The importer uses the existing `extract_classic.read_sql` parser, which rejects
archives whose SHA256 differs from the pinned ClassicDB archive. No database is
executed, no network source or unpinned data is needed to regenerate gameplay.
Existing project localization and item icon maps supply presentation strings.

## Runtime integration

- `stockades-reference.json.tables` contains original object records, including
  quest templates, NPC templates and spawns, AI spells, equipment, loot and
  recursively required reference tables. Merge by the same keys as Deadmines.
- `questLinks`, `questXpByPlayerLevel` and `localization` merge with the existing
  catalogs. XP arrays cover player levels 1–60, using the existing core formula.
- `npcPlacements` maps each quest endpoint NPC ID to an array of world node IDs.
  New necessary nodes are `stockades`, `darkshire`, and `dunmodr`. The original
  NPC coordinates are also preserved. The Dark Iron War's four objective
  templates (1051–1054) and outdoor source spawns are included.
- Quest 2746 requires three Silk Cloth (4306, ordinary dungeon loot) and two
  Clara's Fresh Apples (8683). Apple object 142076 at map0 position
  (-9262.57, 356.955) uses gameobject loot table 5706; all are included.
- Quest 434 contains source targets 1754/1755. Its staged dialogue, fight and
  retry behavior belong to the quest event runtime; source records alone do
  not implement that event. Quest 396 rewards Seal of Wrynn (2933).

## Encounter adaptation

The map34 SQL has 105 creature spawn rows. The route retains all 87 ordinary
combat spawn GUIDs and selects one canonical placement for each of six named
bosses, producing 93 slots in 35 encounters. Alternate fixed-boss locations and
rare-pool substitute locations remain in the raw source tables. Bosses are
never duplicated merely because the source has alternate locations.

Ordinary random template choices retain their complete source membership and
uniform probabilities. The runtime must choose one alternative per GUID.
Pull grouping and route order are explicit 2D adaptations; they do not claim
original aggro radii, navigation geometry or original pull sizes.

Bruegal Ironknuckle's source pool45103 has four substitutes at 20% each, leaving
20% for four equal rare placements. The route uses one canonical rare location
with `rareChancePercent:20`. Resolve it deterministically once per instance and
persist presence/absence. Its rare encounter is optional.

## Journal

`dungeon-journal.json` contains self-contained presentation objects for 28
Classic dungeon wings, including the Classic ten-player Upper Blackrock Spire
dungeon. It excludes raids. Only Deadmines and Stockades are marked playable.
The curated roster includes rare, quest-summoned and optional bosses, and labels
named entrance-area encounters explicitly. Exact source English names are used
where the project's Chinese localization is unavailable.

Loot includes equipment, recipes, quest items and uncommon-or-better drops.
Shared grey and food drops are omitted from the journal presentation only;
the playable Stockades raw loot tables are complete. Reference loot expansion
honors reference group selection and retains every raw path to an item.
Chest of the Seven, Gordok Tribute, Malor's Strongbox and Jarien/Sothos rewards
are attached to their encounters with the chest source recorded.

Only direct independent unconditional positive source chances are displayed
as numeric probabilities. Grouped, conditional, quest, chest and nested
reference drops have `chance:null`; their raw chances, group, reference IDs,
condition IDs and repetition counts remain inspectable in `source.paths`.
This avoids treating per-reference rolls as final item drop probabilities.
Random property equipment is displayed before rolling its enchantment.

The journal is intentionally static client content, not per-save state. Global
green-item reference pools make it large; list UIs should offer a boss-specific
or quality filter while retaining the full reference-backed browse data.

## Validation

`node --test packages/game-data/test/stockades-content.test.mjs` verifies all
six Stockades bosses, every associated quest through Seal of Wrynn, objective
and endpoint dependencies, spell references, rare probability, all dungeon
wings, representative optional bosses, chest loot and nested reference paths.
The tests were first run without either generated artifact and failed, then
passed after import. Re-running the importer is deterministic.

### Combat review and real route benchmark

Run `node scripts/verify-stockades-combat.mjs 26 60`. The fixture grants the
starting level, learned class ranks, ordinary issued companion gear and food/
water. It does not modify combatant health after initial setup, source monster
stats, victory flags, quest credit or damage. Non-quest loot is disposed of
between encounters to isolate combat/recovery from vendor travel.

The final reviewed runtime cleared all 35 encounters and 93 spawned enemies
with seed812 at both level26 (43.67 simulated minutes) and level60 (23 minutes),
with no deaths. All six dungeon quests completed from actual kills and drops.
`stockades-combat-evidence.json` records the results. This is a deterministic
functional benchmark with prepared supplies, not a claim that every player
loadout or seed has the same difficulty.

`stockades-enemy-spells.test.mjs` covers source event9/range and event33/facing,
Strike weapon damage, Kick interruption, Dextren's triggered primary stun,
Chain Lightning's three nearest eligible targets and damage falloff, stance
passives/replacement and school-matched outgoing damage modifiers. The 2D
facing adaptation points actors toward their current combat/cast target.
Triggered effects have recursion and cycle guards. Spell dependencies include
recursive child spells and NPC stance passives in the imported reference.

NPC energy/rage costs are an explicit simulator adaptation: NPCs without the
corresponding resource pool execute these abilities under the existing AI
cooldown, range, control and cast checks, without charging mana or inventing
player resource bars. Mana abilities and player resource rules stay unchanged.
This enables the source Kick and Rend events; it is not a claim of verified
official behavior. The inspected pinned core sources were
[Creature.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Creature.cpp),
[Unit.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Unit.cpp), and
[Spell.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/Spell.cpp).

Run `node scripts/audit-stockades-spawns.mjs` to reproduce the random-population
audit. Among seeds1–1000, 348 did not contain enough of every quest387 target
for a single clear; minimum counts were 8 prisoners, 2 convicts, 10 insurgents.
The source random alternatives are preserved. Quest progress survives leaving
and resetting, so a second run can supply missing targets. The runtime does
not silently force a quest-friendly distribution. See
`stockades-spawn-audit.json` for requirements and example seeds.
