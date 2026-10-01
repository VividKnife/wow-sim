# 游戏运行环境

需要 Node 24.11.1+ 和 PostgreSQL。网页使用 React/Vite 静态构建；权威游戏服务和活动 worker 是独立进程。

| 进程/包 | 职责 | 数据访问 |
| --- | --- | --- |
| `apps/web` | 静态 HTML、UI 与 API 流式代理 | 不访问数据库 |
| `apps/game-server` | `/api/auth/*`、`/api/game`、`/api/game/content`、`/api/game/workshop`、`/api/events`，账号会话、DTO 投影与权限边界 | 通过 `PostgresStore` |
| `apps/simulation-host` | 常驻战斗实例、单写者 Worker 池与检查点 | 通过持久化协调层 |
| `apps/game-worker` | 非常驻活动的到期业务 | 通过 `PostgresStore` |
| `packages/game-domain` | 账号、角色、资产、活动、实例与确定性规则 | 只依赖 `Store` 接口 |
| `packages/game-data/data` | 编译后的静态内容与版本摘要 | 只读 |

```sh
npm ci
npm --prefix apps/web ci
npm run data:check
docker compose up -d postgres
```

将根 `.env.example` 复制为 `.env`，设置 `APP_ORIGIN=http://127.0.0.1:5173` 与数据库地址。示例数据库账号仅用于本地开发。组合运行时会启动并监管 API 和模拟服务；业务 worker 与网页分别运行：

```sh
node --env-file-if-exists=.env scripts/start-runtime.mjs
npm run game:worker:dev
npm --prefix apps/web run dev
```

本地开发命令会在导入的规则或内容文件变化时重启 API 和 worker。已经开始的旧版本活动不会自动迁移；读取游戏状态、操作角色时，服务端会自动脱离卡死并结束旧活动，无需玩家手动操作。此操作保留已保存的角色、金币和物品，但不补发尚未结算的收益。

API 与 worker 使用根 `.env`。`APP_ORIGIN` 是浏览器访问的完整 origin，用于 API 的 CSRF 校验；本地默认 `http://127.0.0.1:5173`。`AUTH_TRUST_PROXY_HOPS=0` 用于本地直连；生产经 Zeabur ingress 使用 `1`。

Web 的 `.env.local` 只需按需要设置 `GAME_SERVER_URL=http://127.0.0.1:8788`。R2 模式在构建时设置 WEB_ASSET_MODE 与 R2_ASSET_ORIGIN，见 [静态资源部署](r2-assets.md)。Web 不再读取数据库或持有认证密钥。

game-api 验证数据库中的 HttpOnly 会话，不信任客户端自行填写的身份头。Zeabur 同项目部署使用 API 内网 HTTP 地址；跨公网通信需 HTTPS。生产 **game-api** 的 APP_ORIGIN 必须与网站 HTTPS 域名一致，详见 [Zeabur 持续部署](zeabur.md)。

数据库 schema 在进程启动时由事务与 PostgreSQL advisory lock 初始化；资产、执行租约、活动到期索引和业务唯一键独立于模拟快照。Web 没有 D1 绑定、Drizzle 依赖或本地迁移步骤，也没有读取旧 `game_saves` 的回退路径。历史开发账号需要重新创建角色。

## 使用流程

创建主角后，在“账号名册与共享副本”创建长期伙伴、设置出战名册。切换角色可管理其独立背包、金币、技能与专业；生活职业页面会创建后台制造或采集活动。已有出战成员受同一活动租约保护，要外派请先让其离队。采集和制造订单支持召回；返回完成后释放角色。

共享实例由一方创建并把实例编号告知另一玩家，各账号只能加入自己拥有的角色。成员全部加入后队长开始；可选佣兵合同按实例扣费。北郡遭遇用于通用运行器验证，死亡矿井保持原有五人、等级和地点条件。10/20/40 席位是编排能力，不代表对应规模的完整副本内容已经制作。

玩家离开页面、浏览器关闭或角色离线后，服务器继续执行战斗、移动等活动，默认最多 **2 小时**。API 和 worker 使用相同的 `GAME_OFFLINE_LIMIT_MS` 配置（默认 `7200000` 毫秒）。通过认证的游戏轮询、专业页面请求和操作刷新账号在线时间，返回 304 的轮询也计入在线；内部快照和 worker 不刷新在线时间。浏览器切至后台后暂停轮询，因此从最后一次请求开始计时。WebSocket 订阅通过 ping/pong 检测连接，30 秒未响应则断开。

达到时限后保留活动、角色占用和战斗/移动进度，暂停调度；重新上线后续跑，不补算超出时限的时间或收益。即使 worker 停机后才收到上线请求，也只补算允许的离线进度。指派队友的生产、采集及召回订单不受时限限制；主角自己执行的订单仍受限制。共享副本采用统一时钟，以非佣兵参与账号中最早到期的时限暂停整个副本，相关账号重新上线后恢复。

账号在线时间保存在独立的 `account_presence.lastSeenAt`，普通心跳不写账号主记录。缺少有效 presence 的旧开发存档会在角色列表标记为需要重新创建，仍可删除；不提供旧字段回退或迁移。查询、心跳与结算的边界见 [数据库一致性策略](database-consistency.md)。

worker 关闭后到期活动留在数据库，重新启动继续处理。客户端目前采用 REST 快照轮询；Node `/api/events` 提供带认证的 WebSocket 快照订阅；`subscribe` 设置 `mode: "delta"` 后，首包为完整投影，后续使用带基础 revision/sequence 的增量事件，重新订阅补全快照。浏览器尚未接入此 WebSocket 身份入口。

战斗窗口打开时，浏览器以 200 毫秒为目标周期串行请求 `/api/game?scope=combat`。该响应只重新生成战斗所需的 view 字段，保留完整的公开 player 状态；客户端将其与当前角色、相同内容版本的完整快照合并。结束战斗自动返回 `scope: "full"`，关闭窗口立即恢复完整同步。两种 scope 使用不同 ETag；过期请求、切换角色和内容版本不一致时不能覆盖当前画面。请求超时为 8 秒，隐藏页面停止轮询。

常驻角色由 simulation-host 推进，game-worker 不重复推进其战斗。API 与实例通过本机 RPC 交换命令和投影，浏览器通过 WebSocket 获取状态。组合运行时详情见 [2.0 实施记录](simulation-2.0.md)。

战场使用 Three.js / React Three Fiber：精细模式按浏览器帧循环绘制，简化模式关闭实时阴影和后处理；页面隐藏时停止画布帧循环。HUD 每 100 毫秒更新，进度条通过 CSS 连续过渡；折叠策略首次展开才挂载。显示时钟不回退，只做有限时间的视觉插值，生命值和命中仍由服务端决定。实现、素材和验证见 [HD-2D 战场](hd2d-battle.md)。

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

## 同账号装备共享

主角与同账号 NPC 队友可交换普通装备，包括拾取绑定和装备后绑定的装备。装备仍保留唯一实例、实际持有角色、绑定、附魔、耐久和锁定状态；换下的装备进入持有者背包，可从该角色背包重新分配给队友。职业、等级、熟练度与栏位要求继续生效，配发装备不可转移，绑定物品仍不可上架拍卖。服务端按账号校验转移权限，组队本身不赋予跨账号装备控制权。

未来多人模式拟在拾取时通过 roll 点分配，或允许具有该次拾取资格的玩家在拾取后两小时内交易；尚未实现，不能将同账号 NPC 共享规则直接用于真人间交易。
