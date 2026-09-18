# wow-sim

面向手机网页的 2D 魔兽冒险模拟器。目标是以 2019 年 Classic 首发阶段为基础，保留角色成长、旅行、配装、队伍和副本策略。权威状态由 Node 游戏服务与 PostgreSQL 保存，后台 worker 独立推进到期活动和实例。

## 当前进度

已有可玩的网页、确定性战斗引擎、多角色账号、独立资产与活动、共享实例和死亡矿井流程。职业系统已扩展到经典旧世九职业的 1—60 级；当前世界仍以北郡、艾尔文森林、西部荒野和死亡矿井路线为主。

暴风城现已提供分区主城体验：贸易区、法师区、蓝色隐士、旧城区、矮人区、教堂广场、花园与暴风要塞。到达后在世界页查看城区地图，通过卫兵寻找职业训练师、银行、工坊、商人、旅店和交通服务。选区只预览，实际旅行抵达后才能办理当地业务；主城内可直接展开服务面板，查看整备清单并出发。矿道地铁从矮人区开往铁炉堡，任务 NPC 按分区重新归属。拍卖行继续采用远程模拟交易。 商人的「出售」页支持搜索背包、勾选整组物品并批量出售；拍卖行的「上架物品」页支持勾选批量上架，并显示扣除手续费后的预计到账和剩余上架额度。原有一键售卖灰色物品、全部快捷上架仍保留。批量交易会先校验全部所选物品，锁定、任务物品等保护规则与单组交易一致，任一项无效或拍卖额度不足时整批不执行。

主城独立预览：设置 `PREVIEW_PORT=5183` 后运行 `node apps/web/scripts/serve-dungeon-preview.mjs`，打开 `http://127.0.0.1:5183/stormwind.html`。预览使用内存角色，不连接玩家存档。设计与验证见 [暴风城设计](docs/superpowers/specs/2026-09-16-stormwind-design.md) 和 [验证记录](docs/development/stormwind-validation.md)。

职业与角色系统：

- 九职业、八种族、40 种合法组合，等级属性、经验和装备熟练度到 60 级。
- 技能训练、前置等级、技能书与职业解锁，法术书支持搜索、目标选择，并展示基础伤害／治疗、持续效果、射程、冷却、作用范围及材料／姿态等使用限制；最终战斗数值另受装备、天赋和目标减伤影响。
- 27 棵天赋树、432 个天赋节点，60 级共 51 点，支持前置约束、主动技能与洗点。
- 姿态、连击点、变形、图腾、猎人宠物、术士恶魔、职业物品、职业坐骑、种族能力与环境技能。

基础设施：

- `apps/web` 负责界面、独立账号登录和签名代理；只访问认证表，不直接读写游戏存档。
- `apps/game-server` 提供 HTTP/WebSocket 边界，`apps/game-worker` 主动结算活动与实例。
- `packages/game-domain` 集中领域服务与确定性规则，`packages/game-data/data` 保存静态内容，`packages/persistence` 提供 PostgreSQL 事务存储。
- 数值证据记录的结构校验：区分未知、估计、参考与已验证，检查来源及版本。
- 可保存恢复的确定性随机状态。
- 按事件推进的时间线，支持同时间排序、分段结算、处理预算和 JSON 快照恢复。
- 按路线分段速度计算地面耗时，以及独立的飞行航程计时。

验证状态字段不是自动认证；当前测试验证的是程序行为，不能证明原版数值准确。随机算法和事件排序是本项目的基础实现约定，没有声称与暴雪内部实现相同。

职业任务解锁适配现有共享路线；新增主城节点提供传送服务。完整 1—60 级野外、原版职业任务链和团队副本不在本次职业扩展中。技能来源与执行登记见 [职业覆盖清单](docs/research/import/classes-60-coverage.json)，验证记录见 [职业验证报告](docs/research/import/classes-60-validation.md)。

## 本地运行

需要 Node.js 24.11.1+、PostgreSQL，以及 Docker Compose（仅用于按示例启动本地 PostgreSQL）。

