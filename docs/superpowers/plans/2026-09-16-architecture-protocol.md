# 第一批架构重构：客户端协议与按需内容

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 替换整档透传与高频全配方报价，交付可运行的客户端协议切片。

**Architecture:** 权威存档只留服务端；白名单投影生成客户端快照。公开展示目录按内容摘要版本缓存，工坊报价按专业、筛选和页码查询。现有战斗与职业规则继续使用，客户端同步改用新协议，不保留旧协议回退。

**Tech Stack:** TypeScript、现有 React/Vinext/D1、Node 测试。

**Spec:** ../specs/2026-09-16-target-architecture-review.md，主要落实 F/H 和 A3 的首个切片。

## Global Constraints

- 不兼容旧 API，不添加存档迁移；本批不切换部署平台或清除线上数据。
- 不把本批声明为 A1/A2/A4/A5 完成。多角色资产、并行订单、共享实例和主动调度仍需后续独立交付。
- 内容目录仅含客户端展示数据，快照不得包含随机种子、存在租约、收据或预生成副本内容。
- 保留职业、装备、任务与战斗行为测试；补充协议泄漏、报价分页、缓存版本与客户端响应验证测试。

## Task 1: 显式客户端投影与契约

Files: packages/contracts/src/game.ts、apps/web/lib/game/client-snapshot.ts、apps/web/test/client-snapshot.test.mjs。

接口：`projectClientSnapshot(state, view)` 返回 `{player, view}`；`GameResponse` 为 `{protocolVersion:1,contentVersion:string,revision:number,snapshot:null|ClientSnapshot,controlled?,catchingUp?,replayed?}`。player 是用于现有 UI 的白名单展示数据，不是权威实体。

- [ ] 测试真实角色、宠物、活动、战斗与副本快照，植入未知敏感字段，断言不会透传。
- [ ] 实现投影、返回类型和运行时响应验证。
- [ ] 检查 battle 等消费者需要的字段，保留展示所需信息，移除客户端对 combatMembers 服务端模块的依赖。

## Task 2: 内容与工坊查询

Files: apps/web/lib/game/client-content.js、apps/web/lib/game/workshop.js、apps/web/lib/game/engine.js、apps/web/lib/game/professions.js、apps/web/app/api/game/content/route.ts、apps/web/app/api/game/workshop/route.ts。

接口：`clientContent()` 返回 `{contentVersion,items,market,enchants,bandages,potionOptions,creationOptions}`；`workshopView(state,{profession,search,filter,page,pageSize})` 返回 `{recipes,total,page,pageSize,profession,contentVersion,revision}`（revision 由路由添加）。每页最多 24 条。

- [ ] 测试普通 view 不再返回 recipes/items 等目录、报价限页且保留正确材料数量/技能/冷却。
- [ ] 提取 itemView 至展示目录模块，使用内容摘要构造版本；版本 URL 返回 immutable 和 ETag，错误版本拒绝缓存。
- [ ] 从高频 view 移除静态目录与全配方报价；工坊仅为筛选后的当前页生成完整报价。
- [ ] 新增鉴权只读工坊路由，共享存档读取与当前版本检查。

## Task 3: API 与 UI 完整接入

Files: apps/web/app/api/game/route.ts、apps/web/lib/game-response.js、apps/web/app/game.tsx、apps/web/app/professions.tsx、apps/web/app/character-equipment.tsx、apps/web/app/battle.tsx。

- [ ] GET、创建、重放、失去控制权、追赶与普通命令统一通过新响应构造函数返回。
- [ ] 客户端按 contentVersion 缓存公开目录；只有完整快照与匹配目录加载后才替换视图，保持 revision 顺序保护。
- [ ] 工坊打开时读取选中专业与页码；请求失败显示错误，查询改变取消过期结果；角色 revision 更新后刷新报价。
- [ ] 更新旧协议测试和所有 view 目录使用方，不增加旧响应兼容路径。

## Task 4: 集成验证与记录

- [ ] `npm test`、`npm run check`、`apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web`、网页构建。
- [ ] 实测新建角色响应字节数和 view 时间，记录未压缩本地指标与测量范围。
- [ ] 独立代码审查，修正发现的问题，记录实际完成范围和后续切片。

## 执行记录

- 基线源码：2a2157f；工作分支 codex/architecture-protocol。
- 选择该切片是因为当前协议边界可独立替换，不依赖未完成的平台决策。A1/A2 的先后依赖不变。
