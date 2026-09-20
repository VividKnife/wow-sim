# 监狱物品显示资源

范围由 `stockades-reference.json` 的 18 个任务中所有起始、目标、固定奖励和选择奖励物品，以及三件监狱首领装备（2941、2942、3228）组成，共 20 件。

中文名称与图标标识来自 Wowhead Classic `tooltip/item/{id}?locale=4`。原始响应保存在 `tooltips/`，清单记录来源 URL 与 SHA-256。仅采用显示名称和图标标识；属性、价格、掉率和任务要求仍来自固定数据库。

图标 PNG 来自既有 2019 预发布归档提交 `b852b560442b31579e77ef3967b3c2d594832da8`，逐个验证 Git blob SHA-1 与成品 SHA-256。共享图标复用已有本地文件。素材权属属于 Blizzard Entertainment。

重新导入：`python docs/research/import/import-stockades-item-assets.py --tree <source-tree.json>`。

验证：`node --test packages/game-data/test/stockades-item-assets.test.mjs`。
