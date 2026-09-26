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
- `apps/web/proxy.ts` 在运行时读取 `R2_ASSET_ORIGIN` 和部署版本，确认 R2 完成标记后，
  将 public 资源 GET/HEAD 临时 307 跳转到该版本目录。跳转响应 `no-store`。
  初次就绪检查最多等待 2 秒；检查结果按进程缓存 60 秒，失败使用本地文件。
- Next.js `/_next/*` 的 JS/CSS 和本地战斗 Web Worker 保留同源。它们与 public 的
  图片、GLB、音效、音乐不同；跨域 Worker 需要额外构建处理，本次不迁移。
- Zeabur 镜像仍包含 public，作为完整回退副本。因此本次减少资源下载流量，
  不减少镜像尺寸或构建阶段的资源下载。每个资源首次仍需经过 Zeabur 的重定向。

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

## 启用及回退

1. 上传完成并验证 `https://wow-sim.dota.run/public/<version>/__release.json`。
2. 发布包含 proxy 和部署元数据的新 Web 镜像。
3. 在 Zeabur 的 **wow-sim Web 服务** 设置 `R2_ASSET_ORIGIN=https://wow-sim.dota.run`，重启。
4. 检查图标、地图、GLB、音乐请求：初始 307，最终 R2 200；CORS 允许 Zeabur origin，
   Content-Type 正确，Range 请求返回 206。登录、游戏 API、Worker 应留在 Zeabur。

**回退：清空或删除 Web 的 `R2_ASSET_ORIGIN` 并重启 Web。** 无需改 DNS、回滚数据库、
重新上传资源或重建镜像。307 不缓存，刷新页面后恢复 Zeabur 本地资源。
即使 R2 完全不可用，也可以执行这一回退。若需要回到实验前的全部代码，
原生产来源提交是 `433e1692bdc0fe79312219ef59d0d31fac41b04e`；优先只关闭资源开关。

## 持续发布

CI 可配置仓库变量 `R2_ASSETS_ENABLED=true`，以及 secrets `R2_ACCESS_KEY_ID`、
`R2_SECRET_ACCESS_KEY`，启用在发布 Zeabur 部署分支之前的资源上传。
本地上传不自动保存凭据到 GitHub。未启用该 CI job 时，每次 public 变化需手动上传；
漏传会回退本地资源，不会跳转到缺失版本。只更新代码且 public 未变化无需重新上传。

验证：

```sh
node --test apps/web/test/static-assets.test.mjs scripts/publish-r2-assets.test.mjs scripts/publish-zeabur.test.mjs
npm --prefix apps/web run build
```

参考：[Cloudflare R2 认证](https://developers.cloudflare.com/r2/api/tokens/)、
[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)、
[Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)。
