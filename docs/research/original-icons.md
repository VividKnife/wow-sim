# 原版图标与头像：来源与接入约定

日期：2026-09-15。状态：用户要求已确认，候选来源已调查；尚未完成素材下载、首发版本核对和界面接入。

## 覆盖范围

| 类型 | 接入方式 |
|---|---|
| 技能 | 技能 ID → 对应版本的图标资源标识 → 图标文件 |
| 天赋 | 天赋节点及关联技能记录 → 原版天赋图标，节点层级与点数另存 |
| 物品 | 物品 ID → 对应版本的显示/图标关联 → 图标文件 |
| 人物 | 原版职业、种族图标与可取得的静态头像；具体外貌肖像单独核对 |

数值相同或名字相同都不保证可以直接共用映射。技能的各等级可以使用同一图片，但它们仍然是不同的技能数据记录。

## 候选资料

- [Gethe/wow-ui-textures](https://github.com/Gethe/wow-ui-textures)：游戏界面纹理镜像。已确认存在 classic 分支及 ICONS、CHARACTERFRAME、TALENTFRAME、SPELLBOOK 等目录。分支名不是固定版本，必须进一步锁定提交与逐图验证。
- [WoWDBDefs SpellIcon 定义](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/SpellIcon.dbd)：旧版结构提供图标 ID 与纹理文件名的映射线索。
- [WoWDBDefs SpellMisc 定义](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/SpellMisc.dbd)：不同构建存在 SpellIconID 或 SpellIconFileDataID 等字段，应选取目标构建对应布局。
- [WoWDBDefs ItemDisplayInfo 定义](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/ItemDisplayInfo.dbd)：物品显示资源的关联结构线索；表定义本身不包含完整素材或物品映射记录。

这些来源用于发现资源和理解映射，不表示所有素材已经与 2019 首发版本一致。查询到的一个早期 classic 历史记录标为 1.13.2 (30550)，日期为 2019-05-27；只能作为早期候选，不能直接认定为首发资源快照。递归文件枚举曾返回服务端错误，尚未验证具体图标文件清单。

## 接入约定

1. 每个图标映射记录规则版本、实体类型/ID、源图标资源标识、原始文件路径、来源提交和文件校验值。
2. 先收集首版真正引用的图标，避免把大型整套客户端素材直接打包进网页。
3. 原始图标内容保持不变。品质边框、选中状态、数量、冷却遮罩和天赋点数在界面层绘制。
4. 手机端使用清晰的源图、稳定尺寸与文字名称，避免仅凭颜色或图片辨认技能。
5. 缺失资产在资产清单中显式登记；临时占位不视为原版素材已完成。
6. 人物的职业图标、种族图标和具体角色肖像使用不同字段，防止把它们混为一个身份图像。

当前仅更新需求与资产方案，没有改动模拟核心，也没有宣称界面已经使用原版图标。
