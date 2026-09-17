# 技能效果执行、光环与天赋联动

版本：2019 Classic Phase 1 / 1.12 参考；更新：2026-09-17。

## 架构

采用公开 Classic 参考核心的结构：法术数据描述效果，效果执行器分发，光环保存归属与状态，天赋通过技能族修正器和战斗事件联动。暴雪完整服务端实现没有作为本项目输入；此文不声称复刻其内部代码。

| 层 | 模块 | 责任 |
| --- | --- | --- |
| 数据解释 | `sim-core/src/spell-program.js` | 按顺序解码三个 Effect 槽，保留效果索引、目标、机制、触发技能、数值和技能族；声明源数据的修正操作及属性位 |
| 法术准备 | `spellInfo`、`talent-effects.js` | 读取技能等级、天赋等级、精确技能族掩码、装备和形态条件；计算消耗、施法时间、冷却和范围 |
| 施法状态 | `spell-timing.js`、`beginTalentCast/endTalentCast` | 资源提交、技能/类别/GCD 时钟、一次性增益消费和本次施法快照 |
| 效果执行 | `spell-effect-runtime.js` | 按 Effect ID 分发伤害、治疗、吸血、资源、驱散、打断、连击点、持续效果和触发技能；武器效果先合并再结算一次 |
| 数值结算 | `spell-resolution.js`、`resolveHeal` | 共用法伤系数、效果索引、暴击和连锁衰减；最终进入生命、仇恨、记录与事件处理 |
| 光环生命周期 | `spell-aura-lifecycle.js`、`combat-auras.js` | 等级覆盖、来源归属、源数据的逐施法者标记、叠层、免疫、驱散整个法术效果组 |
| 天赋事件 | `talent-runtime.js` | 暴击、挥击、成功施法、治疗、受击、击杀等事件触发；可序列化状态支持恢复和分段推进 |
| 特殊脚本 | 职业、种族、宠物、仪式、旅行模块 | 保留不能仅凭通用 Effect 字段表达的机制；它们不应自行重写公共数值规则 |

通用执行器接受 `effects` 选择器，可以只执行某个效果槽，避免周期效果重复执行同一技能的直接伤害。递归触发继承原施法快照和父技能 ID，不重新启动 GCD；循环和超深触发链返回明确的未处理结果。

未知 Effect 返回 `requires-spell-script`，不能从“技能名称已经登记”推断全部效果都正确。通用处理器当前已用于扩展职业技能、图腾、宠物技能及触发链；基础法术与其他特殊路径共享伤害计算，但仍有专用效果路由，尚未宣称所有路径统一完毕。

## 修正的行为

- 连锁闪电的衰减同时作用于基础伤害和法伤；治疗链的衰减同时作用于基础治疗、治疗加成和浮动数值。
- 普通治疗和持续治疗的增益只应用一次。引导治疗使用其每跳治疗系数；法力燃烧按实际燃烧资源计算，不额外套用普通直伤法伤系数。
- 冲击波等扩展火焰技能与基础火焰技能通过同一伤害事件触发点燃、冲击。点燃刷新将尚未结算的伤害计入新周期，不创建同一施法者的平行副本。
- 通用连击点效果去掉错误的非数值上限参数，避免状态变成 `NaN`。
- 驱散以法术 ID 与施法者形成的效果组为单位，一次移除同一法术的多个效果；不同施法者保持独立。友方驱散移除负面效果，敌方驱散移除增益；过期效果不占次数，抵抗不会被记为成功移除。
- 沉默光环停止使用另一个无法随驱散清理的计时器；施法被控制中断时同步释放读条占用。
- 高等级增益不会被低等级覆盖；源数据要求逐施法者独立的光环使用独立身份；普通光环仍遵守等级链覆盖规则。
- 天赋修正尊重 `IGNORE_CASTER_MODIFIERS` 属性位，技能族匹配使用精确整数掩码。

## 全量清单与验证层次

运行 `npm run combat:audit` 生成 [逐技能与天赋清单](../research/spell-contracts.json)，`npm run combat:audit:check` 检查是否与当前代码及数据一致。

清单包括全部 **1,759 条公开技能等级记录、2,525 个效果槽、432 个天赋节点、1,357 个天赋等级、13,402 条天赋修正关系**。当前这些技能引用的触发子技能没有缺失记录。

`apps/web/test/spell-effect-runtime.test.mjs` 提供：

- 每条技能记录的效果槽解码和源数据不变性验证。
- 213 个直接魔法伤害效果的独立执行及源数值区间验证。
- 71 个直接治疗效果的独立执行、治疗浮动区间和单次结算验证。
- 220 个周期伤害/治疗效果的独立应用、每跳基础数值和时钟验证。
- 每个天赋修正等级对本职业全部公开技能的掩码匹配检查，以及跨技能族拒绝、等级替换和源数据属性位测试。
- 连锁衰减、治疗倍率、法力燃烧、完整驱散、光环等级覆盖、免疫、触发递归和冲击波—点燃的行为测试。

这些验证有不同强度。独立效果的数值测试不覆盖完整施法路径、所有目标选择及所有天赋组合；掩码正确不代表每个事件触发条件已得到官方实测确认。清单明确保留 `everyAbilityEndToEndVerified: false`，其余效果仍标为需要场景验证，避免虚报完整覆盖。

## 参考依据与剩余边界

参考代码固定为 CMaNGOS `8ec338a1704e7dcb1c0213eb7ed58f9231ade40f`：

- [SpellEffects.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/SpellEffects.cpp)：Effect ID 分发及不同类型效果的责任划分。
- [SpellAuras.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/SpellAuras.cpp)：光环效果与周期行为参考。
- [SpellDefines.h](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Spells/SpellDefines.h)：修正操作、逐施法者光环与忽略施法者修正的属性位。
- [Player.h](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Player.h)：技能族修正器聚合规则。
- [Unit.cpp](https://github.com/cmangos/mangos-classic/blob/8ec338a1704e7dcb1c0213eb7ed58f9231ade40f/src/game/Entities/Unit.cpp)：光环覆盖及点燃剩余周期伤害的处理参考。

来源均属于社区参考实现，不能替代目标版本官方战斗记录。跨施法者点燃的历史版本差异、所有技能的快照/动态属性规则、多个吸收盾与减伤的顺序、全部触发内部冷却、目标选择例外、特殊首领规则和专用效果路径仍需逐项校准。原有数值及空间限制继续见 [combat-rules.md](combat-rules.md)。
