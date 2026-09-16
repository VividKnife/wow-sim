# Human mage 1–20 quest audit

This is a read-only audit of the current imported 97 quest templates, not proof of a completed playthrough. The Site checkout was not modified. `quests-97-audit.json` records every quest, all imported objective sources, endpoint locations, and static blockers. `audit.mjs` regenerates that report from the live checkout.

## Highest priority fixes

1. Resolve alternative creature spawns. The extraction missed `creature_spawn_entry` and `spawn_group_entry` + `spawn_group_spawn`. The supplement includes 680 regional alternative spawn rows, and 52 applicable groups. They explain missing Riverpaw Runt 97 / Outrunner 478 (quest 11, item 782), Murloc Forager 46 / Lurker 732 (quest 46, item 780), and the Deadmines *outdoor entrance cave* undead 623/624/625/626 (quests 167/168, items 1875/1894). Join GUIDs, not template IDs. Keep the outdoor cave distinct from instance map 36. Group 120 contains Foreman Thistlenettle 626.
2. Add omitted northern Westfall shoreline spawns: Murloc Coastrunner 126 blocks quest 152; original x -9580 to -9690 lies north of the extraction rectangle. Add Captain Grayson 392 at (-11407.1,1966.15) to lighthouse; just 7 yards outside the old rectangle caused quests103/104/152 to have no endpoint.
3. Add Captain Sander chain endpoints GO34 Old Jug (-9797.29,1594.66), GO33 Locked Chest (-9794.49,2107.64). They sit just outside the old rectangle and block quests139/140.
4. Add remote delivery endpoints: Mountaineer Stormpike1343 (-4825.92,-2676.82), northern Loch Modan, for353; Gnoarn6569 (-4835.97,-1260.58), Ironforge, for2041. Magis1228 and Dink7312 are optional alternative starts for1919;328 is already available. Do not relocate actual NPCs to arbitrary regions.
5. Implement exploration62/76. They have SpecialFlags2 and area triggers88/87; the inspected engine never awards their event flags. Represent entering/exploring the mine, not a free remote completion action.
6. Implement escort155. NPC467 must travel from Sentinel Hill to the secret entrance at Moonbrook and may be attacked/die. The quest text requires escort and proximity. Update 2026-09-16: the initial extraction missed the capitalized `Entry` column; 45 `script_waypoint` rows do exist in the pinned database. See `escort-155-reference.json`. Its walk/credit points37/45 differ from the newer reference core's65/94; matching path timing and encounter composition still need verification. Simply visiting Sentinel/Moonbrook is not enough.
7. Implement mage item-use chain described below.

## Mage interactions: exact IDs and evidence

**1861 Mirror Lake.** Accept gives item7207 Jennea's Flask. At the waterfall base southwest of Stormwind, use spell8919 (Effect24 creates item7206). Item7207 has -1 charge, meaning one-use consumption. Quest1861 requires7206; it is not an event-flag quest. A generic event flag cannot complete it.

**1920 Blue Recluse.** Quest objective text says obtain tools behind Jennea. GO105174 loot4768 yields7247 Chest of Containment Coffers; GO105175 loot4769 yields7308 Cantation of Manifestation. Both loot rows are quest-only -100%, one item. Bring tools to the tavern and use7308/spell9095. NPC6492 Rift Spawn then becomes aggressive/visible. Imported creature AI rows649201–649210 specify:

- Spawn invisible with9093, passive, immune to being reduced below1HP.
- Spell9095 starts aggressive phase1, followed by manifestation9096 /9738.
- Below1% HP, stun9032 for30seconds, make not-selectable, phase2.
- Phase2 hit by Attract Rift Spawn9012 creates filled containment coffer via9010, phase3; despawn after2.5seconds.
- Uncaptured phase2 despawns after29.5seconds.

Item7247 uses9082, has10charges and8second item cooldown. Item7308 uses9095 with10second cooldown. Generated GO103574 loot4589 yields7292 at -100% quest-only chance, one item. Repeat capture three times. Quest consumes7292×3,7247×1,7308×1. It must not be normal Rift Spawn kill loot or a timer that hands out three filled boxes.

**1921 Gathering Materials →1941 Manaweave Robe.** Requires2589 Linen Cloth×10 and7249 Charged Rift Gem×6. GO271 Miners' League Crates, loot1677, contains7249 one at a time with -100% quest chance. Original crate positions are in Silver Stream Mine, Loch Modan near(-4900,-2980), not Elwynn Mirror Lake. All14 source spawns included. Turn in at Wynne Larson1309; dbscripts_on_quest_end1921 temporarily removes questgiver flags then restores at9500ms after tailoring animation.1941 awards7509; preserve original reward.

## Source-count distinction

Imported quest579 Stormwind Library is a Method0 repeatable item exchange, not an attainable level1–20 quest despite its nominal QuestLevel1. Required item3898 Library Scrip is granted by quest578 The Stone of the Tides (MinLevel32, QuestLevel37) in the full pinned database. The full original quest578 record is in the supplement. Do not invent a new vendor/drop or free scrip to force all97 imported rows to finish at20. A faithful stage has96 stage-completable templates and a visible future-level exchange; tests should prove that distinction. [WoWhead item3898](https://www.wowhead.com/classic/item=3898/library-scrip) independently describes the same provenance, but primary evidence here is the pinned SQL.

## Files and provenance

- `supplement-source.json`: original unmodified source records for missing endpoints, alternative spawn relations, raw coordinates, item/spell definitions, mage object loot, AI and DB scripts, quest578.
- `extract_supplement.py`: reproducible extraction; validates original gzip SHA256 before parsing.
- `quests-97-audit.json`: full static report; a source-present status is explicitly not execution verification.
- Original source: `cmangos/classic-db` commit22b51464f1625f6ef6275771de1f5466c6f5d19e, archive SHA2564f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0. This is community1.12 reference data, not official2019 verification.

## General implementation checks still required

- Event completion, source item restoration, abandon/reaccept cleanup, unique item limits, bag-full acceptance and rewards must be atomic.
- Method0 exchanges should not appear as normal quest-log errands before the required item exists.
- `itemSources` must inspect reference-loot recursively and source/provided/vendor/generated paths; the currently inspected helper scans direct creature/object loot only.
- Gatherables must distinguish reusable scenery from respawnable loot; repeated clicking should not bypass object respawn or source item uniqueness.
- Quest source items which do not appear in ReqItemId (e.g. treasure-clue pages1358/1361/1362) require proper lifecycle cleanup.
- Westfall Stew36 is recipe delivery2832 to Salma;38 is four ingredient objectives729/730/731/732×3. It does not require cooking profession or fabricated crafting.

The above reports do not certify all quests executable. Root should rerun endpoint/objective-source closure after import and then test normal actions on each special chain.
