# 物品、装备、职业及生活技能图标补全

2026-09-16。本轮新增 **1,279 张固定版本 PNG，5,183,034 字节**。已补充 `packages/game-data/data/icon-map.json`，现有物品、装备、背包、工坊产物及资源卡片通过原有图标接口即可取得新增映射；未修改数值、制造规则或页面布局。

## 覆盖结果

| 范围 | 校验结果 |
|---|---:|
| 当前登记物品 | 9,818 / 9,824 有图标（此前 334） |
| 其中武器、护甲 | 6,070 / 6,076 |
| 原始物品记录 | 9,686 / 9,692 |
| 项目自定义附魔卷轴 | 132 / 132，明确复用对应附魔技能图标 |
| 生活技能配方、等级和专精技能 | 1,289 / 1,289 |
| 专业 / 生活技能类别 | 12 / 12 |
| 制造配方产物 | 1,225 / 1,225 个唯一物品 |
| 制造材料 | 430 / 430 个唯一物品 |
| 配方书物品 | 781 / 781 个唯一物品 |
| 当前材料市场范围 | 2,322 / 2,322 个唯一物品 |
| 当前九职业技能 | 1,517 / 1,517，校验并保留已有映射 |
| 当前天赋节点 | 432 / 432，校验并保留已有映射 |

上述范围来自当前游戏登记数据，不是整个 Vanilla 数据库，也不表示所有记录都可由玩家获得。数据库内的 NPC 专用武器和废弃物品仍单独保留身份；自定义附魔卷轴不是原版物品。

生活技能包含炼金、锻造、制皮、裁缝、工程、附魔、烹饪、急救、采矿、采药、剥皮、钓鱼。12 个类别图标已写入 `icon-map.json.professions`；当前侧栏没有新增图标组件。

## 索引和来源

- [分类素材目录](CATALOG.md)：武器、护甲、消耗品、材料、配方书等分类列表，以及生活技能图标。
- [完整清单](manifest.json)：逐物品 / 技能映射、来源依据、图片哈希和缺口。
- [范围快照](scope.json)：原有映射基线、当前登记身份，以及输入数据包的 SHA-256。
- `sources/ItemDisplayInfo.dbc`、`SpellIcon.dbc`、`SkillLine.dbc`：固定客户端表镜像原始字节。
- `sources/selected-spell-records.json`：选中技能的完整 DBC 行、图标字段位置和原始 Spell.dbc 哈希。较大的 Spell.dbc 从固定地址重建于忽略的缓存目录，不重复纳入 Git。

身份映射来自 [soyalu/cmangos-classic-map 固定提交](https://github.com/soyalu/cmangos-classic-map/tree/93b11b73ee4e483ce414f3d5f99a9047d23a9e48/dbc)：物品使用 `item_template.displayid → ItemDisplayInfo.InventoryIcon`；技能使用 `Spell.SpellIconID → SpellIcon`；12 个专业使用 `SkillLine.SpellIconID → SpellIcon`。DBC 来源是第三方镜像，准确客户端构建号未经独立认证。

导入前，334 个已有物品图标与 DBC 推导结果全部一致；已有职业技能 `SpellIconID` 与 DBC 对应字段全部吻合。917 和 3350 两项纹理名差异通过保存的 Classic tooltip 确认，未按相似名称猜配，也未导入 tooltip 数值。

PNG 来自 [Gethe 固定 2019-05-27 提交](https://github.com/Gethe/wow-ui-textures/commit/b852b560442b31579e77ef3967b3c2d594832da8)，逐文件核对 Git blob SHA-1、SHA-256 和完整解码。它是 Classic 预发布快照的 PNG 镜像，不是原始 BLP 或首发客户端字节认证。游戏素材权属仍属于 Blizzard Entertainment。

## 6 项明确缺失

| ID | 来源名称 | 原因 |
|---:|---|---|
| 2716 | Monster - Item, Bottle - Green | NPC 专用；固定快照缺少所引用纹理，tooltip 未给出图标 |
| 2717 | Monster - Item, Bottle - Black | 同上 |
| 2718 | Monster - Item, Glass - Clear | 同上 |
| 4574 | Destroy Me | 无有效图标，Classic tooltip 返回 404 |
| 6128 | Primitive Robe | 固定快照缺少所引用纹理，Classic tooltip 返回 404 |
| 25818 | Monster - Shield, Legion | 固定 DBC 无对应显示记录，Classic tooltip 返回 404；不认定为有效 Vanilla 玩家装备 |

缺失不会悄悄配上相近图片。自定义卷轴的 132 条映射使用 `adapted-item` 来源标识。

## 重跑与校验

需要 Node.js 与含 Pillow 的 Python。工作目录为仓库根目录：

```powershell
# 当前范围重跑；保留现有身份快照与基线
python docs/research/import/import-item-profession-assets.py
python docs/research/import/import-item-profession-assets.py --verify
npm run data:compile
npm run data:check
```

只有明确需要更新采集范围时，才先运行 `node docs/research/import/export-item-profession-scope.mjs`。它会重建 scope，包括当前已有图标基线；不要为了重现本次新增统计而覆盖原基线。

本次 2,163 张引用图片全部通过完整解码、大小及 SHA-256 校验，其中 1,695 张 PNG 另通过固定 Git blob 校验；所有映射及缺口覆盖范围吻合。重新导入拒绝接受已经入库、但字节发生变化的文件。
