# Classic professions 1–300

User scope: complete level-60 Classic profession recipes; no additional maps or gathering nodes, no legacy save compatibility.

Design: pinned ClassicDB + vanilla DBC, exclude unobtainable/deprecated recipes with an auditable list. Preserve Chinese source item names, original reagents, quantities, tools, skill thresholds, specializations, cooldowns and enchant effects. Current convenience rule remains: recipes automatically become available at their skill requirement; original acquisition is described, no unreleased map prerequisite. Town workshops supply stationary facilities. All professions may be learned. Artisan rank reaches 300; no changes to character leveling or world geography.

Implementation:
- [x] Reproducible import, provenance, coverage and exclusions.
- [x] Profession ranks, skill gain, specialization, atomic tools/material purchases, cooldowns.
- [x] All enchant scrolls and full disenchant loot tiers; consumable tiers.
- [x] Search, pagination, requirements and source display.
- [x] Data coverage, transaction, progression and existing regression tests; typecheck and production build.

Boundary: recipe completeness does not imply implementation of every crafted engineering gadget, trinket proc, food buff or consumable combat effect. Model supported effects explicitly; retain source effect metadata for future combat work.

Validation and source audit: [classic-professions.md](../../research/import/classic-professions.md). Independent read-only review findings fixed; focused suites pass. Concurrent full-repository failures recorded separately.
