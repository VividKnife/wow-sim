# Server and Worker Implementation Report

## Delivered scope

- `apps/game-server` now exposes a Node HTTP server with authenticated `GET /game`, `POST /game`, `GET /workshop`, public versioned `GET /content`, and authenticated `WS /events`.
- `apps/game-worker` owns a non-overlapping active scheduler around `GameService.work(now, limit)` and drains the active iteration on shutdown.
- `apps/web/app/api/game/**` is a thin proxy. It obtains the authenticated ChatGPT user, performs strict same-origin mutation validation, signs a short-lived account token, and forwards to the configured game server. The old D1 save/write path and browser control lease are absent from the route.
- Standalone server and worker entry points initialize `PostgresStore`, construct `GameService`, and close HTTP/WebSocket/timer/database resources on `SIGINT` or `SIGTERM`. Importing their modules does not start a process.
- Server DTO/content helpers now resolve from `packages/game-domain/src/rules`; static source data resolves from `packages/game-data/data`. No server or worker import points back into the Web application.

## Security boundary

The backend derives `accountId` only from an HMAC-SHA-256 bearer token with audience `wow-sim-game`. Tokens require a secret of at least 32 bytes, expire after 60 seconds when issued by the web proxy, and can never exceed five minutes. The game server never reads `oai-authenticated-*` headers. Claimed `accountId`, `userId`, and `sub` command fields are removed before dispatch; ownership and shared-instance authorization remain enforced by `GameService`.

WebSocket authentication uses an `Authorization` header and therefore currently targets Node or other non-browser clients. It calls `GameService.snapshot(authenticatedAccountId, characterId)`. Default subscriptions send full projected snapshots; explicit `mode: "delta"` sends a full baseline and revision/sequence-guarded changes, with full snapshots on resubscription. Browser UI synchronization remains on the authenticated REST path.

## HTTP and cache behavior

- `/game` and `/workshop` require a signed identity and return projected DTOs or allowlisted workshop rows.
- `/content?version=<current>` returns an ETag and one-year immutable caching. A wrong version returns `409`; an unversioned request is `no-store`.
- Domain errors preserve their HTTP status, public message, and code. Unexpected exceptions return a generic `500` response.
- The web proxy forwards only `Accept`, `Content-Type`, `If-None-Match`, its signed `Authorization`, and safe response metadata. Missing or invalid `GAME_SERVER_URL` / `GAME_SERVER_SECRET` fails closed with `503`; there is no D1 fallback.

## Runtime configuration

The server requires `DATABASE_URL` and `GAME_SERVER_SECRET`; `HOST` and `PORT` are optional. The web runtime also needs `GAME_SERVER_URL` and the same secret. The worker requires `DATABASE_URL`, with optional `GAME_WORKER_INTERVAL_MS` and `GAME_WORKER_LIMIT`. Example environment files and direct Node type-stripping commands live in each app directory. No deployment action or remote data operation is included.

The Web package no longer declares a D1 binding, Drizzle dependencies, migration scripts, or game database types. PostgreSQL remains exclusively behind `packages/persistence`.

## Verification coverage

Boundary tests cover token tampering/expiry/weak secrets, two authenticated accounts, DTO secret-field projection, unauthorized character selection, command identity stripping, invalid character creation, exact content version caching, WebSocket snapshot sequence/revision, web-proxy fail-closed behavior, CSRF origin enforcement, worker overlap/shutdown, and a real `MemoryStore` + `GameService` HTTP creation/isolation flow.

Final commands and outcomes for this slice:

- Server/worker/proxy targeted suite: 18/18 passed, including a two-client shared-instance WebSocket integration.
- Root TypeScript check: passed.
- Web TypeScript check: passed.
- Web production build: passed and emitted `/api/game`, `/api/game/content`, and `/api/game/workshop`.
- Root JavaScript syntax check: passed.

The production API route has no browser control lease or `game/session` dependency. The root integration pass removed that obsolete helper and updated the remaining dungeon rule coverage to worker-driven semantics.

External PostgreSQL was not started for this slice. Persistence has its own embedded compatibility tests; the standalone wiring is type-checked against `PostgresStore` and `pg.Pool`.
