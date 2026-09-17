# Zeabur 独立网站部署

目标：用户已选择独立账号登录；GitHub main push 后由 Zeabur 构建更新。

设计：Web 使用 Next.js Node runtime；用户名/密码和可撤销会话保存在 PostgreSQL 独立认证表中，游戏数据仍由 API/worker 管理。浏览器只持有 HttpOnly 会话 cookie；Web 根据已验证会话签发短期游戏凭据。移除 Web 对 ChatGPT 身份头和 Cloudflare runtime 的依赖。账号无旧存档迁移。

实施与验收：
- [x] 用真实 SQL 测试注册、重复账号、密码校验、会话过期/退出与限流，再实现 `apps/web/lib/account-store.ts`。
- [x] 增加 `/login`、认证 API 和退出入口；替换游戏 API 身份来源及生产构建命令。验证伪造身份头与跨站写入被拒绝。
- [x] 根 Dockerfile 构建 Web；Dockerfile.runtime 构建 API/worker；配置容器网络监听、锁定依赖安装及忽略本地密钥。通过生产构建和容器启动验证。
- [x] 编写 Zeabur 服务配置及本地运行说明，记录实际部署分支、环境变量和持续部署验收方式。
- [x] 连接控制台，配置数据库、Web、API、worker，推送部署提交，核对部署 SHA 和在线注册/存档恢复。

验收：main push 已触发三个服务部署；云端 CI 与两份容器构建通过，https://wow-sim.zeabur.app 线上账号和角色存档验证通过。配置与运行注意事项见 docs/development/zeabur.md。工作区已有游戏功能修改；仅提交本任务变更。密码重置/邮件验证不在本次首次上线范围内，登录名不是邮箱。
