# Vite 静态前端与 R2

入口保持 `https://wow-sim.zeabur.app`。Web 是无依赖 Node HTTP 网关，只返回主页面、登录页、模型查看器的少量 HTML，以及 `/__deployment.json`；`/api/*` 流式转发至 game-api。HTML 不含用户资料，使用 `Cache-Control: no-store`。React、JS/CSS、图标、模型、音频和引擎数据分包从 `https://wow-sim.dota.run` 直接加载，不经过 Zeabur 重定向。

账号认证、密码校验、数据库会话、限流及 CSRF 校验归 game-api 管理。浏览器通过 `/api/auth/session` 获取登录状态；API 从 HttpOnly cookie 验证身份，不再使用 Web 签发的共享密钥 JWT。game-worker 和数据库职责保持不变。

## 构建与加载

- `npm --prefix apps/web run build` 默认构建本地 `bundled` 模式；`WEB_ASSET_MODE=r2 npm --prefix apps/web run build` 构建 R2 模式。`R2_ASSET_ORIGIN` 是构建变量，默认 `https://wow-sim.dota.run`，不能仅修改运行环境来切换已编译 URL。
- Vite 将登录、游戏、世界、角色、队伍、副本、团本、PvP、战斗拆为动态模块，由 React `lazy()` / `Suspense` 加载。游戏脚本不会在登录页提前加载。
- public 资源地址为 `public/<public Git tree SHA>/…`；构建资源为 `web/<commit>-<build UUID>/…`。每次构建有独立目录，重复构建同一 commit 也不会覆盖已发布的文件。
- 两个 Worker 使用 ES module 输出。跨域时通过一个同源 Blob 引导模块静态 import R2 Worker，保留加载期间的消息队列；terminate 时释放 Blob URL。运行模块继续动态 import。
- 浏览器规则解析器仍使用 boot、9 个职业预取包和按需数字分片，保留请求合并、失败重试、版本检查和内存预算。所有包位于同一构建的 `simulation-content/<规则版本>/<包>.json.gz`；R2 对象必须有 `Content-Type: application/json` 和 `Content-Encoding: gzip`。
- 构建同时处理源码、CSS、JSON 与压缩规则包内的资源引用。game-api 返回展示数据时使用部署元数据中的 public 前缀；本地模拟的原始检查点不改写，否则会破坏权威状态校验。
- 构建插件拒绝把完整 catalog / reference 数据打入浏览器或 Worker。`scripts/verify-web-build.mjs` 检查微小 HTML、懒加载模块、Worker 入口大小与完整分包目录。
- 模型查看器保留同源 iframe HTML，bridge 等模块从 R2 导入，postMessage 校验仍为同源。移除了必须同源提供脚本的查看器 Service Worker，使用 HTTP 缓存。按装备动态查询的第三方外观资料及其受限模型 relay 仍属于 `/api/model-viewer/*`；它们不是仓库内已发布的静态资源。公共展示数据的按需查询仍使用 `/api/game/content`。

## 发布顺序

GitHub Actions：验证 → **构建一次并保存 artifact** → 上传 public 与同一 artifact 到 R2 → 发布包含对应 HTML 的部署分支 → Zeabur 部署。

`publish-r2-assets.mjs` 先上传所有对象，最后写 `__release.json` 和本地 `.r2-upload.json` 回执。发布脚本校验源 commit、public tree、构建模式和产物摘要；缺少匹配上传回执时拒绝 R2 部署。生成分支不重新构建前端，也不包含 public、JS/CSS 或引擎压缩包。game-api 的 `packages/DEPLOYMENT.json` 和 Web 的元数据来自同一 artifact。

上传身份仅在 CI 使用，不进入浏览器或 Web 容器：

```sh
npm ci
npm --prefix apps/web ci
WEB_ASSET_MODE=r2 npm --prefix apps/web run build
node scripts/verify-web-build.mjs
# R2_ACCOUNT_ID、R2_BUCKET、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY 由环境提供。
node scripts/publish-r2-assets.mjs --source HEAD --upload
WEB_ASSET_MODE=r2 node scripts/publish-zeabur.mjs --publish
```

上传源必须是与工作区 public 一致的提交。构建输出 `apps/web/dist` 不提交到开发分支，由 CI artifact 传递。旧版本目录保留，避免已打开页面的延迟模块请求失效。上传器不删除其他版本。

## Cloudflare 配置

R2 bucket `wow-sim` 使用自定义域名 `wow-sim.dota.run`，允许入口跨域读取：

```json
[{"AllowedOrigins":["https://wow-sim.zeabur.app"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag","Content-Length","Content-Range","Accept-Ranges"],"MaxAgeSeconds":3600}]
```

JS module、Worker 子模块、字体和数据包均需要有效 CORS。静态对象使用一年 immutable 缓存，API 不使用此公共资源 CORS。改变 CORS 后清理已有域名缓存。不要对版本目录配置 SPA HTML fallback；缺失 JS 必须返回 404。

## 本地与 bundled 模式

本地 `vite` 提供资源及静态规则包，代理 `/api` 至 `GAME_SERVER_URL`。`bundled` 生产模式由轻量网关提供本地资源，适合离线于 R2 的验证或部署；同样不包含 Next.js。

仓库变量 `WEB_ASSET_MODE` 默认为 `r2`。切换至 `bundled` 后手动运行主分支工作流，或 push main；生成部署分支携带 Vite 产物，并在构建容器时下载固定源 SHA 的 public。切换模式必须重新构建发布，不是运行时开关。

## 验证

```sh
npm run typecheck
npm --prefix apps/web run typecheck
node --test apps/game-server/test/*.test.ts apps/web/test/account-store.test.ts
node --test apps/web/test/local-simulation-boot.test.mjs apps/web/test/local-simulation-client.test.mjs
node --test apps/web/test/static-web.test.mjs scripts/publish-zeabur.test.mjs scripts/publish-r2-assets.test.mjs
WEB_ASSET_MODE=r2 npm --prefix apps/web run build
node scripts/verify-web-build.mjs
node scripts/verify-production.mjs
# 需要 Playwright；可用 PLAYWRIGHT_MODULE 和 CHROME_PATH 指向已安装运行环境。
node apps/web/scripts/verify-browser.mjs
```

浏览器验证使用独立内存存档、PGlite 认证及模拟 CDN 响应，不使用线上数据库或上传线上资源；检查真实跨域 module Worker、职业包、检查点提交、桌面/手机截图，以及没有静态请求回到入口。线上仍需核对实际 R2 CORS、gzip 元数据、CDN 命中和当前发布版本。

### 线上发布验收

完成发布后运行 `WEB_QA_COMMIT=<线上源提交> node apps/web/scripts/verify-online.mjs`。默认目标为 `https://wow-sim.zeabur.app`，可用 `WEB_QA_ORIGIN` 覆盖。此脚本会在目标环境创建独立测试账号和法师存档，执行登录、狩猎、经验落盘、检查点、地图、桌面/手机截图、刷新和退出验证；不访问现有玩家存档。报告与截图默认保存到 `/tmp/wow-online-qa`（可用 `WEB_QA_OUTPUT` 覆盖）。测试数据保留在独立账号中，测试会话退出后失效，密码不写入报告。

流量校验只统计 HTTP(S) 请求；跨域 Worker 的 `blob:` 引导及模型纹理 Blob 位于浏览器内存，不产生 Zeabur 流量。主动退出后的在途游戏请求返回 401 属于会话撤销的预期结果。
