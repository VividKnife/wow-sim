# 法术与 Buff 图标

技能书的图标索引只覆盖部分可学习技能，不能用它代表全部触发法术、光环或消耗品效果。`catalog.icon('spells', id)` 优先保留已有的法术和天赋图标，再按当前法术的 `SpellIconID` 查找 `spell-icon-map.json`。HUD 与战斗面板共用这条解析路径。

图标编号与文件名来自仓库内固定的 `docs/research/import/item-profession-assets/sources/SpellIcon.dbc`。生成器匹配已经收录的本地图标，去掉 DBC 路径及 `.tga` / `.blp` 扩展名，不根据相似技能名称猜图标。补充下载的 41 个原始 JPEG 的来源和 SHA-256 记录在 `docs/research/import/spell-effect-icons-manifest.json`。

新增图标资源后运行：

```sh
node scripts/build-spell-icon-map.mjs
node scripts/build-spell-icon-map.mjs --check
node --test apps/web/test/spell-icons.test.mjs apps/web/test/player-buffs.test.mjs
npm run data:compile
```

图标运行时全部从本地静态资源读取。没有真实法术记录的自定义效果（例如金团战斗药剂）在展示层显式指定图标。
