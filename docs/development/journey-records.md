# 战斗与旅程记录

旅程列表使用独立的 `state.journey` 核心事件，保留最近 100 条。旅行、任务、副本进展、升级和学习事件不会被施法、伤害、掉落日志刷掉。

每次单独遭遇创建战斗条目；同一次 hunt 活动内的连续战斗合并为一条挂机记录，显示目标、累计经过时间（包括两场之间的恢复等待）和击杀数。停止后再次开始会创建新记录。

`battleHistory` 保留最近 20 场战斗的结束快照：参战单位、敌人、战斗统计、职业状态、地点及该场仍在日志缓冲区内的最近事件（最多 140 条）。客户端通过白名单投影读取。摘要中的战斗链接只能打开对应快照；过期详情明确提示，不会跳到最近一场。当前场次可打开实时战斗页面。

历史页面复用 Battle，以只读方式展示结束时的战场，不提供停止、复活或策略修改，不是逐帧重播。新战斗、恢复或旅行不会修改历史快照。

验证：`node --test apps/web/test/journey-log.test.mjs apps/web/test/combat-metrics.test.mjs apps/web/test/class-battle-presentation.test.mjs apps/web/test/client-snapshot.test.mjs apps/web/test/combat-sync.test.mjs`。
