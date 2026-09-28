# 战斗模型比例

战斗中的 GLB 保留 Classic M2 的原始坐标。所有模型使用同一套码到场景单位的换算，不再按普通怪、精英、Boss 或种族写死目标身高。

- 生物高度：`asset.height × (creature_template.Scale > 0 ? Scale : display.Scale)`。
- 玩家高度：`body.height × playableDisplay.Scale × character.Scale`，按种族及性别读取原始身体模型。
- 变形使用变形模型自己的 display scale，不继承原生物的模板覆盖。
- 镜头缩放及场地尺寸只改变统一投影，不改变 Boss / 玩家比例。

`packages/game-data/data/model-scales.json` 由 `python3 scripts/import-model-scales.py` 生成，覆盖所有已收录生物和玩家模型。元数据来自 Wowhead Classic modelviewer 的 `meta/npc/{displayId}.json` 和 `meta/character/{chrModelId}.json`，原始响应缓存到 `.cache/model-scales`。模板覆盖来自生成文件列出的本地数据包，优先级与 catalog 一致。新增模型后重新运行导入脚本。

缩放覆盖语义参考 [CMaNGOS Classic ObjectMgr.cpp](https://github.com/cmangos/mangos-classic/blob/master/src/game/Globals/ObjectMgr.cpp) 中对 `CreatureInfo::Scale` 的处理：只有模板值非正数时才使用 CreatureDisplayInfo 的默认 scale，不重复相乘。

这是对已导入 Classic 模型及元数据的还原；模型包围高度包含角、武器等几何，不等于角色设定中的头顶身高。独立的资产查看器可以为检查纹理使用归一化镜头，战斗及营地 Boss 预览均使用实际比例。
