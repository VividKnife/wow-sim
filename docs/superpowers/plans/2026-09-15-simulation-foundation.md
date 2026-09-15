# Simulation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可验证数值来源、可序列化恢复和按事件推进时间的基础库，为同一套在线/离线游戏规则提供运行基础。

**Architecture:** 无 UI、网络和数据库依赖的纯 ESM 模块。规则回调通过显式世界状态、随机状态及新事件推进模拟；事件时间由调用者传入，核心不读取系统时钟。来源检查验证证据结构，不替代数值研究。

**Tech Stack:** JavaScript ESM、Node.js 内置 `node:test` 与 `node:assert/strict`；无第三方运行时依赖。

---

## Scope

本计划只完成总路线的阶段 1。它不实现战斗公式、任务数据、可玩网页或离线服务器，不证明任何原版数值已被复刻。测试中的距离、伤害和技能值都是合成测试数据，不进入正式内容包。

## File structure

- `package.json`：私有 npm 工作区与测试命令。
- `packages/sim-core/package.json`：纯 ESM 模块入口。
- `packages/sim-core/src/evidence.js`：数值记录与证据状态的结构检查。
- `packages/sim-core/src/random.js`：显式可保存的伪随机状态，含无模偏差的整数采样。
- `packages/sim-core/src/timeline.js`：可恢复的事件时间线、同时间事件顺序、分段推进和事件预算。
- `packages/sim-core/src/travel.js`：按实际路线分段计算旅行耗时，不内置未经核对的原版速度常量。
- `packages/sim-core/test/*.test.js`：模块行为与恢复等价性测试。
- `README.md`：运行方式、当前覆盖和未实现范围。

## Task 1: Evidence records

- [ ] 写失败测试，运行 `node --test packages/sim-core/test/evidence.test.js`，确认没有实现时拒绝/接受行为失败。
- [ ] 实现下列结构规则，并重跑测试。
- [ ] 验证来源 URL、固定版本、数值为合法 JSON 值以及验证记录；不允许只改状态字符串就变成已验证。
- [ ] 提交此任务的代码、测试与根配置。

API：`validateEvidence(record, expectedRuleset)` 返回问题字符串数组，空数组表示结构有效。记录包含 `id`、`ruleset`、`status`、`value`、`sources`。状态为 `unknown | estimate | reference | verified`。来源包含 `url`、`locator`、`revision`。非 unknown 状态需要 value，reference/verified 必须至少一个来源。verified 还需要 `verification.method`、ISO 日期 `verification.reviewedAt` 和 `verification.notes`。method 为 `official | measurement | cross-check`。已验证状态仍由外部审计产生，结构检查不判定证据真实性。

测试输入至少覆盖以下实际断言；其他反例使用同一 API，不创建第二套校验器：

```js
const record = {
  id: 'fixture:amount', ruleset: 'fixture', status: 'reference', value: 7,
  sources: [{url: 'https://example.org/fixture', locator: 'row 1', revision: 'fixture-v1'}],
};
assert.deepEqual(validateEvidence(record, 'fixture'), []);
assert.ok(validateEvidence({...record, ruleset: 'other'}, 'fixture').length > 0);
assert.ok(validateEvidence({...record, status: 'verified'}, 'fixture').length > 0);
assert.ok(validateEvidence({...record, value: NaN}, 'fixture').length > 0);
```

实现方法：检查对象和非空字符串，逐字段累积问题；使用 URL 解析并只允许 HTTP(S)；递归检查 value 是否是 JSON 数据（拒绝 NaN、Infinity、undefined、循环和非普通对象）；验证日期必须是有效的 `YYYY-MM-DD`；不访问网络。

## Task 2: Serializable randomness

- [ ] 写失败测试并运行 `node --test packages/sim-core/test/random.test.js`。
- [ ] 实现确定的 xorshift32 状态转换与整数采样，返回新状态，不保存隐藏全局状态。
- [ ] 核对已知转换、保存恢复、上下界、非法参数与拒绝采样分支。
- [ ] 提交此任务。

API：`nextRandom(state)` 返回 `{state, value}`，其中 state 为 1 至 0xffffffff 的整数，value 为 `[0, 1)`。`randomInteger(state, min, max)` 返回 `{state, value}`，上下界是非负 uint32，区间包含两端。下列转换为实现算法本身，不是魔兽原版随机数算法：

```js
let x = state;
x ^= x << 13;
x ^= x >>> 17;
x ^= x << 5;
x >>>= 0;
return {state: x, value: x / 0x100000000};
```

整数采样把 xorshift 的非零输出减 1 映射到 `[0, 0xfffffffe]`，使用 0xffffffff 个等可能候选做拒绝采样；区间宽度必须不超过 0xffffffff，拒绝覆盖全部 uint32 的区间。若候选不小于 `floor(0xffffffff / width) * width` 则重新采样，否则返回 `min + candidate % width`。这避免错误地把 xorshift32 当成能生成零的完整 32 位均匀源。

