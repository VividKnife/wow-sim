# 重构后城市与技能学习检查

日期：2026-09-16。范围：当前工作区领域规则、客户端投影、技能学习接口；未使用浏览器，未改动现有开发存档。

## 验证结果

单独运行 `node --experimental-strip-types --test apps/web/test/stormwind.test.mjs`：5/5 通过。

随后运行以下关联测试，20/20 通过，完整 TAP 保存在 `.cache/refactor-city-validation.tap`：

```powershell
node --test --test-reporter=tap apps/web/test/stormwind.test.mjs apps/web/test/client-snapshot.test.mjs apps/web/test/class-acquisition.test.mjs apps/web/test/actions.test.mjs
```

城市覆盖包括城区到达前后的服务限制、矮人区至铁炉堡的 180 秒地铁、教堂牧师训练与法师拒绝、城市服务客户端投影、异地银行拒绝、死亡及旅行时服务状态。

此前 `.cache/refactor-1-20-baseline.tap` 记录的四项城市失败在当前代码中均未复现。待基线结束后核对堆栈：三个失败明确是 `view.city` 为 `undefined`，牧师训练失败是教堂没有可训练技能。它们对应尚未接入 `cityView` 与 `canTrainAt` 的引擎行为；当前引擎已导入并使用二者。城市规则及引擎文件在基线执行期间更新，因此旧日志反映了开发中间状态，不是当前代码下复现出的回归。本子任务没有修改城市代码或加入兼容逻辑。

## 新账号技能学习链路（只读检查）

- `apps/web/app/character.tsx` 法术书显示 `skills`、`canTrain`、阻止原因，并发送 `{type:'train', id:spellId}`。
- `apps/web/app/game.tsx` 的命令队列经 `/api/game` 发送；API 通过登录身份代理到服务端 `/game`。
- `apps/game-server/src/server.ts` 验证请求标识与角色标识，调用账号对应的 `GameService.command`。
- `packages/game-domain/src/service.ts` 把普通训练命令交给 `personalCommand`，重建角色状态后调用领域 `act`，随后 `persistCharacter` 保存变化，并以请求回执防止重放重复扣款。
- `rules/engine.js` 验证职业、种族、等级、前置技能、获取条件、训练地点及费用，成功后扣钱并加入 `learned`。`context.ts` 的 `characterRules` 保留 `learned`，角色读取时恢复该字段。
- `rules/client-snapshot.ts` 保留技能与城市视图，前端有可用的学习入口。新账号初始金币为 0，付费技能显示费用不足属于当前规则。

未发现此链路缺少训练命令分发或持久化字段。追加 `packages/game-domain/test/new-account-training.test.ts` 验证：通过 GameService 创建零金币法师，完成 783、接受 7，实际旅行至北郡林地击杀狗头人，返回北郡后用所得金币学习可负担技能。随后创建新的 GameService 读取持久化结果，确认技能与扣费保留，重放同一请求不重复学习或扣款。全程没有改写角色、注资或插入物品 fixture；使用可控时钟与 MemoryStore。本测试通过，但仍不等于真实登录后的 HTTP/浏览器全链路验证。

## 当前边界

检查时 `apps/web/app` 尚未发现消费 `view.city` 的专用主城面板；当前通过通用地图、法术书和服务界面操作。城市领域及投影测试通过不能证明专用城区面板已完成，也不能替代浏览器交互验证。本次未扩展该 UI。

## 九职业逐级技能矩阵

`node scripts/validate-training-1-20.mjs` 独立验证 1–20 每一级可训练技能，显式给予每级 10,000,000 铜，地点为共享训练地点北郡。它不证明自然经济能负担所有技能。证据 `refactor-training-1-20.json` 按原始 `classAbilities` 的全部 1,759 条逐项记录，包含级别、获取方式、种族、前置、训练结果、阻止原因；超过 20 级的条目标记为范围之外，不计作已验证训练。

脚本逐级反复训练所有 `canTrain` 技能，直到没有可训练技能。种族不符的记录另用允许的种族探测；天赋技能明确记为必须通过天赋树。职业解锁按当前共享路线设计在训练地点学习。德鲁伊 18 级自然之握升级需要先获得天赋技能 16689，保留正确的前置拒绝。圣骑士 21084 是已有等级涵盖的技能，单独记为 `known-via-rank`。

|职业|逐级训练条目|初始已知|已知等级覆盖|条件阻止|20级以上|
|---|---:|---:|---:|---:|---:|
|战士|37|18|0|33|86|
|圣骑士|32|18|1|7|122|
|猎人|49|14|0|20|98|
|盗贼|34|15|0|28|90|
|牧师|35|14|0|31|155|
|萨满|41|16|0|10|134|
|法师|39|15|0|17|134|
|术士|33|14|0|15|132|
|德鲁伊|43|15|0|9|155|

原始玩家 `classAbilities` 中 1–20 级没有 `book` 获取行。为避免因此漏掉恶魔魔典，脚本还逐项检查内容 manifest 中所有 20 级以内书籍，记录原始来源、没有宠物等阻止原因，以及在明确的书籍/宠物/前置 fixture 条件下学习后消耗书本并保留技能的结果。书籍条件探针与九职业主训练流程分开，不声称自然获取过书籍。

书籍 manifest 共 127 条：9 条存在可获得来源，条件 fixture 下 9/9 学习并消耗成功；118 条是 `unavailable-book-reference`，逐条加入实际书本实例验证不可学习，保留源条目与拒绝原因。

另有等级不足、金币不足、错误职业、缺少前置四项拒绝及原状态不变断言。

新增独立脚本、测试与证据；没有修改共享引擎、既有成长脚本、副职业或坐骑实现。
