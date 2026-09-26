# R2 静态资源实验

采用第二方案：入口 `https://wow-sim.zeabur.app`，public 资源使用
`https://wow-sim.dota.run`，bucket `wow-sim`，账号
`d4516749783eedab5aabf13adf1d9527`。Web 的账号认证、API 代理、game-api、worker
和数据库继续留在 Zeabur。第一方案尚未实施：当前首页使用服务端会话，不能直接作为
静态 HTML 放到 R2；需要静态化首页及额外的同源 API 路由层。

## 工作方式

- `scripts/publish-r2-assets.mjs` 将指定 Git 提交的 public 文件发布到
  `public/<public Git tree SHA>/`。该版本只随资源变化，不随代码变化。
- 上传器检查文件 Git blob、设置 MIME 和一年 immutable 缓存，支持断点续传；全部成功后
  最后写入 `__release.json`。不删除或覆盖其他版本，也不上传环境变量、存档或数据库。
- 部署分支生成器把同一个 `publicAssetVersion` 写入 `/__deployment.json`。
- `apps/web/proxy.ts` 读取部署元数据中的 `assetMode`。`r2` 模式将 public 资源的
  GET/HEAD 临时 307 跳转到版本目录，响应 `no-store`；不再运行就绪探测或保留本地回退副本。
  默认域名为 `https://wow-sim.dota.run`，可用 Web 环境变量 `R2_ASSET_ORIGIN` 覆盖。
- Next.js `/_next/*` 的 JS/CSS、本地战斗 Web Worker，以及 `/model-viewer/*`
  查看器 HTML/脚本/Service Worker 保留同源（查看器依赖同源 postMessage、API 与 SW scope）。
- 常规 `r2` 部署分支只保留 public 中约 32 KB 的模型查看器运行文件和部署元数据，
  构建不下载完整源码归档，Zeabur 镜像不包含图片、GLB、音效和音乐。
  每个资源首次请求仍需经过 Zeabur 重定向。
- `bundled` 部署在构建时下载固定 main SHA 的源码归档并提取完整 public；
  图片、模型、音频直接从 Zeabur 返回。该模式忽略 `R2_ASSET_ORIGIN`，不依赖 R2。

## 发布资源

使用 Node 24，在仓库根执行 `npm ci`。秘密只通过进程环境传入：

```sh
export R2_ACCOUNT_ID=d4516749783eedab5aabf13adf1d9527
export R2_BUCKET=wow-sim
# 配置 R2_ACCESS_KEY_ID 和 R2_SECRET_ACCESS_KEY，勿提交 Git。
node scripts/publish-r2-assets.mjs --source HEAD            # 只检查清单
node scripts/publish-r2-assets.mjs --source HEAD --upload   # 实际上传
```

也支持 `CLOUDFLARE_API_TOKEN` 替代 `R2_SECRET_ACCESS_KEY`，配合对应的 token ID
作为 `R2_ACCESS_KEY_ID`，按 Cloudflare 官方算法派生 S3 secret。仅 Object Read & Write
权限即可上传；修改 CORS 需要 bucket 管理权限。上传源必须与 public 工作区一致，
避免将未提交修改混入不可变版本。

R2 CORS 配置：

```json
[{"AllowedOrigins":["https://wow-sim.zeabur.app"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag","Content-Length","Content-Range","Accept-Ranges"],"MaxAgeSeconds":3600}]
```

不要给 API 添加此公共资源 CORS。自定义域名中已缓存且缺少 CORS 的对象需要清理缓存；
新的版本目录可避免旧缓存。修改 CORS 后验证浏览器的 GLB/纹理/音频读取。

## 自动部署和切换模式

GitHub 仓库 **Settings → Secrets and variables → Actions → Variables** 中的
`WEB_ASSET_MODE` 控制部署模式：

| 值 | Zeabur 镜像 | 发布流程 |
| --- | --- | --- |
| `r2`（默认） | 应用和同源运行文件 | 验证 → 上传 R2 → 发布 Zeabur 部署分支 |
| `bundled` | 应用和完整 public | 验证 → 发布 Zeabur 部署分支，不访问 R2 |

每次 push main 自动使用该配置。R2 上传需要 Actions secrets `R2_ACCESS_KEY_ID` 和
`R2_SECRET_ACCESS_KEY`；上传失败会阻止部署。上传器复用同版本已存在的对象。
仓库变量未设置时默认 `r2`；其他值会使验证失败。`R2_ASSETS_ENABLED` 已移除。

**恢复全部资源到 Zeabur：**

1. 将仓库变量 `WEB_ASSET_MODE` 改成 `bundled`。
2. 打开 **Actions → Validate deployment → Run workflow**，选择 `main` 并运行。
   也可以直接 push 下一次代码提交。
3. 等待 CI 和 Zeabur 构建发布完成；检查 `/__deployment.json` 的 `assetMode` 为 `bundled`。
4. 刷新页面，确认图片、GLB、音频直接由 Zeabur 返回 200，登录和 API 正常。

这会重新下载、构建并部署完整资源，即使 R2 不可用也可执行。清空 Web 的域名变量或仅
重启服务无法恢复未打包的资源。无需改 DNS、数据库或存档。以后恢复 R2 时，将仓库变量
改回 `r2` 并再次运行工作流；后续 push 继续按所选模式自动发布。

本地手动发布时也使用同一个开关（先完成对应验证和 R2 上传）：

```sh
WEB_ASSET_MODE=r2 node scripts/publish-zeabur.mjs --publish
WEB_ASSET_MODE=bundled node scripts/publish-zeabur.mjs --publish
```

检查 R2 模式时，图片、地图、GLB、音乐应初始 307、最终 R2 200；CORS 允许 Zeabur
origin，Content-Type 正确，Range 请求返回 206。登录、游戏 API、Worker 始终留在 Zeabur。

验证：

```sh
node --test apps/web/test/static-assets.test.mjs scripts/publish-r2-assets.test.mjs scripts/publish-zeabur.test.mjs
npm --prefix apps/web run build
```

参考：[Cloudflare R2 认证](https://developers.cloudflare.com/r2/api/tokens/)、
[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、
[Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)。