```sh
npm ci
npm --prefix apps/web ci
npm run data:check
docker compose up -d postgres
```

复制 `.env.example` 为 `.env`，把 `GAME_SERVER_SECRET` 设置为至少 32 字节的随机值。复制 `apps/web/.env.example` 为 `apps/web/.env.local`，填写数据库 URL、相同的游戏服务 URL/密钥与 Web 的 `APP_ORIGIN`，再分别启动三个进程：

```sh
npm run game:server
npm run game:worker
npm --prefix apps/web run dev
```

常用验证命令：

```sh
npm test
npm run check
npm run typecheck
npm --prefix apps/web run build
```

完整环境变量、进程边界和恢复说明见 [游戏运行环境](docs/development/game-runtime.md)。

独立网站注册入口为 `/login`。Zeabur 的 GitHub push 自动部署、Dockerfile 选择及各服务变量见 [Zeabur 持续部署](docs/development/zeabur.md)。

## 基础库示例

下面使用的是合成测试路线，不是原版地点测量值。

```js
import { groundTravelDuration } from './packages/sim-core/src/travel.js';
import { createTimeline, scheduleEvent, advanceTimeline } from './packages/sim-core/src/timeline.js';

const durationMs = groundTravelDuration([
  { distanceYards: 20, speedYardsPerSecond: 2 },
]);
const initial = scheduleEvent(createTimeline({ seed: 123, world: { location: 'origin' } }), {
  atMs: durationMs, type: 'arrive', payload: { destination: 'camp' },
});
const result = advanceTimeline(initial, durationMs, ({ event, rngState }) => ({
  world: { location: event.payload.destination }, rngState, events: [],
}));
console.log(result.state.world.location); // camp
```

生产游戏的状态更新处理器必须是同步、确定、无外部副作用的函数。引擎不读取系统时钟，存档服务负责传入权威时间、控制玩家动作和事务提交。函数内部直接请求网络或读取时间会破坏确定性保证。

`advanceTimeline` 返回 `complete: false` 时，调用者必须从返回状态继续结算同一个目标时间，不能把尚未处理的时间提前提交为已完成。

## 资料与规划

- [重构后架构复核](docs/superpowers/specs/2026-09-16-post-refactor-architecture-review.md)：最终目标对照、新复现问题与下一轮收口门槛。
- [基础架构重构交付记录](docs/development/foundation-refactor.md)：当前模块边界、验证结果、测量和交付限制。
- [游戏运行说明](docs/development/game-runtime.md)：PostgreSQL、Node API、worker 与 Web 的本地配置。
- [战斗运行与回放](docs/development/combat-execution.md)：单人预模拟、多人实时、挂机批量结算与性能验证。
- [首版设计](docs/superpowers/specs/2026-09-15-wow-sim-first-playable-design.md)：人类法师 1—20 级，四名 AI 队友与死亡矿井。
- [实施路线](docs/superpowers/plans/2026-09-15-wow-sim-roadmap.md)：数据、战斗、活动、存档、副本和手机界面的依赖顺序。
- [模拟基础计划](docs/superpowers/plans/2026-09-15-simulation-foundation.md)：本阶段的接口和测试要求。
- [数值来源基准](docs/design/version-baseline.md)：2019 首发目标与 1.12 参考资料的使用边界。
- [参考数据审计](docs/research/reference-source-audit.md)：固定来源提交与归档摘要，不等于已验证游戏数据。
- [九职业 1—60 级设计](docs/superpowers/specs/2026-09-16-classes-60-design.md)：职业扩展范围、机制与验收要求。

## 后续开发

后续世界内容可沿用当前职业系统，逐步扩展区域、原版任务链与副本。职业清单保留来源和执行路径，便于增加内容时检查依赖。

2026-09-16 坐骑更新：按最新玩法要求，普通马与骑术在 20 级解锁。世界页「坐骑 → 马匹收藏与骑术」可前往东谷伐木场学习、购买和骑乘；普通马使可骑乘的户外路段移速提高 60%。迅捷马保持 60 级门槛。详见 [坐骑实现与资料边界](docs/research/import/mounts-reference.md)。
