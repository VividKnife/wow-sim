# 原版图标与头像：来源与接入约定

更新：2026-09-16。图标、地图、声音已有本地素材和来源记录；当前运行时素材与新增待接入素材分别记录，不宣称已通过 2019 首发客户端逐字节核对。

## 当前素材入口

- [第二轮：物品、生活技能和怪物肖像](import/2026-09-16-assets-round2.md)：新增 1,447 张图片；补齐 9,818 个物品的图标映射、1,289 个生活技能图标，并收录 183 个 NPC 对应的 168 张 2D 模型图片。
- [本轮扩充与验证报告](import/classic-asset-library/README.md)：新增 715 个文件，含 364 张图标、239 张界面纹理候选、46 张地图和 66 段音效；835 项含复用资产均已核验。
- [可点击素材目录](import/classic-asset-library/CATALOG.md)与[完整来源清单](import/classic-asset-library/manifest.json)。
- [现有路线物品素材](import/journey-item-assets/README.md)与[现有战斗音效](import/combat-sounds/README.md)。
- 运行时图标/地图数据现位于 `packages/game-data/data`，静态文件位于 `apps/web/public`。第二轮物品/技能已接入原有映射入口；新地图、界面纹理、额外声音及怪物肖像的接入状态见各批次报告。

## 覆盖范围

| 类型 | 接入方式 |
|---|---|
| 技能 | 技能 ID → 对应版本的图标资源标识 → 图标文件 |
| 天赋 | 天赋节点及关联技能记录 → 原版天赋图标，节点层级与点数另存 |
| 物品 | 物品 ID → 对应版本的显示/图标关联 → 图标文件 |
| 人物 | 原版职业、种族图标与可取得的静态头像；具体外貌肖像单独核对 |

数值相同或名字相同都不保证可以直接共用映射。技能的各等级可以使用同一图片，但它们仍然是不同的技能数据记录。

## 候选资料

- [Gethe/wow-ui-textures](https://github.com/Gethe/wow-ui-textures)：游戏界面纹理镜像。本项目使用固定提交及 Git 树验证，不直接依赖会变化的 classic 分支。
- [WoWDBDefs SpellIcon 定义](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/SpellIcon.dbd)：旧版结构提供图标 ID 与纹理文件名的映射线索。
- [WoWDBDefs SpellMisc 定义](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/SpellMisc.dbd)：不同构建存在 SpellIconID 或 SpellIconFileDataID 等字段，应选取目标构建对应布局。
- [WoWDBDefs ItemDisplayInfo 定义](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/ItemDisplayInfo.dbd)：物品显示资源的关联结构线索；表定义本身不包含完整素材或物品映射记录。

已锁定 Gethe 提交 `b852b560442b31579e77ef3967b3c2d594832da8`，标为 1.13.2 (30550)，日期为 2019-05-27；本轮所用 Git 树与具体文件已经下载和验证。该快照仍不能认定为首发资源快照，其中其他资料片遗留文件未因存在于该库就自动纳入原版范围。

## 接入约定

1. 每个图标映射记录规则版本、实体类型/ID、源图标资源标识、原始文件路径、来源提交和文件校验值。
2. 先收集首版真正引用的图标，避免把大型整套客户端素材直接打包进网页。
3. 原始图标内容保持不变。品质边框、选中状态、数量、冷却遮罩和天赋点数在界面层绘制。
4. 手机端使用清晰的源图、稳定尺寸与文字名称，避免仅凭颜色或图片辨认技能。
5. 缺失资产在资产清单中显式登记；临时占位不视为原版素材已完成。
6. 人物的职业图标、种族图标和具体角色肖像使用不同字段，防止把它们混为一个身份图像。

本页记录素材入口与接入约定；具体下载、覆盖、缺失和接入状态以对应批次清单为准。
