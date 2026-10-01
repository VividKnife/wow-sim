# Zeabur 持续部署

仓库 `VividKnife/wow-sim`；开发和发布入口为 `main`，Zeabur 监听由 CI 生成的 `codex/zeabur-deploy`。项目 `6aaa9113905b4aaea95dae42`，环境 `6aaa91131d7bf7f6aa47cf7c`，现有服务 `6aaab302a91f86e0dd4fc7b1` 用作 Web。

游戏地址：https://wow-sim.zeabur.app ，登录入口：https://wow-sim.zeabur.app/login 。

## 日常发布：只需 push main

基础设施、R2 secrets 和 Zeabur GitHub 集成完成首次配置后，日常只需提交代码并 `git push origin main`。无需手动上传资源、更新部署分支或在 Zeabur 点击 Redeploy。

自动流程为：代码与浏览器检查 → 构建并保存前端产物 → 上传 R2 → 更新精简部署分支 → Zeabur 重建三个服务 → 等待线上版本并执行只读检查。开发分支与 PR 只验证，不发布生产环境。生成的 `codex/zeabur-deploy` 分支不触发此工作流。

Actions 的 `verify-deployment` 最多等待 20 分钟，核对线上 commit、buildId、资源版本和构建模式，并检查登录页面、未登录 API 响应、静态入口资源的 MIME/CORS 与 R2 发布完成标记。结果及版本写入 Actions Summary；等待超时或检查失败会令工作流失败。连续 push 时，旧运行会标记为 superseded，由新 main 的工作流负责发布验收。

此检查不会创建测试账号或修改玩家数据。另通过 `/api/health` 核对 API 构建身份、数据库连接、模拟线程就绪与规则/内容版本一致；仍不替代完整登录后玩法验收。需要完整端到端验证时仍可运行 `verify-online.mjs`。CI 检查失败会阻止发布，需要修复代码后再次 push；自动部署不绕过检查，也不会自动回滚。

| 已配置服务 | Zeabur Service ID |
| --- | --- |
| wow-sim（Web） | `6aaab302a91f86e0dd4fc7b1` |
| game-api | `6aab3fbf0f0f0a129012d01b` |
| game-worker | `6aab4071b6ad31c3b464b0b5` |
| postgresql | `6aab3a8c0f0f0a129012cd52` |

Web 的 `GAME_SERVER_URL=http://game-api.zeabur.internal:8788`；game-api 配置 `APP_ORIGIN=https://wow-sim.zeabur.app` 和 `AUTH_TRUST_PROXY_HOPS=1`。API/worker 通过 `${POSTGRES_CONNECTION_STRING}` 引用数据库连接串，Web 不需要数据库。数据库使用 Zeabur PostgreSQL 18 模板。

## 静态前端迁移配置

Web 已移除 Next.js，仅提供小型静态 HTML 和 `/api/*` 转发。上线本次迁移前，必须把 `APP_ORIGIN=https://wow-sim.zeabur.app` 配置到 **game-api**，并设 `AUTH_TRUST_PROXY_HOPS=1`（网关保持 Zeabur ingress 的 XFF，不额外追加一层）。API 仍仅在内网开放。Web 不再需要 DATABASE_URL、GAME_SERVER_SECRET 或 APP_ORIGIN；这几个变量可从 Web 移除。API 也不再需要 GAME_SERVER_SECRET。

构建、上传及版本一致性流程见 [R2 静态前端](r2-assets.md)。先发布 API 再发布 Web；这次 API 路由与认证机制一并改变，需安排短暂维护窗口，不提供旧 JWT/路由兼容层。

## 服务配置

Web、API、worker 都连接同一 repo 的 `codex/zeabur-deploy`，Root Directory 为仓库根 `/`，Watch Paths 为 `*`，启用自动部署。不要把 apps/web 设为构建根，共享包在仓库根目录。

## 精简部署源码

2026-09-25 排查时，main 文件总量已达 3.12 GB，Zeabur GitHub 重部署返回 `504 Gateway Timeout`，未创建构建记录。官方上传接口可以正常部署后端，但完整 Web ZIP 为 1.38 GB，超过当前方案的 50 MiB 上传上限。精简 Web 源码包约 15.2 MiB。

