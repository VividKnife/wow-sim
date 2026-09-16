# Foundation independent review

Date: 2026-09-16. Scope: uncommitted foundation changes relative to `2a2157f`; domain, persistence, HTTP server, worker and the engine integration they introduce. Reviewed the foundation implementation design and target architecture review. No implementation edits made by this reviewer. Findings were sent to the implementation agents as soon as reproduced; consequently some are already fixed in the live worktree. Paths below refer to the files/functions reviewed, including rules subsequently moved from `apps/web/lib/game` into `packages/game-domain/src/rules`.

**Final review status:** all concrete findings below are resolved in the reviewed worktree. Final independent targeted verification passed **46/46 tests**, including the three additional findings discovered during the second review. The detailed reproductions are retained as review history, not outstanding defects. The external PostgreSQL multi-connection validation limit remains.

## Reproduced actionable findings

### P1 — A participating character could complete and unlock another character's activity

Location: `packages/game-domain/src/service.ts`, `personalCommand` and `trackPersonal`.

Reproduction: create Hero and Helper at `now=1000`; set party to both; Hero starts `travel` to `northwood`; send `{type:'sync',characterId:helper,requestId:'helper-sync'}` without advancing time. Before that command both actor leases reference Hero's travel activity. Afterwards both leases are gone, the activity status is `completed`, and Hero remains at `northshire` with an idle activity.

Cause: a participant's lease identifies the shared activity, but its context restores only activities whose `actorId` is itself. `trackPersonal` therefore sees an idle Helper and marks Hero's activity complete. Reject commands submitted as a participant unless routed deliberately through the activity owner. This is also a combat/lease exclusivity issue, not just a travel display issue.

Follow-up observed: owner guard and `activity-ownership.test.ts` were added; regression test passes.

### P1 — Shared-instance guests receive companion-only automatic spell grants

Location: `packages/game-domain/src/instances.ts`, `startInstance` participant projection; engine `combat.js`, kill-reward loop containing `if(c!==s)c.learned=companionSkills(c)`.

Reproduction: create two human mage accounts, use a fixture to raise both to level 10 without learning additional abilities, have A create and B join `northshire-skirmish`, start and run `work(61000)`. B's `learned` array gains untrained abilities and even inappropriate racial/talent spells. Observed additions include `116`, `5504`, `7744`, `20554`, `20589`, `12472`, `11958`, `12043`, and `12042`. A's learned list remains unchanged.

Cause: the original engine's `party` meant AI companions; the new adapter now inserts player heroes into the same list without distinguishing their growth policy. Preserve explicit controller/character kind and never run companion progression for a player guest.

Follow-up observed: `a visiting player keeps their learned abilities after shared-instance kills` regression test was added and passes.

### P1 — Instance leader command routing bypasses domain economic restrictions

Location: `packages/game-domain/src/service.ts`, instance-lease command branch; `packages/game-domain/src/instances.ts`, `instanceCommand` direct call to `act`.

Reproduction: level-5 Hero at `goldshire`, wallet 10000, already knows herbalism and mining. `learnProfession alchemy` outside an instance correctly rejects with `PROFESSION_LIMIT`. Create/start `northshire-skirmish`, complete it with `work(61000)`, then send a fresh `learnProfession alchemy` request while still a participant. It succeeds and persists three primary professions.

Cause: leader actions bypass `personalCommand`'s cap and `startActivity`'s durable order/reservation flow. The same route admits raw `craft`, and gathering/travel can put an otherwise completed instance into an activity which the worker will not schedule. Define an explicit instance command set, share applicable invariant validation, and require leaving the instance for personal economic/background actions.

Final status: resolved by the explicit instance command boundary; `instance-command-boundary.test.ts` passes.

### P1 — Active personal activity roster can be changed to include unleased actors

Location: `packages/game-domain/src/service.ts`, `setParty` and `personalContext`.

Reproduction: create Hero and a free Helper; keep Hero's party initially solo. Hero starts travel. While Hero holds the activity lease, send `setParty` with `characterIds:[helper]` (the current actor need not be included). It succeeds because validation checks only the requested IDs. Hero's next snapshot includes Helper in its running activity context, but Helper has no lease and the durable activity `participantIds` still contains only Hero.

Cause: the active context derives participants from the mutable account party rather than its frozen activity participants. This allows simulation and persistence of a character that is still eligible for other jobs. Validate changes against both old and requested memberships and build an active activity's context from its own participant IDs.

