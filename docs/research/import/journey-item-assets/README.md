# 路线物品显示资产

范围为新角色普通玩法回放实际获得的物品及当前路线任务所需、奖励、启动物品，共 299 件，188 个唯一 PNG。`scope.json` 保存范围来源和校验值；这不是整个经典旧世物品库的覆盖声明。

中文名和图标标识来自 Classic 中文 tooltip，原始响应保存于 `tooltips/`。图片来自 Gethe/wow-ui-textures 的固定 2019 年提交 `b852b560442b31579e77ef3967b3c2d594832da8`；导入器同时校验 PNG 签名、Git blob SHA-1 和 SHA-256。全部映射与来源见 `manifest.json`。

`../import-journey-item-assets.py` 生成 `apps/web/data/journey-item-assets.json` 和本地图标文件。只补充显示名称与图片，不从现行 tooltip 更新伤害、价格、掉率、物品属性等数值。现有明确本地化和图标映射优先。
