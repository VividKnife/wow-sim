# NPC 玩家组队

主角18级开放冒险者大厅。大厅维护50位有稳定身份、职业、装备、天赋、好友关系、钱包和冒险记录的 NPC 玩家；使用至多四人的出征名单组成五人副本小队。不存在自有队友招募、更换、付费换职业或自选生活职业。

`npcVisit` 初始化或查看大厅；`npcRefresh` 每五分钟更换六位本批冒险者，覆盖坦克、治疗、输出，保留档案；`npcFriend` 保存好友；`npcGroup` 保存名单，空数组或 null 清空；`npcRecommend` 按职责与好友补齐名单；`npcLootPolicy` 设置主角自动按需掷点。

五人副本中 NPC 自主管理技能、天赋与装备；绿色及以上可装备掉落使用需求／贪婪／放弃。提升装备自动换装，其他所得转为旅费。成员被主角实例租约统一保护，不为 NPC 创建自有角色或独立玩家钱包行。服务重启、离开副本后重新组队保留相同档案。

满级后同一批 NPC 可参与[金团](../design/gold-raids.md)。金团消费、分红、装备和参团经历回写原档案；竞技场使用大厅选定的同行名单，战斗消耗不写回。

内部 `createNpcMember` 仅构造 NPC 基础角色，供居民和战斗夹具使用，不是玩家可调用的招募命令。`recruit`、`createCompanion` 与佣兵雇佣入口已删除。

验证：`node --test packages/game-domain/test/npc-world.test.ts packages/game-domain/test/gold-world.test.ts`。界面预览使用 `apps/web/test/browser/party.html`，不连接正式存档。
