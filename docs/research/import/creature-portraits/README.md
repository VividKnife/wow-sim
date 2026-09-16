# 怪物 2D 模型肖像

2026-09-16。新增 **168 张 300 × 300 透明 WebP，共 1,390,194 字节**，对应 **183 个 NPC**。图片为 Wowhead Classic 服务提供的模型渲染图，原始字节未编辑。

现有路线和死亡矿井清单中的 159 个 NPC 全部覆盖；另补 24 个，包含小鬼、虚空行者、魅魔、地狱猎犬、地狱火、末日守卫，以及龙类、巨人、软泥、迅猛龙、豹、鳄鱼、蝙蝠、猫头鹰、陆行鸟、蝎子、风蛇、海龟、土狼等代表。

死亡矿井包含范克里夫、拉克佐、斯尼德、斯尼德的伐木机、基尔尼格、重拳先生、绿皮队长、曲奇及原路线其他 NPC。

## 索引与接入状态

- [按 NPC 浏览图片](CATALOG.md)。
- [完整来源清单](manifest.json)：原始 URL、displayId、NPC 映射、图片 SHA-256、原始页面 SHA-256 及证据级别。
- `packages/game-data/data/creature-portraits-manifest.json`：单独的精简肖像资源表，按 `entries[NPC ID].assetId` 查对应图片。
- 图片：`apps/web/public/creatures/portraits/`。

本轮完成图片与可用映射入库，**未替换战斗页现有类型/家族图标**。原 `creature-assets-manifest.json` 和 `creatureVisual()` 保持不变。每个 NPC 只选择了一个有证据的外观，未覆盖所有模型变体；后续接入时应按实际 displayId 匹配，并保留缺失回退。

## 两种映射证据

1. **159 个：Classic NPC 页面直接证据。** 保留对应页面的 `data-mv-type-id` 和 `data-mv-display-id`，离线验证两者出现在同一个模型元素中。原始 HTML 无损 gzip 存储，解压后字节哈希与原记录一致。
2. **24 个：固定本地参考记录。** 补充 NPC 页面返回 HTTP 403，未绕过限制；改用已固定 ClassicDB 数据中的明确 `ModelId1` 关联，仅下载可访问的 Classic CDN 图片。清单明确标注“页面未确认”，保留原始行、表结构、源文件哈希和失败记录，未将此证据冒称为页面确认。

静态服务 URL 结构由留档的 [Wowhead global-core.js](https://wow.zamimg.com/js/global-core.js) 确认：`/modelviewer/classic/webthumbs/npc/{displayId & 255}/{displayId}.webp`。图片均来自 `classic` 路径，没有改用正式服图片。网页当时记录 Classic 1.15.8 与 viewer `c3f890f`；这不构成 2004—2006 或 2019 首发客户端字节认证。游戏素材权属仍属于 Blizzard Entertainment。

## 校验与重建

需要 Python 和 Pillow，在仓库根目录执行：

```powershell
python docs/research/import/import-creature-portraits.py --verify
```

校验全部图片完整解码、RGBA / WebP 格式、尺寸、SHA-256、NPC ↔ displayId ↔ 图片对应关系、页面原始字节、固定本地源记录及精简资源表一致性。全部 168 张图片和 183 个映射通过；另目视抽查了模型构图与透明背景，没有把技能图标当成模型肖像。

`--from-directory <采集输出目录>` 用于导入新一批原始采集结果；它不是重新请求已受限的 NPC 页面。可复核证据已全部存入仓库，离线校验不依赖工作区外的采集临时目录。
