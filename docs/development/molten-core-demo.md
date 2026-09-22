# 熔火之心25人战斗实验Demo

2026-09-22更新：共享首领列表现已扩展至十名，独立Demo可依次测试十首领；正式公会团和金团的十五组小怪与地图路线见[完整副本说明](guild-raid.md)。以下双首领数据保留为最初验证记录，不代表当前完整内容。

正式玩法已接入主游戏角色和PostgreSQL存档，见[60级公会团本](guild-raid.md)。本页以下描述的是仍可独立运行的设计实验Demo。

运行 `npm run demo:molten-core`，打开 <http://127.0.0.1:5189/molten-core-demo.html>。需要项目的 Node 24 环境及根目录、`apps/web` 已安装的依赖；不需要数据库、账号或主游戏服务。可通过 `PREVIEW_PORT` 修改端口。

## 试玩内容

一支60级核心五人队与四支公会五人队，共2坦克、5治疗、18输出。成员是固定蓝装预设，装备、职业技能、资源、命中、仇恨、移动、跨队治疗与死亡沿用现有战斗规则。营地可调整五项团队策略，开战后锁定，战后可以修改并重试。

| 首领 | Demo机制 | 应对 |
| --- | --- | --- |
| 鲁西弗隆 | 两名护卫、延迟爆炸的末日、提高技能资源消耗的诅咒、暗影冲击 | 主副坦分别牵制，优先清护卫，牧师驱散魔法，法师解除诅咒 |
| 玛格曼达 | 加快攻击的狂暴、范围恐惧、预警后持续伤害的熔岩火区 | 猎人宁神射击，矮人牧师保护主坦，队员取消读条并撤离火区 |

先击败鲁西弗隆才能挑战玛格曼达。团灭或撤退保留已击败的首领进度，撤退沿用现有放弃战斗规则，按全员倒下结算。每次挑战重置生命、法力、冷却、弹药与随机种子，便于比较策略。首领各发一次Demo远征纪念，不进入正式角色资产。重建远征可重新试玩。

页面包含实际位置示意、敌我血量、机制计时与处理记录、成员配装、伤害／有效治疗排行及战后复盘。支持暂停、继续与2倍演示速度；这些只属于试玩控制。

## 进度与实现边界

服务器将每次请求结算后的检查点写入 `.cache/molten-core-demo/run.json`，通过临时文件原子替换。刷新页面可继续，服务重启后恢复为暂停。超过5秒未收到页面请求会暂停，不补算关闭期间的战斗。这是本机共享的一次Demo远征，不是多账号存档服务。

- `packages/game-domain/src/molten-core-demo.ts`：固定角色准备、首领顺序、战斗推进、撤退、奖励与页面快照。
- `packages/game-domain/src/rules/molten-core-encounter.js`：首领机制及职业支援调度。
- `apps/web/scripts/serve-molten-core-demo.mjs`：本机API与Vite预览服务。
- `apps/web/test/browser/molten-core-demo.tsx`：独立试玩页面。

首领钩子只作用于带有 `raidEncounter` 的战斗。普通小队容量未扩充；独立Demo的25人运行态不写入正式账号角色。没有接入主游戏副本入口、正式装备掉落、每周锁定、公会招募升级、阵容编辑或联机。战场为位置示意图，尚未接入主游戏角色模型渲染。

## 改编与资料

这是本作25人改编，首领血量、伤害、施法间隔、目标数量和180秒硬狂暴均为试玩参数，未采用40人乘25/40的统一缩放。职业技能取现有规则数据；猎人的宁神射击在Demo中直接授予。没有实现原版首领的全部技能及副本小怪路线，例如护卫的精神控制。

机制名称与基本应对参考 CMaNGOS 的 [Lucifron脚本](https://github.com/cmangos/mangos-classic/blob/master/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/molten_core/boss_lucifron.cpp) 和 [Magmadar脚本](https://github.com/cmangos/mangos-classic/blob/master/src/game/AI/ScriptDevAI/scripts/eastern_kingdoms/molten_core/boss_magmadar.cpp)（查阅于2026-09-20）。这些是社区模拟器资料，不是暴雪官方参数认证；此Demo未复制其实现。

## 验证

```powershell
node --test packages/game-domain/test/molten-core-demo.test.ts packages/game-domain/test/raid-planning.test.ts apps/web/test/class-combat.test.mjs apps/web/test/classic-combat-rules.test.mjs apps/web/test/party-combat.test.mjs
npm run typecheck
cd apps/web
npx tsc --noEmit --incremental false
```

76项定向测试通过，覆盖25人合法配装、解锁与重试、实际资源消耗与驱散、JSON检查点分段确定性、两首领完整击杀、奖励仅发一次，以及错误战术导致团灭且保留前一首领进度。固定种子60325下，默认配置鲁西弗隆82秒击杀／1人倒下，玛格曼达75.9秒击杀／无阵亡；关闭宁神、防恐与避火后，玛格曼达87.6秒团灭。这些是单一预设和种子的回归结果，不代表普遍胜率或最终平衡。

浏览器完成双首领通关、2倍速度、暂停后刷新恢复、继续、撤退及重建远征检查；检查1280px桌面与390px手机布局。根目录和Web TypeScript检查、统一下拉组件检查通过。
