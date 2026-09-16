# 游戏运行环境

需要 Node 24.11.1+ 和 PostgreSQL。网页仍使用现有 React/Vinext 构建；权威游戏服务和活动 worker 是独立进程。

| 进程/包 | 职责 | 数据访问 |
| --- | --- | --- |
| `apps/web` | UI、ChatGPT 身份、同源校验、短期令牌签发与 API 代理 | 不连接游戏数据库 |
| `apps/game-server` | `/game`、`/content`、`/workshop`、`/events`，DTO 投影与权限边界 | 通过 `PostgresStore` |
| `apps/game-worker` | 主动结算到期活动与实例 | 通过 `PostgresStore` |
| `packages/game-domain` | 账号、角色、资产、活动、实例与确定性规则 | 只依赖 `Store` 接口 |
| `packages/game-data/data` | 编译后的静态内容与版本摘要 | 只读 |

```sh
npm ci
npm --prefix apps/web ci
npm run data:check
docker compose up -d postgres
```

将根 `.env.example` 复制为 `.env`，生成至少 32 字符的随机 `GAME_SERVER_SECRET`。示例数据库账号仅用于本地开发。三个进程分别运行：

```sh
npm run game:server
npm run game:worker
npm --prefix apps/web run dev
```

API 与 worker 使用根 `.env`。Web 的 Cloudflare Vite 开发运行时从忽略提交的 `apps/web/.dev.vars` 读取相同的 `GAME_SERVER_SECRET` 和 `GAME_SERVER_URL`：

```dotenv
GAME_SERVER_URL=http://127.0.0.1:8788
GAME_SERVER_SECRET=与根 .env 完全相同的随机值
```

Web 的已认证入口签发短期账号凭据，Node 服务不会信任客户端自行填写的身份头。跨机器部署时，`GAME_SERVER_URL` 必须是 Web 服务能够访问的 HTTPS 地址，并在 Sites 运行环境中配置这两个变量。

数据库 schema 在进程启动时由事务与 PostgreSQL advisory lock 初始化；资产、执行租约、活动到期索引和业务唯一键独立于模拟快照。Web 没有 D1 绑定、Drizzle 依赖或本地迁移步骤，也没有读取旧 `game_saves` 的回退路径。历史开发账号需要重新创建角色。

## 使用流程

创建主角后，在“账号名册与共享副本”创建长期伙伴、设置出战名册。切换角色可管理其独立背包、金币、技能与专业；生活职业页面会创建后台制造或采集活动。已有出战成员受同一活动租约保护，要外派请先让其离队。采集和制造订单支持召回；返回完成后释放角色。

共享实例由一方创建并把实例编号告知另一玩家，各账号只能加入自己拥有的角色。成员全部加入后队长开始；可选佣兵合同按实例扣费。北郡遭遇用于通用运行器验证，死亡矿井保持原有五人、等级和地点条件。10/20/40 席位是编排能力，不代表对应规模的完整副本内容已经制作。

浏览器关闭不会停止活动或实例。worker 关闭后到期活动留在数据库，重新启动继续处理。客户端目前采用 REST 快照轮询；Node `/events` 提供带认证的 WebSocket 快照订阅；`subscribe` 设置 `mode: "delta"` 后，首包为完整投影，后续使用带基础 revision/sequence 的增量事件，重新订阅补全快照。浏览器尚未接入此 WebSocket 身份入口。

## 内容更新与验证

内容位于 `packages/game-data/data`。更新导入数据、注册遭遇或模拟规则后运行 `npm run data:compile`，提交同时覆盖数据和规则源文件的 SHA-256 manifest；API、worker 和客户端响应使用同一内容版本。运行中活动版本不匹配时会保留记录并停止结算，不能静默使用新内容。当前只加载一个版本，因此内容发布前应完成旧版本活动，或保留运行旧版本的服务。

```sh
npm test
npm run check
npm run typecheck
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web
npm --prefix apps/web run build
```

本地 SQL 集成测试使用 PGlite 的实际 PostgreSQL SQL/事务，并测试数据库导出、重载后订单恢复。这不能替代外部 PostgreSQL 多进程争用、真实网络连接、压测和真机验收。
