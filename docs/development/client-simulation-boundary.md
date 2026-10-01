# 客户端与服务器模拟边界

2026-10-01：移除浏览器本地模拟引擎。当前入口使用服务器常驻实例，浏览器不接管战斗，也不上传计算结果。

- `simulation-host` 的固定 Worker 池保留唯一战斗规则内核。AI、随机数、技能、奖励与离线推进均在服务器执行。
- 浏览器通过 HTTP 提交意图，通过 WebSocket 接收公开基线及差量。血量、施法、光环、竞技场与战场 UI 使用同一服务器投影；位置和进度只做显示插值。已有显示回放工具不执行战斗规则。
- 删除浏览器模拟 Worker、策略 Worker、会话预留/接管/释放与检查点上传。`/api/game/local` 不存在；普通 `/api/game` 命令仍受 16 KiB 输入上限约束。
- 构建只输出 UI 与展示资产，不输出模拟规则、随机状态、boot/职业/数字规则分片。运行内容编译仅生成服务器 catalog 和版本。Vite 阻止战斗内核进入浏览器产物。
- `GameService` 中删除本地会话导致的跳过推进、修改时钟和条件结算。资产事务和服务器检查点保留；不读取或迁移旧浏览器存档。

验证入口：`npm run typecheck`、`npm --prefix apps/web run typecheck`、`npm --prefix apps/web run build`、`node scripts/verify-web-build.mjs`、`npm run simulation:test`。CI 浏览器验收使用独立认证数据库、服务器实例与真实 HTTP/WebSocket；验证狩猎进展且不请求浏览器引擎或上传检查点。

这次移除不修改生产数据库，也不代表全部 2.0 功能或目标机器容量已通过验收。整体进度见 [2.0 实施记录](simulation-2.0.md)。

角色离线、空闲休眠和回收详见 [实例生命周期](instance-lifecycle.md)。
