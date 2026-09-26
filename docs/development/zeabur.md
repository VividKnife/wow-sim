# Zeabur 持续部署

仓库 `VividKnife/wow-sim`；开发和发布入口为 `main`，Zeabur 监听由 CI 生成的 `codex/zeabur-deploy`。项目 `6aaa9113905b4aaea95dae42`，环境 `6aaa91131d7bf7f6aa47cf7c`，现有服务 `6aaab302a91f86e0dd4fc7b1` 用作 Web。

游戏地址：https://wow-sim.zeabur.app ，登录入口：https://wow-sim.zeabur.app/login 。

| 已配置服务 | Zeabur Service ID |
| --- | --- |
| wow-sim（Web） | `6aaab302a91f86e0dd4fc7b1` |
| game-api | `6aab3fbf0f0f0a129012d01b` |
| game-worker | `6aab4071b6ad31c3b464b0b5` |
| postgresql | `6aab3a8c0f0f0a129012cd52` |

Web 的 `APP_ORIGIN=https://wow-sim.zeabur.app`，`GAME_SERVER_URL=http://game-api.zeabur.internal:8788`；三个代码服务均通过 `${POSTGRES_CONNECTION_STRING}` 引用数据库连接串。数据库使用 Zeabur PostgreSQL 18 模板。

## 服务配置

Web、API、worker 都连接同一 repo 的 `codex/zeabur-deploy`，Root Directory 为仓库根 `/`，Watch Paths 为 `*`，启用自动部署。不要把 apps/web 设为构建根，共享包在仓库根目录。

## 精简部署源码

2026-09-25 排查时，main 文件总量已达 3.12 GB，Zeabur GitHub 重部署返回 `504 Gateway Timeout`，未创建构建记录。官方上传接口可以正常部署后端，但完整 Web ZIP 为 1.38 GB，超过当前方案的 50 MiB 上传上限。精简 Web 源码包约 15.2 MiB。

CI 的 `validate` 成功后，`publish-deployment` 使用 `scripts/publish-zeabur.mjs` 将当前 main 导出到 `codex/zeabur-deploy`。该分支不含大型 public 资源、文档、临时资料和 GitHub workflows；R2 模式仅保留同源 model-viewer 运行文件和部署元数据；不要直接修改它。发布使用独立临时 Git index，不改动 main 的工作区，也不需要 Zeabur 密钥。GitHub Actions 仅发布 job 具有仓库内容写入权限。

常规 `WEB_ASSET_MODE=r2` 部署不下载完整源码归档，资源由 R2 提供。需要完整资源部署到 Zeabur 时，将 GitHub 仓库变量改为 `bundled` 并手动运行工作流；该模式构建时从固定 main SHA 下载源码归档并提取 public。详见 [R2 部署与切换](r2-assets.md)。开发分支仍完整保留全部资源。Web 的 `/__deployment.json` 和三个容器的 `/app/packages/DEPLOYMENT.json` 记录原始 main SHA；Zeabur 部署列表显示的是生成分支的提交 SHA，两者不同。

本地可运行 `node scripts/publish-zeabur.mjs` 检查生成结果；明确需要发布时运行 `node scripts/publish-zeabur.mjs --publish`。脚本只发布远端 main 的当前提交，重复执行同一版本不会再产生部署提交，推送以正常 fast-forward 完成。

| 服务 | 构建选择 | 运行变量 | 网络 |
| --- | --- | --- | --- |
| Web | 根 Dockerfile | DATABASE_URL、GAME_SERVER_URL、GAME_SERVER_SECRET、APP_ORIGIN、PORT=8080 | HTTPS 域名 → 8080 |
| game-api | ZBPACK_DOCKERFILE_NAME=runtime | DATABASE_URL、GAME_SERVER_SECRET、SERVICE_ROLE=api、PORT=8788、HOST=0.0.0.0 | 项目内网 8788 |
| game-worker | ZBPACK_DOCKERFILE_NAME=runtime | DATABASE_URL、SERVICE_ROLE=worker | 无公网，无 HTTP 健康检查 |
| PostgreSQL | Zeabur PostgreSQL 模板 | 模板生成的认证配置 | 内网、持久化卷 |

Dockerfile 选择变量是后缀 `runtime`，不是 `Dockerfile.runtime`。移除 `ZBPACK_IGNORE_DOCKERFILE=true`、旧构建/启动覆盖和静态输出目录配置；镜像管理启动命令。

