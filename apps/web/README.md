# wow-sim Web

This Vinext application renders the game UI and provides the authenticated Web proxy. It does not own authoritative saves or run the simulation. `/api/game` and `/api/game/workshop` obtain the dispatch-owned ChatGPT identity, sign a short-lived account token, and forward to the Node game server. `/api/game/content` proxies immutable public content.

## Requirements

- Node.js 24.11.1 or newer
- A running game server and worker; see [game-runtime.md](../../docs/development/game-runtime.md)
- `GAME_SERVER_URL` and the same 32-byte-or-longer `GAME_SERVER_SECRET` used by the game server

Install and run the portable development server:

```sh
npm ci
npm run dev
```

For the Cloudflare Vite development runtime, put the backend values in an ignored `apps/web/.dev.vars` file:

```dotenv
GAME_SERVER_URL=http://127.0.0.1:8788
GAME_SERVER_SECRET=replace-with-the-same-random-secret
```

The local Sites helper simulates ChatGPT sign-in only on loopback. Visit `/signin-with-chatgpt?return_to=/` to sign in as the local test user and `/signout-with-chatgpt?return_to=/` to sign out. Hosted authentication remains dispatch-owned.

## Runtime boundary

- `app/chatgpt-auth.ts` reads the trusted identity headers supplied by Sites.
- `app/api/game/**` performs authentication and same-origin mutation checks, then calls `lib/game-backend.ts`.
- The proxy forwards an HMAC token containing only the authenticated account subject. It does not forward `oai-authenticated-*` headers.
- Missing backend URL, missing/weak secret, or an unavailable backend fails closed. There is no local save fallback.
- The browser currently refreshes REST snapshots. The Node server also exposes authenticated WebSocket snapshots for clients that can send an `Authorization` header.

The Web project has no game database binding, Drizzle schema, or migration command. PostgreSQL is owned by `apps/game-server`, `apps/game-worker`, and `packages/persistence`.

## Sites and authentication

The Sites initializer stores its ignored execution profile in `.sites-runtime/execution-profile.json`. On portable hosts, `npm run dev` uses Vinext HMR on port 5173. Managed Linux preview sessions remain supervised by the Sites tooling. Generated `.sites-runtime/`, `.vinext/`, `.wrangler/`, and `dist/` directories are disposable.

Signed-in requests may contain:

- `oai-authenticated-user-id`, the stable per-Site account key
- `oai-authenticated-user-email`, for display/contact only
- optional percent-encoded `oai-authenticated-user-full-name`

Use `getChatGPTUser()` for API identity and `requireChatGPTUser(returnTo)` for protected server pages. Start sign-in through the dispatch-owned `/signin-with-chatgpt` top-level navigation. Do not implement or call the underlying AuthAPI flow directly.

## Commands

- `npm run install:ci`: locked dependency install used by the Sites workflow
- `npm run dev`: local Vinext development server
- `npm run build`: production Sites artifact
- `npm run start`: local preview of the built Worker
- `npm run lint`: Web linting

`npm run build` emits the UI plus `/api/game`, `/api/game/content`, `/api/game/workshop`, and the model-viewer relay. It does not deploy the Site or start PostgreSQL, the game server, or the worker.
