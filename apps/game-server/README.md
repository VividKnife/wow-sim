# Game server

The game server is the authenticated HTTP and WebSocket boundary around `GameService`. It trusts only short-lived HMAC bearer tokens issued by the web proxy; it never reads ChatGPT identity headers directly.

Set `DATABASE_URL` and a random `GAME_SERVER_SECRET` of at least 32 bytes, then run:

```powershell
node --experimental-strip-types apps/game-server/src/main.ts
```

The web runtime needs the same `GAME_SERVER_SECRET` plus `GAME_SERVER_URL`, normally `http://127.0.0.1:8788` for local work. `HOST` defaults to `127.0.0.1`; `PORT` defaults to `8788`. `/content` is public. `/game`, `/workshop`, and `/events` require a signed bearer token. The WebSocket endpoint currently serves Node or other clients that can set an `Authorization` header; the browser UI continues to use authenticated REST snapshots.

Set `GAME_XP_MULTIPLIER=2` for double character and hunter-pet XP (default `1`). Values from `0` to `1000`, including decimals, are accepted; `0` disables XP gains. Each reward is rounded down after scaling. The server grants a permanent Experience Bonus buff to players and companions; XP rewards are scaled by this buff. Quest reward displays and quest logs keep their base XP values. A rate of `1` removes the buff. Profession skill and pet loyalty gains are unchanged.

Configure the same value on API and worker and restart both. Newly started personal activities and instances retain their starting rate through background settlement, combat recordings, and browser simulation. Existing activities/instances finish at their original rate; start a new activity/instance to use the new setting. Idle quest turn-ins use the current server rate.
