# 熔火之心：25人地图副本

主游戏「团本」仅提供金团入口，使用与5人本相同的地图组件。包含十名首领、十五组小怪、分支路线、目的地推进、暂停、全清规划和检查点。底图使用暴雪客户端原版熔火之心插图，首领和怪群标记按房间叠加，素材来源及校验见[原版地图接入](../research/import/dungeon-maps.md)；首领机制和小怪配置为本作改编，掉落使用固定版本 ClassicDB 1.12 表，不是原版40人的完整数值复刻。

## 游玩流程

创建页可选择60级团本体验法师，或使用存活的60级主角。先公告规则，再从持久冒险者大厅邀请24名NPC并锁定名单。全团至少2坦克、5治疗。

点击地图上的怪物群或首领，查看组成、机制、掉落及沿途路线，再选择推进。不能越过未清理的沿途遭遇，每场胜利保存节点，3秒后继续下一场。选择的目的地清理完成后停止。全清按地图编排依次完成所有区域。

有队员倒下、团灭、撤退或未领取战利品时停止推进。在营地休整10秒可复活和恢复全团，随后从地图继续。每次开战补足资源；首领之间可以调整战术和装备。退出、服务重启和重新进入保留首领、小怪与当前位置。

前八名首领允许按分支选择顺序。全部击败后熄灭符文并解锁管理者，击败管理者后解锁炎魔之王。完成十首领后结算分金，本周不能再次开团刷取相同首领。

## 遭遇设计

| 区域／首领 | 当前机制 |
| --- | --- |
| 入口与熔岩桥 | 双熔核巨人践踏、奔腾者与歼灭者冲击 |
| 犬巢 | 六只烈焰小鬼、四犬群、上古熔火恶犬恐惧 |
| 烈焰行者营地 | 战士配祭司，祭司治疗同伴；优先集火施法者 |
| 熔岩深处 | 摧毁者、火焰之王、熔岩元素混编，火雨要求撤离 |
| 鲁西弗隆 | 双护卫、可驱散末日、资源消耗诅咒 |
| 玛格曼达 | 狂暴／宁神、恐惧／防恐、熔岩炸弹 |
| 基赫纳斯 | 双随从、减疗诅咒、火雨 |
| 加尔 | 四火誓者，死亡爆炸并强化首领攻击 |
| 迦顿男爵 | 活体炸弹离群、可驱散点燃法力、地狱火撤离 |
| 沙斯拉尔 | 奥术易伤诅咒、魔爆术、传送重置仇恨 |
| 萨弗隆先驱者 | 四治疗祭司、可驱散暗言术：痛 |
| 古雷曼格 | 双熔岩犬牵制、炎爆术、濒死地震；首领死后犬消散 |
| 管理者埃克索图斯 | 四精英与四医师；本体免疫，护卫全灭后投降 |
| 拉格纳罗斯 | 炎魔之怒击退与减仇恨、熔岩爆发、潜入熔岩时六烈焰之子；清完提前现身 |

坦克分担首领和随从；治疗与支援跨小队执行。驱散、资源、伤害、免疫、仇恨、移动沿用共同战斗引擎。25人改编的常规单场狂暴上限为180秒，拉格纳罗斯含潜入阶段，狂暴上限为240秒。

## 奖励与持久化

金团使用 ClassicDB 1.12 原版掉落图，包含十首领（管理者使用炎魔宝箱）、当前路线小怪、引用掉落组、材料、配方、T1、炎魔 T2 腿及传说任务材料。没有按玩家职业筛选的保底，也没有固定三件或30%特殊掉落。每周首次清理节点按实际数量后台拍卖，任务条件掉落直接发给符合条件的玩家。拍卖不阻挡路线，非装备拍品不会进入NPC装备槽。详情见 [MC 掉落来源](../research/import/molten-core-loot.md)。

周一00:00 UTC新建团队时重置该团本地图进度。进行中的实例保留进入时周资格。重复请求不重复领取奖励。实例租用主角，24名NPC保存在模拟状态内并写回冒险者大厅；离团保留资产与本周地图进度。

## 实现与验证

- `molten-core-content.js`：首领、小怪模板、地图节点、路径与解锁条件。
- `molten-core-navigation.js`：沿途战斗、停止、清理检查点和继续推进。
- `molten-core-battle.js`、`molten-core-encounter.js`、`molten-core-mechanics.js`：遭遇构造、支援与十首领机制。
- `gold-raid.js`：奖励、经济、名单与视图；`npc-world.js`：持久成员档案。
- `dungeon-map.tsx`：5人本和金团共用地图交互。
- `molten-core-route.test.ts`：连通性、十五组小怪、解锁、暂停、JSON恢复、全路线结算、周资格及25场真实战斗。
- `gold-world.test.ts`、`gold-raid.test.ts`：服务重启、资产、首领奖励幂等、竞拍与分金守恒。

独立地图验收页（不连接正式存档）：

```powershell
$env:PREVIEW_PORT='5191'
node apps/web/scripts/serve-dungeon-preview.mjs
# http://127.0.0.1:5191/molten-core-map.html
node --test packages/game-domain/test/molten-core-route.test.ts packages/game-domain/test/gold-world.test.ts packages/game-domain/test/gold-raid.test.ts
```

机制资料参考社区模拟器 CMaNGOS 的 [熔火之心脚本](https://github.com/cmangos/mangos-classic/tree/master/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/molten_core)，尤其是[炎魔阶段](https://raw.githubusercontent.com/cmangos/mangos-classic/master/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/molten_core/boss_ragnaros.cpp)和[管理者投降](https://raw.githubusercontent.com/cmangos/mangos-classic/master/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/molten_core/boss_majordomo_executus.cpp)（2026-09-22查阅）。实现独立编写，目标数、时间和数值为本作配置。


