# 副本原版地图接入

副本底图使用暴雪客户端地图纹理，叠加独立的中文首领、怪物群、任务和队伍标记。底图不重绘、不使用 AI 生成。

## 素材来源

- [Gethe/wow-ui-textures 固定提交](https://github.com/Gethe/wow-ui-textures/tree/b852b560442b31579e77ef3967b3c2d594832da8/WorldMap)，版本标签 `1.13.2 (30550)`，与项目既有 Classic 素材库采用同一快照。
- `TheDeadmines/TheDeadmines1_*.PNG`：死亡矿井矿道、伐木间与铸造厂上层。
- `TheDeadmines/TheDeadmines2_*.PNG`：铸造厂下层、船坞与海盗船。
- `TheStockade/TheStockade1_*.PNG`：监狱完整地图。
- `MoltenCore/MoltenCore1_*.PNG`：熔火之心完整地图，公会团和金团共用。

这是 Classic 客户端快照中保留的暴雪分层地图美术，不声称是 1.12 当年已提供的副本地图功能；原图内嵌的英文、房间着色与纹章保持原样。首领阵容和战斗数据仍为项目的经典旧世内容，交互首领图标由游戏覆盖层负责。

每张地图按客户端的 4 列 × 3 行拼接 12 张 256px 纹理，取 1002 × 668 可视区域并无损导出 WebP。未拉伸、重绘或修改房间布局。素材权属 Blizzard Entertainment。

复现：使用带 Pillow 的 Python 运行 `scripts/import-dungeon-maps.py`。脚本逐个验证固定提交的 Git blob SHA-1；[清单](dungeon-maps-manifest.json)保存全部源 URL、源 SHA-256、Git blob 与输出 SHA-256。

## 叠加与坐标

`packages/game-domain/src/rules/dungeon-map.js` 定义游戏路线图、原图房间锚点、分层归属。首领锚点按对应房间或船甲板放置；普通遭遇是已有怪物群的房间级标记，不表示每只怪物的精确世界坐标。路径连线表示遭遇顺序，实际战斗仍使用来源出生点和战场坐标。

熔火之心的叠加节点由 `packages/game-domain/src/rules/molten-core-content.js` 定义：十名首领对齐原图首领徽记，十五组小怪分布于入口、犬巢、石廊与各首领区域。怪群仍为本作25人玩法编排；金色连线表示遭遇关系，不表示可直线穿越熔岩或墙壁。

死亡矿井两张原图默认同时显示，也可切换分区和定位队伍。上层巡逻事件保留在上层地图；跨图目标照常规划完整路线，不能绕过首领和火炮机关。原图、全部首领/普通遭遇、稀有未出现状态都可查看，图标不会因当前尚未到达而隐藏。

验证覆盖地图全节点可达性、所有坐标落在原图边界内、分层与素材路径、跨图机关推进、首领停止、战中改道、任务标记和服务重启。浏览器夹具提供矿井全图、监狱任务地图与首领掉落面板。