Final status: resolved by old/new roster lease validation and activity-owned participant lists; `group-clock.test.ts` verifies rejection and ignores a separately altered party row during an active activity.

### P2 — Group persistence extends absolute cooldowns and does not advance member location/timeline

Location: `packages/game-domain/src/service.ts`, `persistMember`; `packages/game-domain/src/context.ts`, cooldown conversion; group context assembly.

Reproduction: create Hero and Helper at wall time 1000; set `Helper.professionReadyAt['category-310']=100000`; set party to both; Hero travels to `northwood`. Run the worker at 20000. Helper's absolute cooldown becomes **119000**, although it should remain **100000**. Its stored `clock` remains 0 and `wallAt` remains 1000. The same problem applies to `resourceReadyAt`. Repeated group settlements can continually postpone a cooldown. The completed trip also leaves Helper's durable location at `northshire` while Hero is at `northwood`.

Cause: member state retains its own old clock/wall time, but `persistCharacter` is called with the leader's new wall time and reconstructs an absolute deadline from an unadvanced relative deadline. Preserve absolute professional/resource deadlines unless that member actually changes them; propagate the group clock/wall time and travel result consistently.

Additional integration risk to validate with the repair: a Helper created after Hero has 100 seconds of simulation time starts at clock 0; a buff with 60 seconds remaining in Helper's time domain can expire immediately when the group sets Helper's `time` to Hero's clock. A consistent clock epoch or explicit schema-aware rebasing of simulation deadlines is required; copying only `clock` after the fact does not preserve remaining durations.

Final status: resolved by a common simulation epoch, explicit timestamp rebasing, shared member timeline/location persistence and deadline conversion using the state's wall time. Both fixed-deadline group travel and later-created member buff/cooldown regressions pass in `group-clock.test.ts`.

### P2 — Upgraded profession tools are accepted by the rule quote but rejected by reservation

Location: `packages/game-domain/src/activities.ts`, craft tool reservation loop; rules `professions.js`, `recipeQuote`/`hasTool`.

Reproduction: enchanting skill 100, recipe `spell-7418`, all required materials, only rod `6339` (the upgraded rod), no rod `6218`. `recipeQuote` reports `{id:6218,have:true}` because an upgraded rod substitutes correctly. Domain craft rejects `TOOL / 制造工具不可用` because reservation searches for exact `6218`.

The initial reservation also recorded only item definition/count and recreated tools via `receive`, losing the persistent tool identity and metadata. Resolve the actual acceptable tool through the same rule helper and reserve/return that exact UID and metadata.

Follow-up observed: upgraded-tool completion and recall identity tests were added and pass.

### P2 — Nested client view retains other participants' private rule state

Location: `apps/web/lib/game/client-snapshot.ts`, `clientView=pick(view,viewKeys)` / `clientView.party`; engine `view()` party projection.

The top-level `player.party` is projected with `actorView`, but `clientView.party` initially retained `view.party`, which spreads each member's entire rules object. Instance members include independent character contexts, so fields such as personal quest/completion history, professions and market/history/log state can pass to the other account. Likewise the battle presentation needs actor projection because its root actor can contain the entire simulation context. Recursive forbidden-key filtering is insufficient to enforce these ownership boundaries.

Final status: resolved by explicit nested actor and battle presentation projections; all three `apps/web/test/client-snapshot.test.mjs` tests pass, including entered dungeon and battle actor hidden-state checks. Root independently owns the two-real-client transport verification.

## Functional restriction to resolve explicitly

The initially reviewed `instanceCommand` allowed a non-leader only `strategy` targeting itself. This was a functional limitation, not an authorization vulnerability. The final implementation explicitly supports visitors' own strategy, recovery settings, supported mage manual combat casts and pet controls. Tests verify that casts spend only the visitor's resources and cannot spoof the caster, mutate the leader or use another account's character as a control target. Unsupported visitor inventory operations remain an explicit slice boundary rather than being silently redirected to the simulation root.

## Verification and limits

Ran the focused command against the then-current shared worktree:

```text
node --test packages/persistence/test/*.test.ts packages/game-domain/test/*.test.ts apps/game-server/test/*.test.ts apps/game-worker/test/*.test.ts
43 tests, 43 passed, 0 failed
```