CI 的 `validate` 成功后，`publish-deployment` 使用 `scripts/publish-zeabur.mjs` 将当前 main 导出到 `codex/zeabur-deploy`。该分支不含大型 public 资源、文档、临时资料和 GitHub workflows；R2 模式只保留 CI 构建的主页面/查看器 HTML 与部署元数据；不要直接修改它。发布使用独立临时 Git index，不改动 main 的工作区，也不需要 Zeabur 密钥。GitHub Actions 仅发布 job 具有仓库内容写入权限。

常规 `WEB_ASSET_MODE=r2` 部署不下载完整源码归档，资源由 R2 提供。需要完整资源部署到 Zeabur 时，将 GitHub 仓库变量改为 `bundled` 并手动运行工作流；该模式构建时从固定 main SHA 下载源码归档并提取 public。详见 [R2 部署与切换](r2-assets.md)。开发分支仍完整保留全部资源。Web 的 `/__deployment.json` 和三个容器的 `/app/packages/DEPLOYMENT.json` 记录原始 main SHA；Zeabur 部署列表显示的是生成分支的提交 SHA，两者不同。

本地可运行 `node scripts/publish-zeabur.mjs` 检查生成结果；明确需要发布时运行 `node scripts/publish-zeabur.mjs --publish`。脚本要求匹配的 Vite 构建（R2 模式还要求上传完成回执），只发布远端 main 的当前提交，重复执行同一版本不会再产生部署提交，推送以正常 fast-forward 完成。

| 服务 | 构建选择 | 运行变量 | 网络 |
| --- | --- | --- | --- |
| Web | 根 Dockerfile | GAME_SERVER_URL、PORT=8080 | HTTPS 域名 → 8080 |
| game-api | ZBPACK_DOCKERFILE_NAME=runtime | DATABASE_URL、APP_ORIGIN、AUTH_TRUST_PROXY_HOPS=1、SERVICE_ROLE=game、PORT=8788、HOST=0.0.0.0 | 项目内网 8788 |
| game-worker | ZBPACK_DOCKERFILE_NAME=runtime | DATABASE_URL、SERVICE_ROLE=worker | 无公网，无 HTTP 健康检查 |
| PostgreSQL | Zeabur PostgreSQL 模板 | 模板生成的认证配置 | 内网、持久化卷 |

### 2.0 运行拓扑（发布目标配置，尚未修改线上变量）

上表的 game-api 改用 `SERVICE_ROLE=game`；旧环境如果显式保存了 `SERVICE_ROLE=api`，
发布前必须更新。runtime 镜像包含 simulation-host；一个容器内运行两个独立 Node 进程，
先启动模拟服务，再启动 API。Worker Threads 池仍属于模拟服务，默认一个线程。
只公开 API 的 8788，模拟 RPC 固定绑定 127.0.0.1，默认端口 8790，不配置公网路由。

组合模式自动为两个子进程生成同一临时服务令牌，也可使用显式 `SIMULATION_TOKEN`。
令牌不输出到日志、不发给浏览器，随容器重启更换不改变业务结算 ID。
`SIMULATION_URL` 留空或设为对应 `http://127.0.0.1:<SIMULATION_PORT>`，
误设外部地址会在启动前拒绝。`SERVICE_ROLE=api` 与 `SERVICE_ROLE=simulation` 仍用于明确管理的独立进程，
需配置匹配令牌；远程客户端继续要求 HTTPS，不为跨容器方便而放开明文私有接口。

任一子进程退出会停止另一进程，并以失败状态结束组合运行单元。正常关闭时先停止 API 接入，
再让模拟进程提交现有检查点；每个子进程最多等待 15 秒，超时强制退出并报告失败。
进程异常退出后的接管仍等待数据库执行权期限，不能跳过 fencing。
`GET /api/health` 只有数据库可访问、模拟线程完成初始化且规则/内容版本一致时返回 200；
否则返回不含内部错误的 503。探测合并并缓存一秒，避免每个探测重复查询数据库。