```js
assert.equal(nextRandom(1).state, 270369);
const saved = JSON.parse(JSON.stringify(nextRandom(123)));
assert.deepEqual(nextRandom(saved.state), nextRandom(nextRandom(123).state));
assert.throws(() => nextRandom(0));
assert.throws(() => randomInteger(1, 3, 2));
```

## Task 3: Timeline and bounded catch-up

- [ ] 写失败测试并运行 `node --test packages/sim-core/test/timeline.test.js`。
- [ ] 实现创建、排程、推进与快照恢复校验。
- [ ] 验证同时间排序、重入排程、JSON 恢复、分段等价、事件预算和异常时原状态不变。
- [ ] 提交此任务。

接口：

```js
createTimeline({seed, world})
scheduleEvent(state, {atMs, type, priority = 0, payload = null})
advanceTimeline(state, untilMs, handler, {maxEvents = 10000} = {})
restoreTimeline(snapshot)
```

创建返回 `{version:1, nowMs:0, rngState:seed, nextSequence:0, world, events:[]}`。事件有 `atMs`、整数 `priority`、非空字符串 `type`、JSON `payload` 和唯一非负整数 `sequence`。排序依次比较 atMs、priority、sequence；这是引擎的显式调度约定，未来版本规则通过 priority 和事件安排表达，不能称为已验证的原版同时事件顺序。

所有时间使用非负安全整数毫秒。不能向过去排程，不能向过去推进；不读取真实时钟。公开 API 不修改输入，返回可 JSON 序列化的状态。

处理器输入 `{event, nowMs, world, rngState}`，输出 `{world, rngState, events:[]}`。处理器只能提交新世界、随机状态和待排程事件，不能直接改变时间或 sequence。world/payload 必须为 JSON 数据。零延迟事件可以重新排程，但事件预算防止无限循环。

推进返回 `{state, processed, complete}`。预算耗尽且仍有到期事件时，complete=false 且 nowMs 保持最后处理事件的时间；后续调用继续处理。仅在所有到期事件处理完成后把 nowMs 提升到 untilMs。中途错误抛出且原输入状态不变，存档层可以选择不提交。

```js
const initial = scheduleEvent(createTimeline({seed: 1, world: {n: 0}}), {
  atMs: 1000, type: 'pulse',
});
const pulse = ({world, rngState, nowMs}) => ({
  world: {n: world.n + 1}, rngState,
  events: [{atMs: nowMs + 1000, type: 'pulse'}],
});
const once = advanceTimeline(initial, 10000, pulse).state;
const midway = advanceTimeline(initial, 4000, pulse).state;
const resumed = restoreTimeline(JSON.parse(JSON.stringify(midway)));
assert.deepEqual(advanceTimeline(resumed, 10000, pulse).state, once);
assert.equal(initial.world.n, 0);
```

恢复检查 version、time、rng、序号范围、唯一事件序号、JSON 数据、事件不在过去且小于 nextSequence。非法快照明确拒绝，不悄悄修复可能影响收益的数据。

## Task 4: Travel and integration

- [ ] 写失败测试并运行 `node --test packages/sim-core/test/travel.test.js`。
- [ ] 实现分段旅行时间与飞行航程时间求和。
- [ ] 核对不同地面速度、固定等待、空路线、非法输入、只在全程最后向上取整和安全整数溢出。
- [ ] 通过事件时间线验证抵达前后边界，以及恢复后不会重复抵达。
- [ ] 更新 README、执行 `npm test` 和 `npm run check`，记录结果与未实现范围并提交。

API：`groundTravelDuration(segments)` 接受 `{distanceYards, speedYardsPerSecond, delayMs = 0}[]`，返回整数毫秒；`flightTravelDuration(legs)` 接受 `{durationMs}[]`。地面路段必须有非负有限距离、正有限速度、非负安全整数延迟；航程必须为非负安全整数毫秒。空路线不合法。总时长必须是安全整数。

```js
const ms = segments.reduce((sum, segment) =>
  sum + segment.distanceYards / segment.speedYardsPerSecond * 1000 + (segment.delayMs ?? 0), 0);
return Math.ceil(ms);
```

整个路线只在最终向上取整，不逐段向上取整。飞行不使用地面距离或坐骑倍率。

```js
assert.equal(groundTravelDuration([
  {distanceYards: 10, speedYardsPerSecond: 2},
  {distanceYards: 10, speedYardsPerSecond: 4, delayMs: 500},
]), 8000);
assert.equal(flightTravelDuration([{durationMs: 2000}, {durationMs: 3000}]), 5000);
assert.throws(() => groundTravelDuration([{distanceYards: 10, speedYardsPerSecond: 0}]));
```

## Review and completion

- [ ] 逐项检查测试失败原因是缺失行为，而不是运行环境问题。
- [ ] 完整测试通过后审阅快照与整数边界。
- [ ] 代码评审覆盖本阶段要求；不把“核心测试通过”写成“游戏或数值已复刻”。
- [ ] 更新总路线状态，记录下一阶段的数据证据缺口。
