# Pet loyalty and training evidence

Implementation: `apps/web/lib/game/pet-progression.js`, integrated through existing pet summon, dismissal, update, kill-XP and training paths. No character or recovery files changed.

Pinned community source: [Pet.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Pet.cpp), loyalty tables lines 31–50, happiness/loyalty updates 731–910, XP and training-point leveling 1087–1140, newly tamed state 1143–1196. [Pet.h](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Pet.h) defines happiness band 333,000 and four active spell chains. Family eligibility and training costs use the separately pinned CreatureFamily/SkillLineAbility import.

- Happiness decreases every 7.5 seconds; loyalty changes every 12 seconds according to happiness. Positive default rate is 1. The source explicitly calls its 1.5 combat happiness-loss multiplier an estimate; this is not official-server validation.
- Loyalty promotion requires both loyalty points and 5% of owner-level XP (level 59 requirement at cap). Kill XP still advances loyalty at level cap. Promotion/demotion adds/removes pet level training points. Pet level increases add loyalty minus one points.
- Newly tamed pets have rebellious loyalty, 1,000 loyalty points, 166,500 happiness and no unearned training points. Existing stored points are preserved. Low rebellious loyalty uses the persisted RNG for desertion/aggression/stay outcomes.
- Training validates living hunter pet, Beast Training, idle/out-of-combat state, acquired spell, level, source family skill lines, four distinct active chains, and source point difference. Passive skills and rank upgrades do not consume new active slots. Downgrades cannot refund points; free skills remain learnable with negative training points, matching source checks.
- Loyalty points, remaining XP, happiness and timer remainders persist across dismissal/recall; live state and RNG persist through JSON continuation.

`apps/web/test/pet-progression.test.mjs`: eight tests pass. Combined pet/class effects/acquisition/public utility regression: 74 pass. Coverage plus pet-focused verification: 10 pass.

The durable coverage report distinguishes registry/executor inventory from targeted behavior tests. Its 1,759 supported player rows do not constitute 1,759 individually verified original-server behaviors.

## Acquisition chain repair

`pet-knowledge.js` exposes 47 sourced trainer teaching rows: Growl, Great Stamina, Natural Armor and five school resistances. The importer resolves nested teaching spells (for example trainer cast → owner Great Stamina wrapper → pet passive), retaining price, trainer ID and owner wrapper. Hidden client passive records remain `hidden-pet-reference`; their presence in old trainer data does not make them public training options.

Owner-known teaching wrappers populate only family-compatible pet `availableSkills`; pets must still pay the source training-point cost. Training Beast Training also grants its exact `spell_learn_spell` links (first two Growl wrappers). Learning a pet wrapper after summoning refreshes the existing pet. Pet-only spells are not silently applied to the hunter.

Wild pets use the source `PetSpellDataId` / `CreatureSpellData.dbc` override, falling back to explicit `petcreateinfo_spell`. The DBC is pinned at SHA256 `73fbb130f1cb465f2e802d726fc4ffc399037dd4e616f403dd9764afbb0b673a`. Pinned ObjectMgr.cpp lines 5104–5148 reverse-map actual pet spells to teaching wrappers; Pet.cpp 1950–2021 supplies innate skills and a 10-in-101 roll after real active skill use to teach the owner. The owner's knowledge survives abandoning the beast and can be taught to another eligible pet; unrelated wild/family skills remain unavailable.

`pet-training-acquisition.test.mjs`: four public-flow tests pass, including trainer → tame → Growl, paid trainer → existing pet availability, actual wild Bite use → owner knowledge → new pet, and paid passive training changing max health/armor/resistance without healing. A combined pet/data/coverage/acquisition run passed 32 tests. Every public pet trainer row resolves a checked-in icon and Chinese name using its pet spell identity.
