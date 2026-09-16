# 客户端协议与按需内容实施报告

## 已交付边界

- `packages/contracts/src/game.ts` 定义协议版本 1 的 `GameResponse`、客户端快照、账号、角色名册、活动和实例摘要类型，并提供运行时响应验证。
- `packages/game-domain/src/rules/client-snapshot.ts` 的 `projectClientSnapshot(state, view)` 只投影白名单字段。副本运行只公开游标、位置和公开计量；战斗单位、小队、护送 NPC、招募候选和战斗展示都有独立 DTO，不会复制完整角色或权威存档对象。响应只有 `{player, view}`。
- `packages/game-domain/src/rules/server-response.js` 的 `buildGameResponse(state, revision, extra?)` 返回冻结的协议信封：`{protocolVersion:1, contentVersion, revision, snapshot, ...metadata}`。账号、名册、活动和实例元数据分别再次经过字段白名单，领域行可以直接交给构造器而不会把 `rngState`、`engineActivity`、制造命令/预留或实例 epoch 发给浏览器。
- 普通 `view(state)` 已移除 `items`、`market`、`enchants`、`bandages`、`potionOptions`、`creationOptions` 和全量 `recipes`。职业视图只保留角色相关职业状态、资源点和分解候选。
- `packages/game-domain/src/rules/client-content.js` 的 `clientContent()` 缓存公开展示目录，没有 Node 专用依赖，可由 Workers 路由加载。`contentVersion` 来自覆盖全部玩法数据的构建产物 SHA 清单。
- `packages/game-domain/src/rules/workshop.js` 的 `workshopView(state, query)` 按专业、搜索、筛选和页码查询，只为当前页生成动态材料、技能、专精、设施和冷却报价。页大小强制为 1—24，未知专业返回空页。

## 浏览器接入

- 浏览器先验证协议信封，再按 `contentVersion` 读取一次公开目录。只有完整快照和完全匹配的目录都加载成功后才替换当前游戏视图；失败的目录 Promise 会从缓存移除以允许重试。
- 服务端响应构造器独立放在 `server-response`；浏览器 `game-response` 只含合同验证、错误转换和选择防护。依赖闭包测试保证浏览器模块无法到达引擎、目录、专业数据、投影器或服务端响应构造器。
- 页面可见时使用带当前 `characterId` 的只读 `GET /api/game` 条件轮询；状态未变时以 ETag 返回无响应体的 304。同步、暂停、接管和客户端租约心跳已全部移除；只有玩家主动操作发送 `POST`。
- 角色选择通过 `GET /api/game?characterId=...` 加载；每条命令携带当前 `characterId`。应用响应时同时检查角色 ID 和账号 revision，旧角色的迟到响应即使 revision 相同也不能覆盖新选择。
- 账号面板展示公开名册和后台活动摘要。角色切换会重置本地 revision 下限，并保持角色 ID 防护。
- 工坊组件只在“生活职业”实际挂载时请求报价。专业、搜索、筛选、页码、角色、内容版本或游戏 revision 改变都会刷新；前一次请求通过 `AbortController` 取消，错误直接显示在工坊面板。
- 战斗组件改用投影中的参战者，不再直接导入服务端 `combatMembers`。装备组件也不再导入庞大的职业静态数据。
- 法术默认目标改为当前稳定角色 ID，并在切换角色时同步更新，不再发送字面量 `player`。

## 增量事件协议

- `packages/contracts/src/events.ts` 提供纯 JSON 的投影差异与应用函数。补丁路径限制深度、索引和字段长度，并拒绝 `__proto__`、`prototype`、`constructor`，应用补丁不会修改原快照。
- 已认证的 `/events` WebSocket 订阅默认继续发送完整 `snapshot`。客户端显式发送 `mode: "delta"` 时，服务端先发送完整快照，后续变化发送带 `baseRevision`、`baseSequence`、`revision` 和 `sequence` 的 `delta`；合同应用器同时校验两个基线，防止在缺口或错误角色上应用补丁。
- 每次重新订阅都会清空服务端增量基线并返回完整快照。序列回退也回退到完整快照；正在读取的旧角色结果会因订阅代次变化而丢弃。
- WebSocket 入站载荷上限为 16 KiB，慢接收者的待发送缓冲超过 1 MiB 时会被关闭，异步读取完成后也会再次检查连接状态。
- 浏览器页面仍使用带 ETag 的认证 REST `GET /api/game` 作为可靠回退；本次没有新增浏览器鉴权或 WebSocket 代理端点。

## 验证

- 新增行为测试覆盖快照泄漏、嵌套敏感字段、公开元数据白名单、冻结协议信封、旧协议拒绝、角色切换迟到响应、内容版本稳定性、普通视图瘦身、工坊筛选和 24 条上限。
- 更新原有职业和职业进度测试，改从 `clientContent()` 或 `workshopView()` 读取被拆出的数据。
- 最新协议、内容、职业和进度聚焦回归：46 项通过。
- 增量事件合同、游戏服务 WebSocket 和双连接共享实例聚焦回归：14 项通过。
- `npm run check`：通过。
- `tsc --noEmit -p apps/web`：通过。浏览器测试夹具中的旧 `dungeonOnline` 选项已随领域接口一起移除。
- `npm --prefix apps/web run build`：通过；构建只报告既有的大 chunk 提示。
- 最终完整 `npm test`：648 项，647 通过，1 项失败。剩余失败是既有旅程图片来源摘要校验：清单期望 `71845cee...`，工作区文件实际为 `5d26bcea...`；本次没有改写原始证据或期望摘要。最终集成结果见 `docs/development/foundation-refactor.md`。

## 本地未压缩指标

最终可复现结果见 `docs/development/foundation-measurements.json` 和 `docs/development/foundation-refactor.md`。固定角色完整响应约 408 KB，未变化的条件请求响应体为零；统计不包含 PostgreSQL、公网或真机性能。
