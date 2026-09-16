# 当前功能与工程状态审计

审计日期：2026-09-16，约 12:00—12:09（Asia/Singapore）。工作目录 `C:/workspace/wow-sim`。HEAD 为 `d747d7a955764e7b20e4cc2604d4ee037efed785`，分支 `feat/simulation-foundation`。多个其他任务正在修改工作区，因此下面是观察快照，不是冻结发布基线。

本次读取源码、已有验证报告和相关 Codex 历史，并实际执行 `npm test` 与 `npm run check`。没有重新跑生产构建、完整浏览器旅程、云部署或全职业 1—60；历史验证与本次验证分别标注。

## 1. 可复用成果与缺口

状态：A=源码存在且有相应测试/历史行为证据；B=部分实现或仍开发；C=仅设计/预留；D=本次未发现实现。A 不等于已满足正式上线要求。

| 模块 | 状态与已开发内容 | 依据 | 上线前剩余工作 |
|---|---|---|---|
| 模拟基础 | A：可恢复随机数、事件时间线、JSON 快照、分段旅行 | `packages/sim-core/src/{random,timeline,travel,evidence}.js` | 联机使用统一时间和种子；40 人负载与长时间恢复 |
| 角色与成长 | B：9 职业、8 种族、27 棵天赋树；等级上限已改 60 | `apps/web/lib/game/character.js`、`classes-reference.json` | 当前 60 级扩展正在进行；逐技能/天赋执行、合法获取、装备能力、职业任务及正常升级验收 |
| 战斗与策略 | A/B：自动施法、二维距离、弹道、威胁/治疗/控制、成员策略与自动补 Buff、DPS | `combat*.js`、`class*.js`、`talent*.js`、`enemy*.js`、`auto-buffs.js` | 60 级完整机制、共享实例、20/40 人性能、机制覆盖与阶段数值 |
| 世界与旅行 | B：北郡、艾尔文、西部荒野主要路线、少量信使节点、飞行和职业传送节点 | `catalog.js`、`navigation.js`、`class-utility-data.js`、`world-map.js` | 两大陆区域包、全部出生地、完整主城、交通图、多大陆坐标和资源分布 |
| 任务 | A/B：杀怪、收集、交付、物品触发、护送等已有实现；目录 97 个任务模板 | `quests.js`、`quest-tools.js`、`escort.js`；当前内容验证报告 | 全世界任务清单、完整职业链、阵营限制、动态事件、共享信用 |
| 1—20 旅程 | A：历史自动正常命令跑通人类法师；继续完成 96 个当前路线任务 | `current-playthrough-20-validation.md`、`current-content-20-validation.md` | 不能扩张为所有职业/出生区全覆盖；持久 API 和手机端完整旅程尚需验收 |
| 队伍 | A：玩家加 4 名 AI，招募/装备/策略/职责、野外同行 | `party.js`、`companion-combat.js`、`combat-members.js` | 真人身份、共享成员表、邀请与权限、多人世界收益归属 |
| 副本 | A/B：死亡矿井 58 段路线、首领/事件、休整、失败恢复与重置 | `dungeon.js`、`deadmines-reference.json`、历史回放 | 通用实例接口；其他副本；10/20/40 人、锁定、多人奖励 |
| 坐骑 | A：普通马 20 级、60% 加速、3 秒施放、路段限制；迅捷马 60 级 | `mounts.js`、`mounts-reference.md`；历史坐骑任务 | 全种族/阵营商人、声望、坐骑来源、职业坐骑任务、全世界路段 |
| 专业 | A/B：采集、制造、剥皮、分解、附魔；最新目录 1,231 配方、1—300 | `professions.js`、`profession-data.js`、两个 professions JSON；职业任务历史 | 当前扩展仍在开发；全地图资源、冷却/专精、装备效果、阶段和经济验证 |
| 背包银行 | A：整理、锁定、出售、堆叠、升级背包、银行存取和附魔实例 | `inventory.js`、相关测试 | 多角色所有权、角色全局唯一物品 ID、事务、邮件/交易、审计 |
| 拍卖 | A（单人改编）：固定定价、模拟买料、30 秒自动收购与手续费 | `inventory.js` 的 `marketPrice/auctionSell/settleAuctions` | 不能称为玩家市场；跨用户交易、订单托管、供应/回收上限和套利检测 |
| 网页表现 | A：世界/角色/背包/专业/策略/战斗页，Pixi 渲染与图标/地图资源 | `apps/web/app/`、`lib/battle-renderer.ts`、历史浏览器验收 | 全世界资源分包、手机长列表、40 人 UI、弱网和真实设备 |
| 存档接口 | A/B：ChatGPT 身份、D1 单用户存档、revision、requestId 收据、多标签控制租约 | `app/api/game/route.ts`、`db/schema.ts`、`lib/game/session.js` | 一账号多角色、共享实例、事务资产、公开登录渠道、限流/故障恢复 |
| 真人联机 | C/D：命令队列、单人服务端权威和表现分离可复用 | `lib/command-queue.js`、`session.js` | 本次检索未发现共享队伍、WebSocket、实例服务或跨玩家交易实现 |
| 团本/PvP/公会 | D：未发现可玩实现 | 副本与 API/数据库检查 | 需独立建设，不能从 AI 五人队伍推断支持 |
| 上线工程 | B/D：Sites 配置和 D1 绑定存在；GitHub 上传有历史记录 | `.openai/hosting.json`；“部署项目到云端”历史 | 没有本次可验证的线上生产状态；CI、容量、运维、灰度和恢复验收 |

