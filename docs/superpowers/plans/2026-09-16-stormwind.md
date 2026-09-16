# Stormwind Implementation Plan

**Goal:** 交付可移动、可办事、有出发指引的暴风城分区主城。

**Architecture:** 静态城市内容、服务端派生视图、前端主城与服务面板分离；复用已有交易、训练及旅行命令。

**Tech Stack:** Node.js、React、TypeScript、node:test、现有 Vite 网页构建。

**Spec:** `docs/superpowers/specs/2026-09-16-stormwind-design.md`

## Constraints

不覆盖工作区其他改动，不迁移旧存档，不从浏览器导入领域引擎。所有资产操作由既有服务端命令执行。

## 1. 城区与服务视图

- [x] 在 `apps/web/test/stormwind.test.mjs` 添加真实引擎测试，断言新增节点可旅行、矮人区连接地铁、牧师在教堂能训练而法师不能、城市视图可经快照投影。
- [x] 运行 `node --test apps/web/test/stormwind.test.mjs` 确认新行为缺失。
- [x] 新增 `city-data.js` 定义城区路网，更新 `catalog.js` 和地图标点；新增 `city.js` 的 `cityView(s)` 与 `canTrainAt(s)`，接入引擎及快照白名单。
- [x] 回归导航、炉石、任务物件、职业训练测试，核对 NPC 坐标变化。

## 2. 主城界面与完整操作

- [x] 新建 `apps/web/app/city.tsx`、`city-services.tsx`、`city.css`；世界页在城市节点显示城市区块。
- [x] 城区选择仅预览；前往按钮发送 `{type:'travel',to:district.id}`，真实抵达后才可办理本地业务。
- [x] 银行与拍卖复用 `Bank`/`Auction`；训练显示 `d.skills` 并发送 `train`；补给发送 `buy`/`sellJunk`；旅店发送 `bindHearth`/`rest`；专业复用 `Professions`。
- [x] 动态整备清单、服务搜索与出发路线使用服务端视图与当前状态，所有按钮处理 busy/死亡/旅行/战斗。
- [x] 独立夹具使用实际引擎和客户端内容验证，覆盖窄屏与桌面。

## 3. 验证与交付

- [x] 执行全套 `npm test`、`npm run typecheck`、`npm run check`、`npm run data:check`、`npm --prefix apps/web run build`。
- [x] 浏览器检查地图选区、卫兵指路、服务展开、购买、旅行抵达和移动端溢出。
- [x] 更新 README 和验证记录；只报告有实际执行证据的结果。