CI 使用实际 runtime 镜像和一次性 PostgreSQL 容器验证注册、常驻角色、真实输入、WebSocket 转发、
正常退出/重启和杀死模拟进程后的接管。它与完整模拟回归一起成为发布前置检查。
本地复现：`RUNTIME_IMAGE=wow-sim-runtime:local-qa node scripts/verify-production.mjs`。
不设置 RUNTIME_IMAGE 时用本地 Node 进程及隔离 PostgreSQL 运行同一流程。
这些测试只创建并清理自己命名的临时容器，不操作已有数据库或卷。

这次镜像与流程验收不代表已部署。正式切换还需完成玩法和网页验收、配置新的开发/发布 schema，
保留现有生产数据，并按目标服务器实测设置准入上限。

game-api 和 game-worker 默认提供 2 倍经验及永久经验加成 Buff。若在 Zeabur 控制台设置 `GAME_XP_MULTIPLIER`，两个服务必须都设为 `2`，否则显式配置会覆盖代码默认值。

Dockerfile 选择变量是后缀 `runtime`，不是 `Dockerfile.runtime`。移除 `ZBPACK_IGNORE_DOCKERFILE=true`、旧构建/启动覆盖和静态输出目录配置；镜像管理启动命令。

API 的 Networking 只保留 HTTP 8788，删除平台初建服务时添加的 8080。随后将 Variable 中平台生成的 `PORT=${WEB_PORT}` 改为 `PORT=8788`，保存并 Restart；否则它引用已删除的默认端口，API 会启动失败。Web 保留 HTTP 8080，并绑定上述公网域名。修改环境变量后需要重启使其生效。

2026-09-17 验收：提交 `810ffb1` 的 main push 自动触发 Web、API、worker 三个部署；GitHub CI（含两份 Docker 构建）通过。HTTPS 线上验证通过注册、登录、Secure/HttpOnly/SameSite cookie、跨站请求拒绝、伪造身份拒绝、角色创建与恢复、跨账号隔离、退出会话撤销。验证产生两个随机命名的 `verify_` 测试账号，验证后已退出。

现有 Tencent Tokyo 2C 2GB 服务器首次部署出现过 MemoryPressure 与管理连接中断；重启服务器、顺序恢复服务后完成上述验收。此容量余量有限，后续发布应观察服务器内存及容器驱逐日志；需要扩容时保留数据库卷。

DATABASE_URL 使用 PostgreSQL 的内网连接串/跨服务变量引用。GAME_SERVER_URL 使用控制台显示的 API 内网域名及 8788 端口。共享 GAME_SERVER_SECRET 已移除；认证和会话由 game-api 直接处理。APP_ORIGIN 是最终完整 HTTPS origin，如 `https://your-game.zeabur.app`，不要附带路径。秘密只在服务变量中配置，勿提交 Git。

认证来源限流默认信任一层入口代理（AUTH_TRUST_PROXY_HOPS=1），从 X-Forwarded-For 右侧读取客户端 IP。Web 只通过 Zeabur ingress 对外提供服务；不要直接公开容器端口。若增加额外反向代理，需按可信代理链修改该值，并确保入口覆盖或追加 XFF，勿信任用户伪造的前置地址。

## 独立账号

注册/登录入口 `/login`。用户名为 3–32 个 ASCII 字母、数字、下划线或短横线，不区分大小写；密码 12–128 字符。密码以带随机盐的 scrypt 哈希保存。七天有效的数据库会话只存 token 的 SHA-256 哈希；生产 cookie 使用 Secure、HttpOnly、SameSite=Lax；退出撤销会话。限流跨进程保存在 PostgreSQL。当前不提供邮件验证/密码找回，请保存好密码。

game-api 管理 `web_users`、`web_sessions`、`web_auth_limits` 及游戏存档；Web 不访问数据库。schema 使用 advisory lock 初始化，不迁移旧 ChatGPT 账号。

若登录后提示“账号在线状态无效”，说明游戏存档缺少有效的在线时间。点击创建会在一个事务中清除该账号旧角色、物品、活动和命令记录，再创建新存档，不迁移旧进度。相关多人副本会结束，其他参与者解除副本占用并保留已持久化的角色与资产。登录账号和密码不受影响；有效存档仍拒绝重复创建，创建失败会回滚清理。此修复需要部署更新后的 API 服务。

## 同步传输排查

