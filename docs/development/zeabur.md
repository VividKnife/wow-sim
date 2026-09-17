# Zeabur 持续部署

仓库 `VividKnife/wow-sim`；生产分支 `main`。项目 `6aaa9113905b4aaea95dae42`，环境 `6aaa91131d7bf7f6aa47cf7c`，现有服务 `6aaab302a91f86e0dd4fc7b1` 用作 Web。

## 服务配置

Web、API、worker 都连接同一 repo 的 main，Root Directory 为仓库根 `/`，Watch Paths 为 `*`，启用自动部署。不要把 apps/web 设为构建根，共享包在仓库根目录。

| 服务 | 构建选择 | 运行变量 | 网络 |
| --- | --- | --- | --- |
| Web | 根 Dockerfile | DATABASE_URL、GAME_SERVER_URL、GAME_SERVER_SECRET、APP_ORIGIN、PORT=8080 | HTTPS 域名 → 8080 |
| game-api | ZBPACK_DOCKERFILE_NAME=runtime | DATABASE_URL、GAME_SERVER_SECRET、SERVICE_ROLE=api、PORT=8788、HOST=0.0.0.0 | 项目内网 8788 |
| game-worker | ZBPACK_DOCKERFILE_NAME=runtime | DATABASE_URL、SERVICE_ROLE=worker | 无公网，无 HTTP 健康检查 |
| PostgreSQL | Zeabur PostgreSQL 模板 | 模板生成的认证配置 | 内网、持久化卷 |

Dockerfile 选择变量是后缀 `runtime`，不是 `Dockerfile.runtime`。移除 `ZBPACK_IGNORE_DOCKERFILE=true`、旧构建/启动覆盖和静态输出目录配置；镜像管理启动命令。

DATABASE_URL 使用 PostgreSQL 的内网连接串/跨服务变量引用。GAME_SERVER_URL 使用控制台显示的 API 内网域名及 8788 端口。GAME_SERVER_SECRET 为至少 32 字节随机值，Web/API 必须相同。APP_ORIGIN 是最终完整 HTTPS origin，如 `https://your-game.zeabur.app`，不要附带路径。秘密只在服务变量中配置，勿提交 Git。

认证来源限流默认信任一层入口代理（AUTH_TRUST_PROXY_HOPS=1），从 X-Forwarded-For 右侧读取客户端 IP。Web 只通过 Zeabur ingress 对外提供服务；不要直接公开容器端口。若增加额外反向代理，需按可信代理链修改该值，并确保入口覆盖或追加 XFF，勿信任用户伪造的前置地址。

## 独立账号

注册/登录入口 `/login`。用户名为 3–32 个 ASCII 字母、数字、下划线或短横线，不区分大小写；密码 12–128 字符。密码以带随机盐的 scrypt 哈希保存。七天有效的数据库会话只存 token 的 SHA-256 哈希；生产 cookie 使用 Secure、HttpOnly、SameSite=Lax；退出撤销会话。限流跨进程保存在 PostgreSQL。当前不提供邮件验证/密码找回，请保存好密码。

Web 只访问 `web_users`、`web_sessions`、`web_auth_limits`；游戏存档仍由 API/worker 管理。schema 使用 advisory lock 初始化，不迁移旧 ChatGPT 账号。

## 发布和验收

1. 配置 PostgreSQL、API、worker，再配置 Web 的内网地址、域名、APP_ORIGIN。
2. 修改规则或数据后运行 `npm run data:compile`，提交 manifest。
3. 运行验证后 push main。Zeabur 原生 GitHub 集成触发三个代码服务重建，不需要额外 Zeabur token/webhook workflow。
4. 核对部署页的三个服务使用本次提交 SHA，构建/启动日志正常。
5. 打开 HTTPS 网站，注册、创建角色、执行操作、刷新恢复；退出后 `/api/game` 返回 401；重新登录恢复角色，另一账号不能访问该角色。

CI 在 push/PR 运行验证，但 Zeabur 是否等待 CI 取决于平台设置。跨服务发布不是原子操作；内容版本更新前应结束旧版本活动，否则旧活动会停止结算。

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
