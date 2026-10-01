# 副本离开与返回

## 服务器常驻路径

匹配队伍的真人分别在入口手动进入副本。`enterDungeon` 和 `leaveDungeon` 经游戏网关转交 SimulationDirectory 的实例交接入口；不能作为普通角色操作直接改掉整个共享房间。

非战斗且没有正在施法、未分配战利品或地面效果时，任何在场真人都可独立离开。角色回到入口的个人实例，其他真人保留当前副本进度。同房间内的本地 NPC 随其来源真人退出；来源真人尚未入场的客居 NPC 留在副本，最后一人离开时随最后一人保存；退出房间不等于退出社交队伍，也不转交队长身份。队伍不满五人或队长不在场时，仍按现有规则等待，不能继续推进。

单写者先完成已接受输入并取得事件边界，再用现有实例转移事务安装个人实例及剩余副本实例。事务同时更新角色/NPC 归属、队伍房间地址和操作回执；失败不留部分结果。角色私人背包、装备、钱包、任务、持续效果、宠物及输入游标随角色保留。根角色退出时，从剩余真人选择新的内存根对象，不改变社交队长。

仍有人在场时，进度仅在共享房间；最后一位真人离开后，队伍 `entry.parked` 保存冻结的副本路线。它不包含角色资产，不发送到社交公开投影，也不复制成退出者的个人存档。下一位真人手动进本时消费该进度，沿用 `runId`、怪物生成结果、击杀和交互；NPC 仍随队长入场。队伍成员或匹配改变后，原 entry 失效，不能据此进入另一个队伍的旧路线。

进本交接 ID 包含本次请求 ID，重试同一请求返回同一回执，新的往返不复用历史交接。`admittedHumanIds` 和 `npcParticipants` 属于该次共享冒险：重复进出不会重复计入每小时新副本次数或 NPC 参团记录。检查点中的规则哈希覆盖离开/拆分实现。

个人非匹配副本继续由 `leaveDungeon` 保存到角色的 `dungeonSaves[contentId]`。该保存方式与队伍共享进度是两种实际玩法路径，不互相复制。

## NPC 独立驻留

NPC 的永久来源与当前执行实例分开。队长手动进本时，匹配 NPC 可从其他实例交接，来源真人保留原位置、活动和输入游标，不自动传送。来源实例只留小型 `away` 引用；完整可变档案及资产写入权属于 NPC 当前实例。来源真人之后入场时，合并实际档案，不能用数据库旧副本覆盖已获得的收益。

交接复用现有封存与多目标事务，不新增事务协议；角色/NPC 执行权、检查点、队伍地址、回执一起提交。客居 NPC 不增加真人控制器，其资产写入校验自己的执行权。邀请允许来自其他玩家世界的空闲 NPC，仍执行等级、职责和占用检查。

## 验证与边界

- `apps/game-server/test/dungeon-admission.test.ts`：真实 HTTP → SimulationClient → Worker，队长/队员退出、返回、全员退出后恢复、重复请求、私人控制权和次数检查。
- `apps/simulation-host/test/dungeon-departure.test.ts`：拆分不修改源、持续效果分区、重放、输入去重和不允许的活动边界。
- `apps/simulation-host/test/dungeon-arrivals.test.ts`：三真人房间在队长退出后，剩余两人的公开视图仍可读取。
- `apps/simulation-host/test/realtime-dungeon-transfer.test.ts`：MemoryStore 和 PostgreSQL 接口（PGlite）上的事务回滚、重复提交、旧执行权拒绝和检查点恢复。
- `node apps/web/scripts/serve-dungeon-departure.mjs`：隔离 MemoryStore + 真实 Worker/HTTP/WS；Alice `http://127.0.0.1:5225/live-combat.html`，Bob `http://127.0.0.1:5226/live-combat.html`。两人已匹配，在查找器手动进入；在地下城手册中离开。此脚本不连接正式存档。

`apps/simulation-host/test/npc-custody.test.ts` 覆盖 MemoryStore/PGlite 的独立交接、来源真人旅行继续、回滚重试、收益持久化、越权写入拒绝及后续汇合。预览脚本设置 `PREVIEW_NPC_OWNER=bob` 可实测 Alice 带 Bob 的 NPC 先入场，Bob 再自行进入。

目前仅在可分离边界交接 NPC：正在战斗、施法或仍被持续事件引用的外部活跃 NPC 需先结束相应动作；尚未实现跨实例转移这些未完成事件。客居 NPC 不因来源真人离线而克隆回家，最后离开副本后仍随当前宿主保存，之后匹配从实际驻留实例提取。共享房间有人在场时，社交队伍成员调整仍受现有限制。本次验证不是 Boss 全流程、目标机器容量测试或线上部署验收。
