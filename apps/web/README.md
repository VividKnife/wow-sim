# wow-sim Web

React + Vite static application. `main.tsx` loads the session from game-api, then lazy-loads login, save selection and game panels. `server.mjs` is a small HTML/API gateway with no framework or database dependency.

Use Node.js 24.11.1+. Install dependencies at the root and in apps/web. Configure `APP_ORIGIN=http://127.0.0.1:5173` and PostgreSQL in the root `.env` for game-api. Start API and worker, then run `npm run dev` here. Vite proxies `/api` to `GAME_SERVER_URL` (default `http://127.0.0.1:8788`).

`npm run build` writes `dist`; `npm start` serves it on PORT (default 8080). For that origin, configure game-api's APP_ORIGIN accordingly. `WEB_ASSET_MODE=r2 npm run build` emits direct versioned CDN URLs; the default bundled build serves assets locally.

Authentication and rate limits live in game-api. The gateway forwards cookies and requests without interpreting identity. The API validates HttpOnly sessions and mutation origins. Browser Worker engine data remains in versioned boot, class and on-demand shard files, never a monolithic JS catalog.

See [R2 build and deployment](../../docs/development/r2-assets.md) and [Zeabur configuration](../../docs/development/zeabur.md).

## Classic game UI demo

The signed-in game now defaults to the Classic interface. Below its icon bar,
**切换为网页 UI** switches to the previous web layout; **切换为经典 UI** switches
back from the top of that layout. The browser remembers this preference. Both
layouts share the same mounted game session, command queue, character and save;
switching does not restart travel, combat or progress.

Classic menus use the existing quest, NPC, inventory, party, dungeon, raid and
PvP implementations. The page remains scrollable, with detailed damage and
journey records below the scene. See [integration and QA notes](../../docs/design/classic-ui-integration.md).

From the repository root, run `npm run demo:classic-ui`, then open
`http://127.0.0.1:5198/classic-ui.html`. This standalone preview includes a
classic-style HUD, eight menu windows, running and mounted character animations,
region switching, and five-person practice battles using the existing engine.
Desktop party/DPS overlays become scrollable detail panels on mobile. The 25-person
frame is a layout preview. No account or saved character is required or modified.
See [demo notes and asset provenance](public/demo/classic-ui/README.md).

## Journey UI V2 preview

Run `npm run demo:journey-ui` at the repository root and open
`http://127.0.0.1:5199/journey-ui.html`. This isolated preview implements the real
Northshire quest loop in a worker, with a 20-level five-member fixture and a mount.
It does not read or write real saves. Reloading resets the fixture. The first load
of the development content catalogue can take a while; model assets also load on demand.
The V1 preview remains at port 5198, `/classic-ui.html`, with its source archive in
`docs/design/classic-ui-v1-2026-09-23.tar.gz`. V2 also serves that unchanged page.
Design decisions, coverage, screenshots and remaining scope: `docs/design/classic-ui-v2.md`.

Classic 世界地图、旅行背景和副本操作栏的实现与验收见 [设计验收记录](../../docs/design/classic-world-and-dungeon-ui.md)。场景图片来源与导入信息保存在 `docs/research/import/scene-backgrounds-manifest.json`。
