# Classic 光环提示

运行 `python3 scripts/import-buff-tooltips.py`，从 Classic 简体中文 tooltip 接口导入 `buff` 字段，输出 `packages/game-data/data/buff-tooltips-zhCN.json`。

- 来源：`https://nether.wowhead.com/classic/tooltip/spell/{id}?locale=4`。
- 范围：当前职业技能、天赋、物品法术及其递归触发法术中具有光环效果的法术。
- 使用独立的光环正文和驱散类型，不使用带消耗、施法时间和职业要求的技能说明。
- 保留原版正文数值；持续时间从运行时剩余时间生成，避免显示静态初始时长。
- 原始响应缓存在本目录的 JSON 文件中（不纳入 Git）。请求失败时不覆盖最终数据，可重新运行补齐。
- 源站没有光环正文时不编造原版文本；服务器自定义增益继续使用自己的说明。

前端只渲染纯文本，不注入来源 HTML。更新数据后运行 `npm run data:compile` 刷新内容清单。
