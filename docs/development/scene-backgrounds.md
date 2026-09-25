# 区域、副本背景与旅途运动

主游戏两种界面共用 `WorldScene`，通过 `scenePresentation` 选择当前区域或副本的背景。运行时清单为 `packages/game-data/data/scene-backgrounds.json`：45 个区域、28 个普通副本分区，以及熔火之心、奥妮克希亚巢穴，共 75 张独立本地 WebP。北郡归入艾尔文；副本内部优先于副本入口所在的室外区域；旅行跟随当前路段中点切换背景，不改变服务端位置。

本轮为血色四区、玛拉顿三区、厄运三区、斯坦索姆两区和黑石塔上下层提供独立场景，并更换奥妮克希亚巢穴画面。截图表现对应区域的代表性环境，不表示角色当前位置的精确地形；部分截图含场景内 NPC 或首领。若图片加载失败，恢复现有 SVG 示意背景。

## 运动

- 两个相差半周期的照片层持续放大并向下平移：上层透明时复位，下层被完全遮盖时复位。短交叠淡化消除硬切，避免平铺风景照造成地平线接缝。
- 步行周期 24 秒，骑乘 16 秒，飞行 12 秒；飞行位移更大，额外叠加连续循环云层。
- 只在真实移动状态（旅行、护送、跑尸）播放。停下、战斗、死亡、暂停演出、打开主界面弹窗、游戏暂停、离屏或浏览器后台时停止。暂停使用 `animation-play-state`，继续时从原帧播放。
- 系统 `prefers-reduced-motion` 下隐藏动态照片层并停止云层与 SVG 地形动画。
- 副本推进目前直接切换节点/进入战斗，没有独立的行走时间，因此副本驻足与战斗不伪装成持续移动。该效果仅为展示，不修改航程、移动速度和战斗计算。

## 资源维护

`python3 scripts/import-scene-backgrounds.py` 使用 Pillow 导入 Warcraft Wiki 截图。分区选图固定在脚本 `selected` 表内，禁止自动替换成文章首张缩略图。下载或选图失败时保留原有清单；缓存存在但本地文件被删时重新生成。导入后运行 `npm run data:compile` 更新内容版本。

`docs/research/import/scene-backgrounds-manifest.json` 保存原图链接、文件页、原始尺寸与 SHA-256。图片为 Blizzard 游戏内容，各文件页保留作者与许可信息。联系表输出到 `.cache/scene-backgrounds/contact-sheet.jpg`，导入后需人工检查，尤其排除纯模型图、地图或重制版本场景。

## 验证与预览

```sh
node --test apps/web/test/scene-presentation.test.mjs apps/web/test/world-scene.test.mjs
node apps/web/scripts/serve-world-scene-preview.mjs
```

默认打开 http://127.0.0.1:5194/scene-backgrounds.html （可用 `PORT=5204` 指定其他端口），可以用 GameSelect 切换全部区域和副本，检查步行/骑乘/飞行/待机、暂停与 390px 场景宽度；页面解码全部背景并显示运动状态。此页面仅展示演出，不读取或写入存档。真实模拟、鸟点抵达和战斗切换继续在 `/world-scene.html` 检查。

本轮覆盖测试 17 项通过：遍历全部可玩地点、普通副本、团本，验证背景可解析、WebP 文件和来源完整，以及分区独立、路段切换、飞行抵达和动作优先级。Web TypeScript、相关 ESLint、TSX 编译与内容清单检查通过。浏览器确认 75/75 张图片可解码，桌面步行/骑乘、副本切换、390×844 手机飞行与暂停有效，无横向溢出。模拟系统减少动态效果后，照片运动层隐藏、云层动画关闭。截图复核修正了交叠照片层遮盖人物的问题；页面未记录 JavaScript 错误。
