# Game server

The game server is the authenticated HTTP and WebSocket boundary around `GameService`. It trusts only short-lived HMAC bearer tokens issued by the web proxy; it never reads ChatGPT identity headers directly.

Set `DATABASE_URL` and a random `GAME_SERVER_SECRET` of at least 32 bytes, then run:

```powershell
node --experimental-strip-types apps/game-server/src/main.ts
```

The web runtime needs the same `GAME_SERVER_SECRET` plus `GAME_SERVER_URL`, normally `http://127.0.0.1:8788` for local work. `HOST` defaults to `127.0.0.1`; `PORT` defaults to `8788`. `/content` is public. `/game`, `/workshop`, and `/events` require a signed bearer token. The WebSocket endpoint currently serves Node or other clients that can set an `Authorization` header; the browser UI continues to use authenticated REST snapshots.