API 的 Networking 只保留 HTTP 8788，删除平台初建服务时添加的 8080。随后将 Variable 中平台生成的 `PORT=${WEB_PORT}` 改为 `PORT=8788`，保存并 Restart；否则它引用已删除的默认端口，API 会启动失败。Web 保留 HTTP 8080，并绑定上述公网域名。修改环境变量后需要重启使其生效。

2026-09-17 验收：提交 `810ffb1` 的 main push 自动触发 Web、API、worker 三个部署；GitHub CI（含两份 Docker 构建）通过。HTTPS 线上验证通过注册、登录、Secure/HttpOnly/SameSite cookie、跨站请求拒绝、伪造身份拒绝、角色创建与恢复、跨账号隔离、退出会话撤销。验证产生两个随机命名的 `verify_` 测试账号，验证后已退出。

现有 Tencent Tokyo 2C 2GB 服务器首次部署出现过 MemoryPressure 与管理连接中断；重启服务器、顺序恢复服务后完成上述验收。此容量余量有限，后续发布应观察服务器内存及容器驱逐日志；需要扩容时保留数据库卷。

DATABASE_URL 使用 PostgreSQL 的内网连接串/跨服务变量引用。GAME_SERVER_URL 使用控制台显示的 API 内网域名及 8788 端口。GAME_SERVER_SECRET 为至少 32 字节随机值，Web/API 必须相同。APP_ORIGIN 是最终完整 HTTPS origin，如 `https://your-game.zeabur.app`，不要附带路径。秘密只在服务变量中配置，勿提交 Git。

认证来源限流默认信任一层入口代理（AUTH_TRUST_PROXY_HOPS=1），从 X-Forwarded-For 右侧读取客户端 IP。Web 只通过 Zeabur ingress 对外提供服务；不要直接公开容器端口。若增加额外反向代理，需按可信代理链修改该值，并确保入口覆盖或追加 XFF，勿信任用户伪造的前置地址。

## 独立账号

注册/登录入口 `/login`。用户名为 3–32 个 ASCII 字母、数字、下划线或短横线，不区分大小写；密码 12–128 字符。密码以带随机盐的 scrypt 哈希保存。七天有效的数据库会话只存 token 的 SHA-256 哈希；生产 cookie 使用 Secure、HttpOnly、SameSite=Lax；退出撤销会话。限流跨进程保存在 PostgreSQL。当前不提供邮件验证/密码找回，请保存好密码。

Web 只访问 `web_users`、`web_sessions`、`web_auth_limits`；游戏存档仍由 API/worker 管理。schema 使用 advisory lock 初始化，不迁移旧 ChatGPT 账号。

若登录后提示“账号在线状态无效”，说明游戏存档缺少有效的在线时间。点击创建会在一个事务中清除该账号旧角色、物品、活动和命令记录，再创建新存档，不迁移旧进度。相关多人副本会结束，其他参与者解除副本占用并保留已持久化的角色与资产。登录账号和密码不受影响；有效存档仍拒绝重复创建，创建失败会回滚清理。此修复需要部署更新后的 API 服务。

## 发布和验收

1. 配置 PostgreSQL、API、worker，再配置 Web 的内网地址、域名、APP_ORIGIN。
2. 修改规则或数据后运行 `npm run data:compile`，提交 manifest。
3. Push main；GitHub Actions 验证成功后更新精简部署分支，由 Zeabur 原生 GitHub 集成触发三个代码服务重建。
4. 核对部署分支提交、三个服务的构建/启动日志，以及 `/__deployment.json` 中的原始 main SHA。
5. 打开 HTTPS 网站，注册、创建角色、执行操作、刷新恢复；退出后 `/api/game` 返回 401；重新登录恢复角色，另一账号不能访问该角色。

CI 在 push/PR 运行验证，在 main push 或 main 手动工作流验证成功后发布部署分支。跨服务发布不是原子操作；内容版本更新前应结束旧版本活动，否则旧活动会停止结算。

```sh
npm ci
npm --prefix apps/web ci
npm run typecheck
node --test apps/web/test/account-store.test.ts apps/web/test/game-backend.test.mjs apps/game-server/test/*.test.ts apps/game-worker/test/*.test.ts
npm --prefix apps/web run build
docker build -t wow-sim-web .
docker build -f Dockerfile.runtime -t wow-sim-runtime .
```

容器排除 `.env`、`.dev.vars`、Git 和预览状态；数据库应保留持久化卷。不要删除数据库卷排查应用部署问题。

官方说明：[push 部署](https://zeabur.com/docs/en-US/deploy)、[Dockerfile 后缀](https://zeabur.com/docs/en-US/deploy/methods/dockerfile)、[Watch Paths](https://zeabur.com/docs/en-US/deploy/config/watch-paths)。