2026-09-26 在线采样：25 人团本的完整 `/api/game` 响应为 4,572,241 B，未带 `Content-Encoding`；传输曾耗时 5–6.6 秒，随后出现连续 8 秒客户端超时。相同响应 gzip 后为 523,068 B（减少约 89%）。静态部署信息仍能正常返回，不能仅凭同步超时判断整个站点宕机。

game-api 在客户端接受 gzip 时异步压缩 JSON；Web 网关直接转发响应；设置 `Vary: Accept-Encoding`，压缩表示使用弱 ETag，并将条件请求映射回后端校验值。304 保持空响应。轮询失败后从请求结束起按 1、2、4、8、16 秒递增退避（带随机抖动，最多 30 秒，且不短于正常轮询间隔），成功后恢复正常频率，避免超时后仅等 16 毫秒便再次发起请求。

发布后需在浏览器 Network 核对 `/api/game` 的 `Content-Encoding: gzip`、实际传输体积和 304 命中。压缩不会减少服务端生成快照、团本指令补算或浏览器面板渲染的计算量；这些延迟仍需单独采样，不能将传输体积改善视为所有卡顿已消除。

## 发布和验收

1. 配置 PostgreSQL、API、worker；在 API 设置 APP_ORIGIN，在 Web 设置内网 GAME_SERVER_URL 与原有域名。
2. 修改规则或数据后运行 `npm run data:compile`，提交 manifest。
3. Push main；GitHub Actions 验证成功后更新精简部署分支，由 Zeabur 原生 GitHub 集成触发三个代码服务重建，随后自动等待线上版本并检查 Web/API/CDN。
4. Actions 全绿表示流水线与上述线上检查通过。失败时先查看失败 job；若是 `verify-deployment`，再核对三个服务的构建/启动日志及部署分支配置。
5. 大范围功能变更按需执行完整线上 E2E（见 [R2 验收说明](r2-assets.md#线上发布验收)）；不是日常部署的手动前置步骤。

CI 在 push/PR 运行验证，在 main push 或 main 手动工作流验证成功后发布部署分支。跨服务发布不是原子操作；内容版本更新前应结束旧版本活动，否则旧活动会停止结算。

```sh
npm ci
npm --prefix apps/web ci
npm run typecheck
node --test apps/web/test/account-store.test.ts apps/game-server/test/*.test.ts apps/game-worker/test/*.test.ts
npm --prefix apps/web run build
docker build -t wow-sim-web .
docker build -f Dockerfile.runtime -t wow-sim-runtime .
```

容器排除 `.env`、`.dev.vars`、Git 和预览状态；数据库应保留持久化卷。不要删除数据库卷排查应用部署问题。

官方说明：[push 部署](https://zeabur.com/docs/en-US/deploy)、[Dockerfile 后缀](https://zeabur.com/docs/en-US/deploy/methods/dockerfile)、[Watch Paths](https://zeabur.com/docs/en-US/deploy/config/watch-paths)。

## 2.0 首次实测发布

runtime 镜像默认 `GAME_DATABASE_SCHEMA=wow_sim_v2`，API、模拟服务和后台业务 Worker 使用相同 schema。启动仅创建该 schema 和其中的新表，不删除、覆盖或迁移原有 public 数据；查询不回退 public。首次使用需要重新注册测试账号、创建角色，原账号和存档仍保留在旧数据区。切回旧镜像需同步恢复旧运行角色配置，不能让旧代码读取新 schema。

API 服务需把 `SERVICE_ROLE=api` 改成 `game`；业务 Worker 保持 `worker`。默认模拟线程为 1。该版本用于玩家实测，完整玩法和容量验收尚未结束。[离线与回收规则](instance-lifecycle.md)。

### 规则更新后的个人实例

模拟检查点按可执行规则和内容版本隔离。更新这些文件后，旧个人实例不能直接恢复；新版本在旧实例执行租约过期后，将其永久封存，并从已提交的角色和资产记录创建新实例。未结算的战斗和活动会结束，已保存的等级、金币和物品保留。执行权尚未过期时请求会暂时失败并自动重试；共享实例仍需单独结束或处理，不自动拆散其他玩家的队伍。纯前端改动不改变模拟规则版本。