## 2. 数据统计的正确解释

源码运行时目录抽样统计：41 个地点节点、97 个任务模板、3,929 个生物模板、9,427 个物品模板；其中生物和物品被职业/专业导入扩大，不代表都有地图刷新或获得路径。

41 个节点包括原有 36 个路线节点以及 5 个职业传送节点。后者使用 `transportOnly`，部分没有地图坐标；不能把主城名称当成主城完整实现。创建函数仍默认 `location:'northshire'`，所有种族共用北郡路线。

职业清单有 3,940 个获取来源条目，不等于 3,940 个独立技能已实现。条目可能包含同一技能的多种职业、种族或获取来源。9 职业/8 种族/27 天赋树是目录结构事实，不证明所有效果正确。

专业配方按目录统计：制皮 233、炼金 111、裁缝 226、烹饪 81、采矿 12、锻造 240、急救 13、工程 164、附魔 151，共 1,231。草药、剥皮、钓鱼的存在不能用制造配方数量衡量。应分别统计专业、配方、资源、获取来源和效果。

当前约 10.8 MB 的职业参考 JSON、8.5 MB 的基础参考 JSON 和专业模板等需要服务端/客户端依赖审计。这是源文件大小，不是实测网络下载大小；不能直接断言玩家首次加载了全部数据。

## 3. 实测与历史证据

### 本次运行

- `npm test`：407 项，402 通过、5 失败；进程退出码 1，约 13.4 秒。
- `npm run check`：退出码 0，JavaScript 语法检查通过。
- 测试原始输出：工作区 `.cache/launch-audit-tests.log`，缓存可能未纳入 Git；本文件保留摘要。
- `git worktree list`：仅列出当前工作区；多项活跃 Codex 任务的 cwd 都是该目录。
- 当时 `git status --porcelain` 有 246 条记录。此数字含目录项，不能当成精确修改文件数，且仍可能增长。

5 项失败的测试标题：

1. `default and legacy saved strategies can be edited without an unavailable Counterspell`
2. `training enforces support, class, level, previous rank, money, and trainer location`
3. `view publishes current-class progression and explicit blocked reasons`
4. `a weaker later Frostbolt does not replace a stronger slow and survives its expiry`
5. `every playable node can be placed on its region map`（断言显示 `darnassus`）

这些是运行结果，不是已完成根因分析；可能包含正在变动的实现与旧预期不一致。GOV-01 应在冻结快照后重现，逐项判断修复实现还是更新已过时的预期，不能删测试取得全绿。

### 历史验收

