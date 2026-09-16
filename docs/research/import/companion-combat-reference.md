# 五人职业战斗参考与验证

## 固定证据

目标仍是 2019 Classic 第一阶段；下列数值取自固定的社区 1.12 来源，不代表已经与暴雪 2019 服务端逐项核验。

- [Player.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Player.cpp)：RewardRage、Regenerate、GetSpellCritFromIntellect。
- [Unit.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Unit.cpp)：GetAPMultiplier、OCTRegenMPPerSpirit。
- [StatSystem.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/StatSystem.cpp)：法师、牧师攻击强度为力量减 10。
- [SpellEffects.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/SpellEffects.cpp)：Eviscerate 每连击点增加攻击强度的 3%。
- [ThreatManager.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Combat/ThreatManager.cpp)：近战超过当前目标 110%、远程超过 130% 才转移目标；最高远程尚未达标时仍需检查其他近战挑战者。
- SQL 固定提交 `22b51464f1625f6ef6275771de1f5466c6f5d19e`，归档 SHA256 `4f92db520868ab4e566726f68b5b2e380ae781209beaf22237b4f7f04600d0c0`。技能等级、耗能、时间、效果范围来自现有提取表；7376 / 21156 姿态被动完整行另存 `apps/web/data/companion-passive-reference.json`。

## 已接入

- 战士：白字造成/承受伤害产生怒气；10 级后使用防御姿态的伤害、减伤与仇恨系数；嘲讽复制最高仇恨并强制目标 3 秒、冷却 10 秒；破甲最多 5 层、每层 90、消耗内部怒气 150；富余怒气时排队下一次英勇打击。
- 盗贼：100 能量上限，每两秒 20；邪恶攻击使用武器标准化攻击强度速度，生成目标专属连击点；四点起使用刺骨（当前简中本地化名称），真实消耗能量和连击点。
- 牧师：根据存活队友血量、缺口、法力和治疗读条时间选择已学直接治疗；低血量优先较快治疗，法力充裕且无迫切治疗需求时施放惩击。记录有效治疗与过量治疗，仇恨仅按有效治疗的一半分配给存活敌人。
- 牧师/法师队友的战斗法力恢复遵守五秒规则。共同战斗中实际获得经验、升级、学习对应等级技能；未参战队友不随队长升级。
- 低等级法术暴击率改用上述 Player.cpp 的等级公式。**上游该公式本身保留 MUST BE CHECKED 注释，不能称为官方精确值。**
- UI 读取实际队友生命/法力/怒气/能量、已学技能、装备和装备分配条件。治疗事件用绿色正数飘字，不当成受伤震动。
- 23 项队友技能名称和图标映射来自当前 Classic tooltip 的显示字段；11 张原版图像匹配固定 2019 预发布 Git 树并校验 Git blob SHA1。详见 `companion-assets/manifest.json`。未用当前 tooltip 的伤害数值替换固定 SQL。

## 2D 策略选择

队友选目标、治疗阈值、四点终结技、富余怒气阈值、自动防御姿态和初始装备预算属于本项目 AI 决策，不冒充原版玩家操作规则。招募不收费；初始装备不可通过替换装备刷出可售物品。

## 实际验证

`apps/web/test/party-combat.test.mjs` 覆盖：读条治疗与实际扣蓝、仅 7 点有效治疗对应 3.5 仇恨、嘲讽与破甲、能量和连击、分段模拟等价、五秒规则、职业基础公式、队长倒地而队友仍战斗时不能通过返回尸体立即复活、110%/130%多挑战者选择。

单场平衡夹具：固定种子 283，18 级五人、队长起始装备、按当前装备预算招募，技能按等级提供。两只 598 矿工在 12.6 秒结束，治疗 90；644 拉克佐基础属性遭遇在 85.7 秒结束，治疗 1079、牧师剩 11 法力，均无阵亡。这只是职业分工与资源压力的观测：没有完整首领技能，也没有连续副本补给链，**不构成死亡矿井通关或正常升级验证**。

390×844 手机浏览器检查队伍页、候选人排列和野外招募禁用状态；本轮没有替当前玩家招募角色。招募和装备移交通过真实引擎测试覆盖，仍待完整旅程中的浏览器操作。

独立复核发现并修复：双手武器与副手冲突、投掷武器整叠装备时数量丢失、队友优先攻击被变形目标。新增回归覆盖双向武器限制、远程槽位、200 件投掷武器的 UID/数量保留、背包不足时原子失败、两件换下装备的绑定所有者保留，以及存在其他目标时保留变形术。

## 尚未完成

死亡矿井路线接入、怪物技能、离线冻结和单页控制权、连续战斗的全队补给与复活、可更换/待命队友；近战完整攻击表（躲闪/招架/格挡/偏斜/武器熟练度）、部分未命中返还能量规则、全部职业辅助技能、全部天赋以及完整正常倍率 1—20 旅程。不能用本专项测试通过来关闭这些验收项。
