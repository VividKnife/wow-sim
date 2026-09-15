# Classic reference bundle

Status: **reference-only, not official verified**. This is a reproducible extract of the user-approved CMaNGOS ClassicDB archive. It is not Blizzard data certification and not a complete combat engine.

## Files and reproduction

- `classic-reference.json`: compact runtime data, approximately 8.4 MB. Each table has row arrays with original numeric/string/null values. `schemas[table]` gives exact column order.
- `classic-reference.objects.json`: equivalent full object records, approximately 41 MB, convenient for research/build-time transforms.
- `quests.inspect.json`: readable quest records and source endpoint links.
- `extract_classic.py`: Python 3.12 standard library parser/extractor. Rejects a SHA256 mismatch; handles MySQL escaped/doubled quotes, nulls, numerical values, delimiters inside strings, and asserts record widths. Does not execute SQL.
- `gameplay-reference.json`: derived quest XP arrays for player levels 1–20 plus mage starter/trainer ability rank IDs. Kept separate from raw records.
- `build_gameplay_reference.py`: rebuilds derived convenience data.
- `core-provenance.json`, `QuestDef.cpp`, `Formulas.h`: separately pinned CMaNGOS core source and URLs; retain upstream license headers.

Rebuild:

```powershell
python C:/workspace/wow-sim-research/data/extract_classic.py C:/workspace/wow-sim/.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz
python C:/workspace/wow-sim-research/data/build_gameplay_reference.py
```

Decode one table in JavaScript:

```js
const records = bundle.tables.quest_template.map(row =>
  Object.fromEntries(bundle.schemas.quest_template.map((column, i) => [column, row[i]]))
);
```

Identifiers: `quest_template.entry`, `creature_template.Entry`, `item_template.entry`, `spell_template.Id`. Other joins preserve source capitalization. Human race is 1. Warrior class is 1, rogue 4, priest 5, mage 8. Class/race restrictions are bitmasks, with each class represented by `1 << (classId - 1)`; zero means unrestricted where applicable. Item restrictions often use -1.

## Scope and spatial limits

97 quest records: all human/mage-eligible source quests with QuestLevel through20 in Northshire9, Elwynn12, Westfall40, Stormwind1519; Deadmines1581 through22; local mage class quests; Deadmines aftermath373; recursive explicit prerequisites. Minimum player level must be <=20. This is a source-zone scope, not a claim that every holiday/profession/world quest physically obtainable in these cities is in scope. Prerequisites can leave the selected regions (e.g.2041 Speak with Shoni, in Ironforge). Preserve these as reference dependencies; the app must deliberately support or explain travel outside its playable map.

All creature templates with MinLevel<=25 are included, plus regional NPCs and quest targets; the compendium therefore includes many outside-region creatures. All map36 spawns are included. Map0 spatial rectangles used for NPC/object inclusion are approximate: Elwynn x[-10200,-8500], y[-1600,1000]; Westfall x[-11400,-9800], y[0,2400]; Stormwind x[-9200,-7900], y[200,2200]. They include neighboring boundaries and are not client zone polygons. Source coordinates are not modified. `links.regionalCreatureIds` identifies this spatial selection.

## Joining gameplay data

- Quest endpoints are in `links.quests[questId].starts` / `.ends`, with types creature/gameobject/item. Source relation tables are also retained. Item starters come from `item_template.startquest`.
- Quest creature objectives use positive `ReqCreatureOrGOIdN`; negative values designate gameobject entries. Item IDs/counts, spell-cast targets, source items, rewards, conditions, time limits and chain fields are retained. Read flags/scripts for event objectives; a zero kill/item count does not automatically mean a talk-only quest.
- `PrevQuestId`, `NextQuestId`, `NextQuestInChain`, `ExclusiveGroup`, and `BreadcrumbForQuestId` have distinct core semantics. Negative previous IDs can mean an active prerequisite; do not blindly take absolute IDs in the game engine. Extraction takes absolute dependencies only to retain the referenced record.
- `npc_trainer.spell` is usually a **teaching wrapper spell**, not the player combat spell. Follow spell effect36 (LEARN_SPELL) and that effect's `EffectTriggerSpellN`. Example1142 teaches116 Frostbolt Rank1. Cost is copper; reqlevel is the trainer requirement.
- Creature health/mana/melee/armor source fields and multipliers are both retained. Avoid multiplying already-authored explicit values a second time. Source class-level baseline tables are included for proper core calculations.
- Creature `LootId`, `PickpocketLootId`, `SkinningLootId` link to the respective loot table's `entry`. Negative `mincountOrRef` is a reference-table link; `item` on such rows is not necessarily an item ID. Positive/zero `ChanceOrQuestChance`, negative quest chances, and groupid need core loot semantics. Zero chance in a group is not a zero-probability item.
- `player_levelstats` carries human STR/AGI/STA/INT/SPI; `player_classlevelstats` carries class base HP/mana. These are not total player health/mana before applying attributes. XP table uses lvl and xp_for_next_level.
- `SpellLevel`, not merely English name, identifies rank scaling. EffectBasePoints is an encoded effect field; do not display it as the exact final damage without dice, level scaling and aura/effect rules. Source effect fields and coefficient overrides are included.

## Explicit gaps

No Talent.dbc tree placement/rank prerequisites; no SpellCastTimes.dbc/SpellDuration.dbc/SpellRange.dbc index resolution; no CharStartOutfit.dbc standard equipment (`playercreateinfo_item` has no rows). Spell records include talents but do not define a tree. Some spell IDs can refer to absent client/core definitions; see `links.missingSpellIds`. The bundle preserves quest scripts but does not implement escort, exploration, gameobject, dungeon encounter or AI behavior. UI translations should be marked as translations, not source originals.

## Core formula reference

Pinned core: 8ec338a1704e7dcb1c0213eb7ed58f9231ade40f. Quest XP for positive quest levels<=60 derives from RewMoneyMaxLevel /0.6, rounded upward. Full value applies through player level quest+5; differences6/7/8/9 use80/60/40/20%; later differences use10%. Server configuration can modify awarded XP. Dynamic/nonpositive quest levels are deliberately unresolved in the derived helper.

Kill XP starts at playerLevel*5+45. Higher targets add5% per level, capped at4 levels. Lower targets use the source zero-difference/triviality rules. Elite multipliers depend on map type; creature ExperienceMultiplier, damage attribution, server rates, and rounding apply. Core group rates are1 for1–2 members,1.166 for3,1.3 for4,1.4 for5; the source explicitly describes that group formula as guesswork. Group member allocation requires additional reward logic. See the pinned files for precise branch and rounding semantics.
