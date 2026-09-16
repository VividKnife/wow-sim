# 新服务架构死亡矿井集成验收

日期：2026-09-16。

## 方法与边界

独立脚本：`scripts/validate-service-deadmines.mjs`。

```powershell
node scripts/validate-service-deadmines.mjs .cache/refactor-content-mage-cc/final-state.json 14
```

这是 GameService + MemoryStore 的显式 fixture 集成验收，不是通过服务自然练级，也不是 PostgreSQL 或 HTTP/浏览器验收。输入来自普通规则玩法取得的 21 级法师与四名 20 级伙伴。初始化创建账号和伙伴，再把角色、装备、背包和钱包写入 normalized 存储；显式清空旧副本进度、把地点设为入口，并映射为服务稳定 ID。这不是旧存档迁移实现。

运行时通过 `createInstance(contentId=deadmines)`、`startInstance`、`dungeonNext`、`GameService.work`、`rest`、`stop` 和 `leaveInstance` 操作。没有直接调用领域战斗推进来代替服务、没有注入击杀或奖励。

## 已验证

- 五人名册获得各自的实例租约；运行中普通旅行命令被拒绝。
- worker 实际推进到路线游标 14，共击杀 63 个敌人，包含首个必经首领拉克佐（644）和稀有矿工约翰森（3586）。角色身份在每场结束后保持一致。
- 开战前另有受控死亡 fixture：把盗贼生命设为 0，验证推进拒绝；通过牧师复活命令和 worker 完成施法，确认角色快照中的生命值已持久化恢复。此项不冒称自然战斗死亡。
- 退出前主角增加 2,974 铜。战利品 ID 唯一，归属正确；伙伴钱包没有复制主角的货币奖励。
- `leaveInstance` 释放全部五个角色租约；重建 GameService 后，账号五人名册、稳定 ID、存活状态和主角余额保留，角色不再处于实例中。

**范围只到 14/58 路线。** 退出后实例状态为 `completed` 表示无人留在实例的关闭状态，不表示死亡矿井全 58 段已清。完整路线仍只有另一次纯规则验收证据，不混作服务集成结果。

机器可读运行结果：`.cache/refactor-service-deadmines.json`；逐场日志：`.cache/refactor-service-deadmines.log`。脚本依赖显式提供的初始化快照，不加入常规单元测试默认发现范围。本次未修改生产代码。
