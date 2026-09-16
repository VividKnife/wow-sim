# 游戏基础架构重构实施设计

用户于本轮确认“全部进行重构，夯实基础”。本设计取代仅实施协议切片的范围，落实目标架构的领域、事务、调度、实例及客户端边界。

## 边界

- `packages/game-domain` 拥有账号、稳定角色身份、伙伴档案、引用式队伍、资产账本、活动、实例与合同规则。
- `packages/persistence` 提供统一事务接口，PostgreSQL 为持久实现，内存实现只用于快速测试；JSON 用于规则状态/战斗快照，不用账号整档替代资产与活动结构。
- `apps/game-server` 是 Node HTTP/实时订阅入口，`apps/game-worker` 主动处理到期活动。浏览器心跳不再决定实例和其他角色的执行。
- `packages/contracts` 定义 DTO 和校验，Web API 仅作已认证身份转发，移除 D1 存档读写与页面控制租约。
- 现有 JS 引擎是唯一的确定性模拟实现。其扁平运行上下文只在领域适配器内组装，角色、资产和实例提交通过事务边界；不保存第二套旧账号存档。
- 本批保持既有内容可玩并引入内容注册表。第二内容入口以小型真实现有遭遇验证通用实例路径；40 席位用于合成验证，不声称完成 40 人团本内容。

## 持久化公共接口（冻结）

`Store.transaction<T>(work:(tx:Transaction)=>Promise<T>):Promise<T>`；`Store.close():Promise<void>`。

`Transaction.get<T>(table,id):Promise<T|null>`；`list<T>(table,where?:Record<string,string|number|boolean|null>):Promise<T[]>`；`insert(table,row):Promise<void>`；`put(table,row):Promise<void>`；`delete(table,id):Promise<void>`。

每个 row 必须有 `id:string`。表名固定为 `accounts,characters,companions,parties,wallets,items,reservations,activities,actor_leases,instances,instance_leases,contracts,settlements,ledger,receipts,outbox,inbox,reward_claims`。snake_case 只用于表名，JSON 行字段使用 camelCase。实现必须保证事务回滚、串行化冲突重试及唯一 ID。需要检索/约束的字段投影为 SQL 生成列和索引。

## 领域服务公共接口（冻结）

`new GameService(store,{contentVersion,now?:()=>number,id?:()=>string,seed?:()=>number})`。

- `createAccount(accountId,{name,classId,raceId},requestId)` 创建主角。
- `snapshot(accountId,characterId?)` 返回 `{state,revision,account,roster,activities,instanceId}` 供服务端 DTO 投影；state 是即时运行上下文，永远不直接发到客户端。
- `command(accountId,command)`；command 至少含 `type,requestId`，可选 `characterId`。现有游戏命令由唯一模拟引擎处理。
- `work(now?,limit?)` 主动结算到期活动/实例，支持重启与至少一次调用。
- `subscribe` 不放入领域：HTTP 层轮询 revision 或实例 sequence，推送身份过滤后的投影。

活动必须独立保存 actorId、type、status、location、startedAt、settledUntil、nextEventAt、contentVersion、rngState。一角色一个 actor lease。制造原子预留材料，actor/payer/recipient 分离，最多两个主要专业。召回保留已结算收益，返回结束释放租约。进本占用所有参战角色租约，空闲伙伴继续工作。

实例保存引用式名册、独立模拟快照、随机流、内容版本、sequence 和递增 fencing epoch。加入方必须主动授权自己角色；通过实例邀请 ID 加入不代表可控制别人。5/10/20/40 席位。经济事实使用业务结算键去重，收据仅处理请求重试。任务角色奖励 claim 不通过重复执行整份任务来发放。

## 验证与交付

领域测试覆盖同材料竞争、回滚、独立随机流、任务个人奖励、进本互斥、恢复、旧 epoch 拒写、合同重复扣费、跨账号权限。数据库测试运行 PostgreSQL 兼容嵌入式引擎，并明确本机未启动外部 PostgreSQL/Docker 的限制。HTTP 使用两个真实客户端测试共享实例。UI 使用显式快照、静态目录和分页报价；保留现有行为测试并记录基线故障。

无旧存档迁移、双协议和 D1 回退；不进行部署或自动清除远端数据。
