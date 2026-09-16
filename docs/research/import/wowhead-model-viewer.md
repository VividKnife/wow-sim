# Wowhead Classic 角色换装预览

接入日期：2026-09-16。范围：现有人类男性法师角色页的外观展示，实际装备和属性仍由游戏引擎决定。

## 来源与适配

- 官方入口：https://www.wowhead.com/classic/dressing-room
- 查看器版本：页面 `modelViewerVersion.wow.classic` 的 `c3f890f`，脚本为 https://wow.zamimg.com/modelviewer/classic/deployment/viewer/c3f890f/viewer.min.js 。旧 `classic/viewer/viewer.min.js` 仍返回脚本，但其 MO3 模型文件已返回 404；当前版本使用 M2 / skin / skel / anim / bone。
- 模型元数据与贴图：https://wow.zamimg.com/modelviewer/classic/ 。人类男性使用 character 1，class 8，Classic 低精度模型。
- 装备外观：按物品 ID 读取 Wowhead Classic XML 的 `icon displayId`，不导入其属性。示例：56 → 10455，35 → 472；本地数据库部分显示编号不同，不能直接传入。
- jQuery 3.7.1 通过官方 CDN 加载，附 SHA-256 SRI。未引入旧的 npm 包装库，也未批量下载游戏模型。

## 实现

`CharacterModel` 从已装备物品生成稳定快照，传入独立 iframe。长袍、披风使用物品 inventory type；游戏主手/副手/远程位置转换为查看器 21/22/26；项链、戒指、饰品无可见外观，不加载。

更换装备会重建 iframe，避免旧请求把已替换的装备重新挂上去。换装消息检查来源窗口、同源、槽位和 ID。返回装备页或滚动回人物区域时重新加载，离屏或后台销毁查看器，已有下载走浏览器缓存。

同源 `/api/model-viewer/` 仅转发固定 Wowhead 主机、固定脚本版本和数字资源路径。转发不携带用户 Cookie / Authorization；禁止跟随重定向。使用 `redirect: manual` 兼容 Workers，非成功响应视为失败。物品外观内存缓存最多 512 条、24 小时；资产响应设置 24 小时 HTTP 缓存。

同时等待查看器就绪、fetch/XHR 资源完成及短暂稳定期。单个物品的外观编号不可用时提示部分外观缺失；模型资源失败、WebGL 不可用或超时则使用原静态人物并提供重试。外层也有超时，避免 iframe 脚本未启动时永久加载。

## 验证

- 独立真引擎页面 `test/browser/character.html`，不连接玩家存档。
- 学徒长袍 → 法纹长袍：模型衣服纹理和引擎智力/法力同步改变。
- 弯曲的法杖 → 草原法杖：新武器显示，旋转侧面可观察完整法杖。
- 拖动旋转、放大、重置；390 px 手机视窗全身构图，无横向溢出；手机滚动到背包后预览暂停，换装并返回人物区域后恢复正确外观。
- 早期缺失模型时实际观察到静态回退和重试。请求失败、部分外观缺失、不转发凭据和路径白名单另外由自动测试覆盖。
- 正式开发服务器 `/api/model-viewer/appearance?items=56,35` 返回两个正确外观编号；`m2/119940.m2` 返回 200、1,817,618 字节。
- 相关 14 项 Node 测试、TypeScript、指定文件 ESLint、生产构建通过。

## 当前边界

这是联网外观预览，依赖 Wowhead / jQuery CDN 可达性。固定了渲染脚本版本，但 Wowhead 的模型及物品显示数据仍可能变化。尚未扩展种族/性别/捏脸、幻化保存、附魔特效或战斗场景 3D；没有覆盖全物品组合、真实低端手机性能及离线资产。
