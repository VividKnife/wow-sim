# Game server

The game server owns account registration/login, revocable HttpOnly sessions, rate limits, CSRF checks, and the HTTP/WebSocket boundary around `GameService`. It does not accept client-supplied identity headers or bearer game tokens.

Set `DATABASE_URL` and `APP_ORIGIN` (local: `http://127.0.0.1:5173`), then run `node --env-file-if-exists=.env scripts/start-runtime.mjs` at the repository root. `HOST` defaults to `127.0.0.1`; `PORT` defaults to `8788`. The Web gateway only needs `GAME_SERVER_URL`.

`/api/auth/session` reads the current user; `/api/auth/login`, `/api/auth/register` and `/api/auth/logout` manage sessions. `/api/game/content` is public, versioned display data. `/api/game`, `/api/saves`, `/api/game/workshop`, `/api/game/replay` and `/api/events` require a valid cookie. Mutations and WebSocket upgrades require the configured origin. The browser uses REST baselines and WebSocket deltas; all simulation runs in simulation-host.

Production uses secure cookies and `AUTH_TRUST_PROXY_HOPS=1` behind Zeabur ingress. The HTML/API gateway preserves the ingress XFF chain. Keep the API private and prevent direct untrusted access. Local direct connections use `AUTH_TRUST_PROXY_HOPS=0` and the socket address. JSON responses support gzip with weak ETags; conditional requests retain empty 304 bodies.

Character and hunter-pet XP default to double (`GAME_XP_MULTIPLIER=2`). Values from 0 to 1000, including decimals, are accepted. Configure the same value on API and worker and restart both. Existing activities retain their starting rate. Profession skill and pet loyalty gains are unchanged.

The server also grants a permanent double movement speed buff. It multiplies base movement speed before mount bonuses and halves flight travel time.
