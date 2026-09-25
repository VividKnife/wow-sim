# Game worker

The worker actively settles due activities and instances through `GameService.work`. It schedules the next iteration only after the current one finishes, so slow database work cannot overlap itself.

Set `DATABASE_URL`; optionally set `GAME_WORKER_INTERVAL_MS` and `GAME_WORKER_LIMIT`. Then run:

```powershell
node --experimental-strip-types apps/game-worker/src/main.ts
```

`SIGINT` and `SIGTERM` stop the scheduler, wait for an active iteration, and close the PostgreSQL pool.

Set `GAME_XP_MULTIPLIER=2` for double character and hunter-pet XP (default `1`). Values from `0` to `1000`, including decimals, are accepted; `0` disables XP gains. Each reward is rounded down after scaling. The server grants a permanent Experience Bonus buff to players and companions; XP rewards are scaled by this buff. Quest reward displays and quest logs keep their base XP values. A rate of `1` removes the buff. Profession skill and pet loyalty gains are unchanged.

Configure the same value on API and worker and restart both. Newly started personal activities and instances retain their starting rate through background settlement, combat recordings, and browser simulation. Existing activities/instances finish at their original rate; start a new activity/instance to use the new setting. Idle quest turn-ins use the current server rate.
