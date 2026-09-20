# 战斗地面贴图

五套原创 WoW Classic 风格俯视材质，由内置 `image_gen` 生成，使用 Sharp 提取图集象限并压缩为 WebP（不是官方游戏贴图）。

| 文件 | 环境 |
| --- | --- |
| cave.webp | 矿洞、地下房间 |
| deck.webp | 船坞木平台、船上甲板 |
| dirt.webp | 西部荒野黄土、干燥地面 |
| water.webp | 游泳、水下、水上行走 |
| grass.webp | 林地、一般野外 |

预设与选择规则：`packages/game-data/battle-ground.js`。副本区域通过 `combat-areas.json` 的 `ground` 指定材质。野外先判断水中状态，再判断矿洞地点和区域；岸边不等同于水中。`startCombat` 保存 `combat.ground`，客户端投影与战斗历史保留该字段，回看不会受玩家后来所在地影响。

新增材质时添加本目录资源和 `battleGrounds` 预设，再配置区域或地点规则。HD-2D 战场使用 Three.js 地面网格与重复纹理，精细和简化特效共用同一材质；场景布景与光照见 `app/battle-hd2d/environment.tsx`。

## 生成提示词

### 四材质图集

Use case: stylized-concept. Generate one production game terrain texture atlas, square 2048x2048, exactly 2 columns x 2 rows equal square quadrants with zero gutters or borders. World of Warcraft Classic inspired hand-painted diffuse ground materials, chunky painterly forms, subtle brushwork, muted mid-dark values, strictly orthographic directly overhead, flat evenly lit surfaces filling each quadrant. TOP LEFT: cool gray brown cave stone ground, irregular rock plates and fine gravel in cracks. TOP RIGHT: weathered warm brown wooden ship deck with long parallel planks running vertically, staggered joins, restrained iron nail heads and wood grain. BOTTOM LEFT: ochre yellow dry earth, compact dusty dirt, small scattered pebbles and faint cracked patches. BOTTOM RIGHT: calm deep teal shallow water surface with subtle broad painted ripples and faint caustics. Each quadrant is a uniform repeatable ground material at consistent scale, with no horizon, walls, cliffs, props, characters, ships, scenery, text, labels, frames, UI or dramatic lighting. All four materials must extend right up to their quadrant edges. Intended as ground beneath combat units, keep detail quiet and no focal object.

### 草土地面

Use case: stylized-concept. Asset type: production game ground diffuse texture. One square texture, World of Warcraft Classic inspired hand-painted forest grass and earth floor. Strictly orthographic directly overhead, fills entire image, uniformly scattered short muted olive green grass tufts on earthy brown loam, small irregular bare dirt patches, sparse tiny pebbles. Chunky painterly forms, soft hand-painted details, same quiet scale throughout, restrained mid-dark values, flat ambient illumination. Seamless repeatable surface intended underneath battle units. No horizon, landscape, trees, bushes, flowers, props, paths, characters, border, text, labels, UI, vignette or dramatic shadows.
