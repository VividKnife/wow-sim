# wow-sim Web

Next.js Node application providing the game UI, independent username/password accounts, and an authenticated game API proxy. Game state remains owned by the separate API and worker.

Use Node.js 24.11.1+. Install dependencies at both the repository root and apps/web. Copy `.env.example` to `.env.local`, configure PostgreSQL, the API URL and shared secret, and run `npm run dev` here. Open the exact APP_ORIGIN (default `http://localhost:5173`).

`npm run build` produces the Node production build; `npm start` listens on 0.0.0.0 and respects PORT. Root Dockerfile builds this service. Vite is retained only for isolated UI fixtures in scripts/serve-dungeon-preview.mjs.

The Web owns only authentication tables (web_users, web_sessions, web_auth_limits). It derives game identity from a validated HttpOnly session cookie, then signs a short-lived token for the game API. Caller-supplied identity headers are never trusted. Register/login at `/login`; logout revokes the database session. Game state is accessed through lib/game-backend.ts, not directly through SQL.

See [Zeabur deployment](../../docs/development/zeabur.md) for service variables, automatic deployment and verification.
