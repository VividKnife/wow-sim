# Stockades and Dungeon Journal Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and review tasks. Preserve unrelated worktree edits.

**Goal:** Deliver playable Classic Stockades, its complete quest chain, and a browsable Classic dungeon journal.

**Architecture:** Register dungeon definitions by ID and store saved runs by ID. Import traceable content separately from rules. Serve a presentation-only journal to React through the static clientContent boundary.

**Tech Stack:** Node 24, JavaScript/TypeScript, React/Next, node:test, Classic-DB extraction scripts.

## Tasks

- [x] Import content using `docs/research/import/extract_classic.py` helpers and the pinned `.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz`: create `stockades-reference.json`, `dungeon-journal.json`, importer and data integrity tests. Include quest/NPC/item/spell/loot dependencies and encounter definitions.
- [x] Add `rules/dungeon-registry.js`; refactor `dungeon.js`, `dungeon-view.js`, `content.ts`, `instances.ts`, `context.ts` and `engine.js` for explicit content IDs, saved runs by ID, isolated reset and dynamic presentation. First test entering Stockades and independently resuming both dungeons. Run `node --test apps/web/test/dungeon*.test.mjs packages/game-domain/test/dungeon-progress.test.ts`.
- [x] Integrate tables/localization/quest links/world endpoints in `catalog.js`; add `rules/stockades-quests.js` for the investigation and attack event. Test availability, predecessor chains, rewards, abandoned/failed event retry and no duplicate credit with `node --test apps/web/test/stockades*.test.mjs`.
- [x] Add `rules/dungeon-journal.js` presentation and expose `dungeonJournal` through static `clientContent` and `dungeons` through `view`. Build `dungeon-page.tsx` and CSS into searchable overview/detail/boss/loot views. Generalize `dungeon.tsx` entry and current-run copy. Test catalog filtering and browser interactions.
- [x] Run service-level Stockades lifecycle and real combat validation; review spec coverage and code quality. Run `npm run data:compile`, `npm test`, `npm run check`, `npm run typecheck`, `npm --prefix apps/web run build`. Document observed results and source limitations in `docs/development/stockades.md`.

## Interface contract

`dungeonJournal` is an array of `{id,name,zone,minimumLevel,recommendedLevel,description,playable,bosses:[{id,name,rare,description,loot:[{id,name,icon,quality,level,slot,armor,damage,speed,stats,source,chance}]}]}`. `dungeons` maps playable ID to the same shape as existing `dungeon` view plus `id`, `entrance`, `zone`, `description`. Commands `enterDungeon` and `resetDungeon` accept `contentId`. `dungeon` continues to describe the active run or current entrance selection, not journal UI selection. `dungeonSaves` maps content IDs to saved run state, replacing the single saved run field.
