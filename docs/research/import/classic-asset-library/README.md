# 原版 / Classic 素材扩充

采集日期：2026-09-16。范围与接入状态：素材入库，未修改游戏页面、音效播放规则或数值。

本轮新增 **715 个文件，12,702,579 字节（约 12.11 MiB）**；复用已有 120 个文件。完整清单包含 835 项，13,368,566 字节。来源证据另计，约 5.22 MiB。

| 分类 | 本轮新增文件 | 本清单收录 | 内容 |
|---|---:|---:|---|
| 图标 PNG | 364 | 472 | 现有九职业技能、天赋资产清单引用的固定版本图标 |
| 界面 PNG 候选 | 239 | 239 | 27 套天赋背景的 108 块原始纹理、种族/性别临时头像、任务/NPC 服务、背包、钱币、军衔、团队标记、鼠标指针、按钮、施法条等 |
| 地图 JPEG | 46 | 46 | 38 张野外地图、5 张主城地图、3 张战场地图 |
| 音效 OGG | 66 | 78 | 冲锋、打断、治疗、复活、潜行、变形、控制、召唤、炉石等 58 个技能页面关联声音 |

加上此前已有的艾尔文森林、西部荒野和暴风城，当前 `public/maps` 共 49 张地图，六大主城均有收录。地图为 enUS 原图，未中文化或裁切。副本分层地图、世界/大陆总图、区域背景音乐和环境循环音尚未在本轮覆盖。

## 使用索引

- [可点击素材目录](CATALOG.md)：地图、音效、图标、界面纹理及尺寸/时长。
- [机器清单](manifest.json)：路径相对 `apps/web/public`，逐文件记录来源 URL、字节数、SHA-256、图片尺寸或声音参数。
- [选取范围](scope.json)：本轮精确白名单，可用于继续扩充。
- `sources/`：固定 Git 树、提交信息和原始技能网页；清单记录证据文件 SHA-256。
- [音频解码结果](audio-decode-check.json)：78 段声音均实际解码，并核对帧数、采样率、声道和时长。

`relatedSpellIds` 仅表示声音出现在对应技能页面中，不能直接当成施法/命中/循环阶段的播放映射。语音台词本轮为 enUS；`sourceLocale` 保留来源服务的语言路径。非语音声音的语言路径不代表声音内容经过本地化。

## 来源和版本边界

- PNG：[Gethe/wow-ui-textures 固定提交](https://github.com/Gethe/wow-ui-textures/commit/b852b560442b31579e77ef3967b3c2d594832da8)，提交标记 `1.13.2 (30550)`，时间 2019-05-27。逐文件核对 Git blob SHA-1，保留镜像 PNG 字节。它是预发布快照，不是 2019 首发客户端逐字节认证；PNG 也不是客户端原始 BLP 格式。
- 此快照包含其他资料片遗留文件，因此只按白名单选择，不能把整库视作 Vanilla 素材。239 张界面纹理仍标注为候选，尚未逐张对照 1.12 客户端。种族头像是临时占位头像，不代表实际角色外貌。
- 地图：Wowhead Classic 地图服务的区域原图；Zone ID、具体 URL、SHA-256 与原图尺寸均留档。未据此新增地点坐标，也未套用现有示意节点坐标。
- 音效：Wowhead Classic 技能页面列出的音频 URL，并与 [fondlez/wow-sounds 固定 Vanilla 清单](https://github.com/fondlez/wow-sounds/tree/c29b446631c5add9334dbf2376843bde30b66c1f/vanilla)中的 `1.12.1.5875` 文件路径逐一核对。保留服务提供的 OGG 编码，不声称是 1.12 WAV 原始字节。
- 游戏美术和音频仍属于 Blizzard Entertainment；镜像仓库代码许可不改变素材权属。

## 明确缺口

以下 4 个当前职业图标标识在固定快照中不存在，保留现有 JPG，未按相近名称猜配：

- `classic_ability_druid_demoralizingroar`
- `classic_spell_fire_elementaldevastation`
- `classic_spell_holy_blessingofprotection`
- `classic_spell_nature_healingway`

自动射击（技能 75）页面没有音频记录，尚未建立弓、枪、弩等武器类型映射。缺口也记录在 `manifest.json` 的 `missing` 数组中。

## 重跑和验证

需要 Python 3 和 Pillow；音频实际解码另需 soundfile。使用项目根目录为工作目录：

```powershell
python docs/research/import/import-classic-asset-library.py
python docs/research/import/import-classic-asset-library.py --verify
python docs/research/import/verify-classic-asset-audio.py
node --test apps/web/test/combat-sound-assets.test.mjs apps/web/test/journey-item-assets.test.mjs
```

导入可复用已下载文件；已入清单文件哈希发生变化时拒绝重新背书。`--verify` 完全离线，检查范围完整性、来源证据、Git blob、SHA-256、图片完整解码，以及 OGG 全页 CRC、序号、首尾标记和 Vorbis 元数据。实际解码检查通过不等于所有声音已经人工听辨。

本次验证：835 项完整性校验通过、757 张图片完整解码通过、78 段音频完整解码通过、3 项现有素材测试通过。

另修正旧路线物品清单的一条 scope 哈希：原记录对应 CRLF，仓库实际保存 LF；已验证仅换行不同，299 件物品范围及素材未变。新增原始来源响应在 `.gitattributes` 中禁用文本换行转换，生成 JSON 固定使用 LF，避免后续检出改变证据哈希。
