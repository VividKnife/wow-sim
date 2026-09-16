# Game worker

The worker actively settles due activities and instances through `GameService.work`. It schedules the next iteration only after the current one finishes, so slow database work cannot overlap itself.

Set `DATABASE_URL`; optionally set `GAME_WORKER_INTERVAL_MS` and `GAME_WORKER_LIMIT`. Then run:

```powershell
node --experimental-strip-types apps/game-worker/src/main.ts
```

`SIGINT` and `SIGTERM` stop the scheduler, wait for an active iteration, and close the PostgreSQL pool.