人类法师正常命令运行达到 20 级：77 个任务、1,150 次击杀、1 次死亡、游戏时间约 16 小时 35 分，43,605 条操作重放一致。这是引擎自动试玩，不是人工浏览器时长。

续验报告累计完成 96 个当前路线任务，并两次完成死亡矿井路线。剩余模板 579 依赖阶段外凭证。报告明确不能证明全职业、全地区完成。

已有报告曾出现 258/258、320/320、340/341 等不同结果；它们对应不同代码时点。当前工作区不能继承其中任何一个“全绿”结论。

## 4. 相关 Codex 历史索引

以下任务均只读检查，没有向其他任务发送消息或更改其运行状态。

| 原始任务标题 | ID | 本次读取所得 |
|---|---|---|
| 我想开发一个游戏，wow-sim，一个网页版、手机可玩的，魔兽世界模拟器，在尽量复刻魔兽世界游玩流程和核心玩法… (2) | `01a0a5da-399e-7e60-a453-81a4c8445643` | 主线仍活跃；最近自动续跑的摘要为空，进度采用落盘报告补证 |
| 完善其他职业系统 | `01a0a83d-2fc0-7460-a0bf-e88b49e2eab3` | 1—20 曾验收；用户后续要求直接完成 1—60，当前仍开发 |
| Add professions and auction tools | `01a0a83a-1d12-7dd3-ba08-b6ffe0f28536` | 用户追加全经典配方、地图后续接入；1,231 条目录与制造验证已在进行 |
| 增加坐骑系统 | `01a0a84a-3fef-77c1-83b1-85b61c04f018` | 用户明确普通坐骑改为 20 级；本地实现未部署 |
| 升级战斗与策略系统 | `01a0a80e-018e-7d30-9caf-c64bb9feb0b4` | 二维战斗、策略、统计与表现改造；“多人预留”不能计为联机实现 |
| 部署项目到云端 | `01a0a5c5-9fa4-7b93-8eff-69fad52a0cb8` | 完成 GitHub main 上传 `d747d7a`，历史明确“尚未部署网站” |

另在任务列表发现“还原原版角色与背包界面”“添加地图地点导航功能”“支持技能书背包直接使用”；本次采用相应源码和验证文件检查，没有把未细读的任务标题当作验收证明。

## 5. 管理层面需要立即纠正的状态

- README 仍写“没有可玩的网页、战斗公式实现”，与源码明显冲突；旧 roadmap 仍写阶段 3—7 未实现。下一次整合应更新两者为指向本规划和实时覆盖报告的入口。
- HEAD 仍是早期上传，主要玩法在未提交工作区。必须先收口并建立包含这些实现的基线，否则新 worktree 从 HEAD 开始会缺失现有成果。
- `game_saves` 以 `user_id` 为主键，一用户一个 JSON 状态；`game_receipts` 提供命令收据。这是有用基础，但不包含实例共享状态与经济资产账本。
- 副本源码直接引用死亡矿井内容和诸多特例。新增副本前先提取最小通用遭遇接口，保留死亡矿井作为回归样本。
- 多个模块共享 `engine.js`、`catalog.js`、`character.js`、`game.tsx`、API 与 schema，是并发冲突热点。没有接口和文件归属就继续增加任务，会放大已有的不稳定。
- 目前证据足以说明“已具备可复用原型”，不足以量化“整个 1—60 项目已完成百分之多少”。完整分母要由内容清单、实现映射和测试报告生成。

## 6. 证据文件入口

- [原需求](../../../design/requirements.md)
- [版本基准](../../../design/version-baseline.md)
- [最新 1—20 正常运行](../../../research/import/current-playthrough-20-validation.md)
- [当前特殊任务与副本续验](../../../research/import/current-content-20-validation.md)
- [九职业原 1—20 验收](../../../research/import/all-classes-validation.md)
- [九职业 1—60 设计](../../specs/2026-09-16-classes-60-design.md)
- [专业原阶段验收](../../specs/2026-09-16-professions-validation.md)
- [坐骑来源与改编](../../../research/import/mounts-reference.md)

后续必须由 GOV-01 生成不可变的提交号、数据摘要和测试报告，替代本次活动工作区快照，作为开发起点。