This includes SQL schema/rollback/uniqueness tests and a persisted manufacturing restart using PGlite, HTTP identity/projection tests, worker scheduling, the actor-ownership regression, superior-tool identity tests and guest spell-progression regression. It does **not** establish external PostgreSQL multi-connection serializable retry behavior: the embedded test pool serializes its clients. No live external PostgreSQL was started by this reviewer, and this is a stated verification limit rather than an unproven defect.

The findings above are concrete integration failures from using the authoritative existing rules through new entity, clock and command boundaries. They do not object to retaining the existing JS battle engine's internal flat runtime representation.

## Final scoped re-review after integration fixes

The re-review read the relocated `packages/game-domain/src/rules` implementation and the new activity ownership, frozen roster, group clock, reservation, instance command boundary, visitor spell and explicit nested projection code. The original findings are not being reasserted. The following additional failures were reproduced against the updated worktree and sent immediately to root/domain ownership.

### P1 — Account-wide departure bypasses the leader protection through a companion

Location: `packages/game-domain/src/instances.ts`, `leaveInstance`.

Reproduction: A creates Hero and Helper; A creates a forming instance with `[Hero,Helper]`; B joins with its hero. A's `leaveInstance` as Hero correctly rejects `LEADER`. Submit the same operation with `characterId:Helper`: it succeeds, releases Hero and Helper's leases, removes both from the roster, and leaves B in an instance whose `leaderId` points to the removed Hero. The instance remains `forming`, and B cannot start it. In a started instance this can also leave the simulation rooted at a character that no longer owns an instance lease.

The guard checks the selected caller's ID, but the mutation removes every row belonging to that account. Check whether the complete removal set contains the leader before applying account-wide removal. Related cleanup: the runtime party filter originally removed only nonmercenary `ownedRows`, while the roster filter removed the account's mercenaries too; keep the roster and runtime participants consistent when a departing guest owns a mercenary contract.

Final status: resolved. Departure checks the whole departing set, removes its mercenaries from both runtime and roster, and ends the corresponding contracts. Both departure regressions pass in `instance-member-commands.test.ts`.

### P1 — Personal combat recall releases the actor while its persisted battle remains active

Location: `packages/game-domain/src/activities.ts`, `recall` and the `returning` settlement branch.

Reproduction: fresh Hero fixture at `northwood`; at time 1000 issue `hunt` for creature 6; run worker at 2100, confirming `state.combat` exists. Recall that personal activity, then run worker at 5100. The activity is cancelled and the actor lease is gone, but `snapshot.state.combat` is still present. `createInstance` then succeeds for the same character.

The returning branch changes the activity status and releases leases without clearing or safely finishing the personal battle persisted in `Character.rules`. Restrict recall to the background orders for which it is implemented, using the existing battle-safe stop path for personal combat, or implement a personal recall transition that resolves the battle before releasing its participants.

Final status: resolved by rejecting personal activities in the background recall operation. `recall-boundary.test.ts` verifies the battle and actor lease stay intact and a new instance cannot claim that actor.

### P2 — Unequipped bind-on-pickup assets can change character owner

Location: `packages/game-domain/src/service.ts`, `transferEquipment`; `packages/game-domain/src/rules/character.js`, `makeItem`/`equipFromBag`.

Reproduction: Hero and Helper in the same party; Hero owns a bag instance of item 80 (`bonding=1`) with `{bound:true}` and no `ownerId`, the exact binding representation emitted by `makeItem` for a freshly received reward. Issue `equip` with that UID and `target:Helper`. It succeeds, changes `items.ownerCharacterId` to Helper and sets `data.ownerId` to Helper.

`transferEquipment` checks only existing `data.ownerId`, which is assigned on equip, and misses the prior `bound:true` state. This contradicts the domain's explicit rejection of sending newly crafted bind-on-pickup output to another character. Either set binding ownership when the item is acquired, or reject an already bound persisted row changing ownerCharacterId. Newly binding bind-on-equip items should remain distinguishable from items that were already bound before the operation.

Final status: resolved by checking the persisted row's pre-operation bound state. `item-ownership.test.ts` passes, and the existing unbound equipment transfer regression still passes.

### Final independent verification

```text
node --test packages/game-domain/test/*.test.ts apps/web/test/client-snapshot.test.mjs packages/persistence/test/*.test.ts
46 tests, 46 passed, 0 failed
```

No outstanding reproduced P1/P2 issue remained in this scoped review after these fixes. This targeted result does not replace root's full repository regression, HTTP/WebSocket integration checks, or the separately stated external PostgreSQL validation limit.
