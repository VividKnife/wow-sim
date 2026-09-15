# wow-sim

面向手机网页的 2D 魔兽冒险模拟器。目标是以 2019 年 Classic 首发阶段为基础，保留角色成长、旅行、配装、五人队伍和副本策略；野外支持离线挂机，副本在线推进。

## 当前进度

已确认首版设计并实现模拟基础库。**目前还没有可玩的网页、战斗公式实现或完整游戏数据包。**

已实现：

- 数值证据记录的结构校验：区分未知、估计、参考与已验证，检查来源及版本。
- 可保存恢复的确定性随机状态。
- 按事件推进的时间线，支持同时间排序、分段结算、处理预算和 JSON 快照恢复。
- 按路线分段速度计算地面耗时，以及独立的飞行航程计时。

验证状态字段不是自动认证；当前测试验证的是程序行为，不能证明原版数值准确。随机算法和事件排序是本项目的基础实现约定，没有声称与暴雪内部实现相同。

## 本地运行

需要 Node.js 22 或更高版本。基础库没有第三方运行时依赖。

```sh
npm test
npm run check
```

`npm test` 验证确定性、恢复、非法状态、来源结构和旅行时间边界。`npm run check` 检查项目 JavaScript 文件语法。

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

- [首版设计](docs/superpowers/specs/2026-09-15-wow-sim-first-playable-design.md)：人类法师 1—20 级，四名 AI 队友与死亡矿井。
- [实施路线](docs/superpowers/plans/2026-09-15-wow-sim-roadmap.md)：数据、战斗、活动、存档、副本和手机界面的依赖顺序。
- [模拟基础计划](docs/superpowers/plans/2026-09-15-simulation-foundation.md)：本阶段的接口和测试要求。
- [数值来源基准](docs/design/version-baseline.md)：2019 首发目标与 1.12 参考资料的使用边界。
- [参考数据审计](docs/research/reference-source-audit.md)：固定来源提交与归档摘要，不等于已验证游戏数据。

## 后续开发

下一阶段固定客户端数据、热修边界与正式内容清单，再逐项实现法师、AI 队友和敌人的规则。之后接入野外活动、事务存档、五人副本与手机网页。原版坐骑解锁条件保持不变，首版独立测试存档用于验证坐骑规则。
