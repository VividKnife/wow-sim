# 怪物与 NPC 的 2D 贴图

世界怪物列表、附近人物、交谈窗口、主城服务、护送人物与战斗生物使用透明背景的完整 Classic 模型渲染图。图片按原始比例显示，不裁成头像，不以技能或职业类型图标代替具体生物。

运行时注册表是 `packages/game-data/data/npc-models-manifest.json`，由 `node scripts/import-npc-models.mjs` 生成。它合并原始肖像归档和当前地图中的生物模板，优先保留归档的明确外观，其余使用本地 `creature_template.ModelId1`。所有图片保存在 `apps/web/public/creatures/portraits`，游戏运行时无需向外部站点请求图片。

`packages/game-data/creature-visuals.js` 统一解析 entry / display ID。没有具体身份的主城服务使用 `serviceModels` 中的代表性职业人物形象，不将代表模型当作该服务的真实 NPC 身份。未注册的模型明确显示缺图状态；新增地图或生物后须重新导入并通过覆盖测试。任务物件仍使用物件符号。

目前注册 692 个生物条目，共享 625 张 300×300 透明 WebP。来源为 Wowhead Classic 模型服务和仓库内模板映射，不宣称与 2004—2006 客户端文件逐字节相同。图片版权属于 Blizzard，代码许可不覆盖游戏美术素材。原始采集证据保留在 `docs/research/import/creature-portraits`。

验证：`node --test apps/web/test/creature-visuals.test.mjs apps/web/test/npc-ui.test.mjs apps/web/test/battle-scene.test.mjs apps/web/test/escort.test.mjs`。覆盖野外及副本怪物、地图中全部已导入 NPC、服务代表形象、资源哈希和实际组件输出。
