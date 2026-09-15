# 首次参考数据库审计

审计日期：2026-09-15。

## 已完成

- 通过 GitHub API 固定了 CMaNGOS Classic-DB 来源提交。
- 下载并读取了该提交内的基础数据库压缩归档，记录字节数、SHA-256 和表名清单。
- 归档放在已忽略的 `.cache/source-data/`；代码仓库仅保留审计记录，不把第三方整库加入源码。

| 字段 | 值 |
|---|---|
| 源提交 | `22b51464f1625f6ef6275771de1f5466c6f5d19e` |
| 文件 | `Full_DB/ClassicDB_1_12_1_z2815.sql.gz` |
| 大小 | 12,959,882 字节 |
| SHA-256 | `4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0` |
| 发现的 CREATE TABLE 定义 | 189 |

[固定提交下的源文件](https://github.com/cmangos/classic-db/blob/22b51464f1625f6ef6275771de1f5466c6f5d19e/Full_DB/ClassicDB_1_12_1_z2815.sql.gz)。完整表名与机器可读记录见 [reference-source-lock.json](reference-source-lock.json)。

## 已发现的相关表

- `player_levelstats`、`player_classlevelstats`、`player_xp_for_level`：角色等级与基础成长的候选数据。
- `creature_template`、`creature_template_classlevelstats`、`creature_template_spells`：怪物模板与关联数据。
- `item_template`、`quest_template`：物品与任务候选记录。
- `spell_template`、`taxi_shortcuts`：需要进一步核查用途和覆盖的法术与航路相关表。

存在表名不代表表内记录完整、覆盖原版全部机制或符合 2019 首发规则。此处尚未把记录导入游戏。

## 当前不能作出的结论

- 这不是暴雪官方数据快照，不能据此声称已取得首发怀旧服全部精确数值。
- 基础归档与仓库最新完整数据库状态不同；归档之后的 Updates 尚未应用。
- 该社区来源面向 1.12；与目标怀旧服的差异需要逐项证据，不能直接整库采用。
- 当前尚未固定对应客户端构建与服务器热修边界，也未验证实际掉落概率和服务端脚本。
- `spell_template` 或航路相关表的存在不能替代客户端 DBC/DB2 字段与路线数据的核查。

## 下一阶段的审计顺序

1. 对归档与对应更新链建立可重复的数据提取流程，读取字段定义和记录之间的引用。
2. 固定 2019 首发客户端数据来源与构建号，建立字段差异清单。
3. 列出首版人类法师、四类 AI 队友、区域与死亡矿井涉及的具体记录 ID。
4. 将属性值、技能效果、公式和实际遭遇行为分别验证，记录来源冲突与证据缺口。
5. 只有经过规则版本与阶段检查的记录才进入正式游戏数据包；参考值继续保持参考状态。
