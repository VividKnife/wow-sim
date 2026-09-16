# Recovery source and remaining fidelity checks

Pinned community core: `cmangos/mangos-classic` commit `8ec338a1704e7dcb1c0213eb7ed58f9231ade40f`.

- [SpellAuras.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/SpellAuras.cpp): `HandleModRegen` sets food's initial periodic timer to 5000 ms and defaults its period to 5000 ms. The `SPELL_AURA_MOD_REGEN` periodic handler restores the aura amount.
- [StatSystem.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/StatSystem.cpp): `UpdateManaRegen` divides `SPELL_AURA_MOD_POWER_REGEN` by 5 and includes it during the five-second rule. Player regeneration applies elapsed seconds and truncates the combined amount.
- `client-rules-reference.json` provides duration table 85 = 18000 ms and 86 = 21000 ms. Food and drink have separate expiry timestamps; one must not extend the other.
- [Unit.h](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Unit.h): immunity to players is `0x100`, untargetability is `0x10000`, spawning/not attackable is `0x2`. These exclude invalid outdoor hunt targets without maintaining a pet-name blacklist.

These are community reference semantics, not official 2019 server verification. In particular, a nominal 17-health-per-five-seconds food aura lasting 18 seconds yields three discrete ticks in this core, whereas the tooltip duration calculation implies about 61 total health. This discrepancy is open and requires a 2019 combat-log/client-behavior source; do not label the current food timing exact. Low-level spell critical chance also remains on the numerical audit list.

Tests exercise reference duration, MP5 conversion, separate expirations, five-second-rule recovery, and offline chunk invariance. They do not prove original-server parity.

## Party recovery implementation, 2026-09-16

- [Unit.cpp, OCTRegenHPPerSpirit](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Unit.cpp#L11884): per-second health formulas now replace the earlier generic estimate: mage `0.11*Spirit+1`, priest `0.15*Spirit+1.4`, rogue `0.84*Spirit-13`, warrior `1.26*Spirit-22.6`.
- [Player.cpp, RegenerateHealth](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Player.cpp#L2383): nonnegative amount, sitting multiplier 1.5, multiply elapsed seconds and truncate. Golden no-equipment level-18 human fixtures verify all four classes.
- Each dungeon member consumes their own food/water from the shared player bag. Existing rest does not consume again when requested repeatedly; leaving or combat cancels recovery. Missing supplies stop progression. Offline instance time freezes food/drink as well as natural recovery.
- Priest Resurrection rank 1, source spell 2006: level 10, 10-second cast, 75% base mana, effect 113 with 70 health / 135 mana. [SpellEffects.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/SpellEffects.cpp#L4796) confirms flat values for RESURRECT_NEW. Source spell and DBC cast row already existed in imported data; original icon and current Classic Chinese display name were added to the companion asset manifest.
- **Open approximation:** corpse return still uses the existing 10-second 2D recovery action with 50% health/mana, extended to fallen companions inside and outside instances. This is not a graveyard route, corpse-reclaim delay, durability-loss or original ghost-travel implementation. Those remain required fidelity work before final release; priest spell resurrection has its separate source-based values.
