# 基础架构重构实施计划

> 第一轮实现切片已交付；后续[架构复核](../specs/2026-09-16-post-refactor-architecture-review.md)确认原目标 A0—A5 尚未全部验收，存在第二轮收口项。以下勾选表示本计划切片完成，不代表最终产品架构验收完成。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 按冻结公共接口执行，集成负责人唯一修改公共契约和持久化接口。

**Goal:** 将账号整档原型替换为角色/资产/活动/实例独立存储与服务器主动运行的架构。

**Architecture:** Node API + worker + PostgreSQL；唯一 JS 模拟规则内核保留，事务服务组装临时模拟上下文；React 使用投影视图与版本化内容。

**Tech Stack:** TypeScript、Node 24、PostgreSQL、pg、ws、React/Vinext；PGlite 验证真实 SQL。

**Spec:** ../specs/2026-09-16-foundation-refactor-design.md；目标评审 ../specs/2026-09-16-target-architecture-review.md。

## Global Constraints

- 无存档迁移、旧接口兼容层、D1 回退或第二套规则引擎。
- 有状态活动/实例固定内容版本；经济事实与请求重试分别去重。
- 客户端不接收随机状态、收据、执行租约和隐藏遭遇信息。
- 外部 PostgreSQL、真实公网并发和真机表现需单独测量，不能用单机测试代替。

## 执行切片

- [x] 冻结 Store/Transaction/GameService/DTO 接口与所有权模型。
- [x] 领域：身份与个人资产、同行奖励、制造预留与独立活动、共享实例/fencing/合同、收据与结算/outbox。
- [x] 持久化：内存事务测试实现与 PostgreSQL 结构化索引、唯一约束、串行化重试和回滚。
- [x] Node 服务、独立 worker、身份签名、HTTP/WS 访问控制和 Web 代理。
- [x] 客户端投影、按需报价、静态内容缓存、角色选择和订单/实例操作入口。
- [x] 移动唯一规则内核和内容到 packages，更新脚本/测试调用方，删除旧 D1/session 实现。
- [x] 验证离线、SQL恢复、真实两客户端共享实例、构建和依赖边界；独立审查与修复。
- [x] 记录实测响应大小、性能、已完成范围及尚未实测的发布条件。

## 集成契约核对

| 两条任务线 | 公共接口 | 核对 |
|---|---|---|
| 领域/持久化 | 表名与 transaction/get/list/put/insert/delete | 已一致，钱包/租约唯一约束落实 |
| 领域/服务 | snapshot.state 仅内部使用；revision 账号作用域 | 服务端统一投影 |
| 服务/客户端 | protocolVersion/contentVersion/snapshot 与角色选择 | 旧 state 协议删除 |
| 内容/运行器 | 全量内容 SHA 版本 | 运行中版本不匹配拒绝推进 |

## 基线

2a2157f，分支 codex/architecture-protocol。原测试 566 项，565 通过；素材清单 scope SHA 不匹配已在修改前复现。完整目标范围来自用户后续确认“全部进行重构，夯实基础”，替代早期单协议切片计划。

## 最终交付

见 [集成交付记录](../../development/foundation-refactor.md) 和 [运行说明](../../development/game-runtime.md)。全量回归 648 项，647 通过；唯一失败仍为相同的基线素材摘要校验。类型、语法、内容和生产构建检查通过。外部数据库争用、公网和真机验证未执行，未部署到远端。
