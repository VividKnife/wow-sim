# 猎人射击表现

自动射击的后端 `launch` 事件原本已存在；缺口在前端：物理技能没有音效映射，带技能 ID 的攻击统一选择施法动画，角色资源也未导出射击动作。

- `apps/web/lib/battle-models.js` 在现有共享身体上按需加载射击动画包，并从已装备远程物品 ID 选择弓、枪或弩的姿势和代表性武器外观。其他装备仍沿用职业外观预设。
- 发射事件触发一次射击动作和弓弦／枪声；命中、未命中和周期效果不会重复发射。枪和弩使用原生 rifle 动作，弩使用弓弦音效。
- 四种追加动作使用原生 AnimationData ID 29、46、48、49。射击保留原生时长，避免头发等全局循环把单次射击延长至数秒。动画绑定到现有骨骼，不添加第二套身体或骨骼。
- 延迟显示的命中事件等到 `shownAt` 再播放音效；组件更新／卸载会取消待执行计时器。现有静音、后台暂停、声音并发上限和过期丢弃保持有效。
- 纯展示清单位于 `packages/game-data/visuals/`，不修改服务端规则文件和内容清单；资源更新无需使正在运行的检查点失效。

重建资源：`python3 scripts/import-classic-ranged-models.py`、`python3 docs/research/import/import-combat-sounds.py`。下载来源、原始文件哈希和 Classic 音频证据分别记录在展示清单和 `docs/research/import/combat-sounds/`。动画包十种体型共约 1.84 MB；只在猎人模型出现时加载对应体型。

验证：猎人表现、角色模型、骨骼实例、战斗音效和音频来源测试；Web 类型检查、R2 构建和构建验证。浏览器使用 `test/browser/character-models.html` 检查武器挂点与动作，`test/browser/combat-audio.html` 检查真实文件播放。
