# 世界页沉浸视角 Demo

运行 `node apps/web/scripts/serve-world-scene-preview.mjs`，打开 http://127.0.0.1:5194/world-scene.html 。独立内存角色，不读取或写入玩家存档。预览按钮可切换待机、奔跑、骑乘、战斗、长袍和地区；练习战斗会自动补充生命与法力，留出观察时间。

## 当前实现

- 正常世界页在玩家状态下方显示固定高度的场景。探索使用地区配色的 SVG 地图风格背景（森林、旷野、雪地、暮色）；这是构图示意，不是地区真实地形。
- Wowhead Classic 原版角色、种族、性别及实际装备快照。装备变化重建查看器，动作变化通过同源消息更新，不重建 iframe。上游不可用时提示并允许重试。
- 待机 `Stand`、旅行/护送 `Run`、死亡 `Death`。飞行仅标记状态，不模拟地面奔跑；德鲁伊变形和飞行坐骑尚未接入。
- 固定版本 `c3f890f` 查看器的 `mount: {id: displayId}` 会自动把骑手挂到坐骑 attachment 0，并把骑手动作设为 `Mount`；发送 `Run` 则让马奔跑。普通马、迅捷马、20 级赠送马和现有圣骑士/术士坐骑已有对应显示 ID。显示 ID 从当前物品召唤法术 → creature → ModelId1 提取。
- 镜头固定在背后偏侧、近距离第三人称。场景按钮可暂停动作；支持减少动态效果设置，离屏/后台保留原查看器释放策略。
- 遭遇战在同一窗口复用 `Battle` 的 embedded 模式，沿用本地模拟/回放、时钟、战斗演出和角色选择。等待战场就绪后淡入，战斗结束回到探索，也可展开完整战斗面板。

## 边界

探索使用联网换装模型；战斗仍使用已有本地职业 GLB，尚未让战斗模型同步每件装备，也没有实现同一相机和同一渲染器的一镜到底。第一次加载装备、坐骑或战场仍需要素材准备时间，上马及换装会重建查看器。场景暂停只暂停演出，不暂停游戏时间。

参考：现有 [Wowhead 接入记录](../research/import/wowhead-model-viewer.md)，以及官方 [Classic Dressing Room](https://www.wowhead.com/classic/dressing-room) 的固定版本脚本。未新增模型下载依赖，资源代理只增加固定来源的数字 NPC 元数据路径。

## 验证

`node --test apps/web/test/world-scene.test.mjs apps/web/test/model-viewer.test.mjs`：14 项通过，覆盖动作优先级、死亡/战斗/飞行、坐骑映射、背景分类、装备槽位、资源代理与失败处理。Web TypeScript 检查通过（仓库数据体积需要提高 Node 堆上限）。新增组件、模型桥接、demo 与启动脚本的 ESLint 通过；现有 `battle.tsx` / `world.tsx` 仍有原有的 any 和 React hooks 规则告警。

浏览器截图实测确认：背后待机、奔跑、马匹与骑手骨骼联动；学徒长袍切到法纹长袍，外观和法力上限同步变化；原位淡入本地 3D 战场及返回探索；铁炉堡雪地配色；390px 视口下无横向滚动。浏览器新加载未观察到运行时错误，现有 Three.js 战场会输出 Clock 弃用提示。
