# Professions Implementation Plan

**Goal:** 完成生活职业、采集制造、银行、拍卖行、附魔及策略药水闭环。
**Architecture:** 在现有 act/advance/view 接口中注册新模块，复用物品实例和 JSON 存档。
**Tech Stack:** JavaScript simulation, React/TypeScript, Node test, Vite preview.
**Spec:** ../specs/2026-09-16-professions-design.md

## Global Constraints
保留现有未提交改动。确定性模拟，所有价格为整数铜币；批处理失败原子回滚；仅新角色初始化，无旧档兼容。新增规则标明单人改编。

- [x] 数据和核心测试：新增 professions.test.mjs，调用 createGame/act/advance/view 验证未实现功能先失败。
- [x] 新增 profession-data.js：职业、配方、补充物品、药水和附魔定义；catalog 导入补充数据。
- [x] 新增 inventory.js：保护、整理、银行、固定报价、购买、上架与成交；act 在克隆状态处理全部写入。
- [x] 新增 professions.js：学习、升级、配方报价、补齐、制造、区域采集、剥皮、分解、附魔。
- [x] 新增 consumables.js：策略校验与使用；combatTick 接入药水与剥皮；character.stats 读取附魔。
- [x] 引擎接入：初始化新角色，结算市场，活动完成采集，暴露 UI 视图。运行 node --test apps/web/test/professions.test.mjs。
- [x] 新增 professions.tsx、storage-market.tsx 和 economy.css，角色/世界/策略/背包增加入口、筛选、操作金额与保护提示。
- [x] 创建独立 profession 浏览器夹具并实际点击核心流程；运行 node --test、npm run check、tsc --noEmit 和应用 build。记录结果。

验证结果与并行开发检查限制见 ../specs/2026-09-16-professions-validation.md。
