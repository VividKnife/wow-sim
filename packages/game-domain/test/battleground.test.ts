import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../src/rules/engine.js';
import {stats} from '../src/rules/character.js';
import {battlegroundTick,battlegroundView} from '../src/rules/battleground.js';
import {bgNodes,bgSight,battlegroundPath,moveBgActor} from '../src/rules/battleground-space.js';
import {WARSONG} from '../../game-data/battlegrounds.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import {projectLocalCheckpoint} from '../src/rules/local-checkpoint.js';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Rules} from '../src/model.ts';

function player(level=20,raceId=1):Rules {const s:Rules=createGame('旗手队长',321,0,{classId:8,raceId,gender:'male'});s.level=level;s.hp=stats(s).maxHp;return s;}
function prepare(s=player()):Rules{return act(s,{type:'battlegroundPrepare'},s.wallAt);}
function start(s=prepare()):Rules{return act(s,{type:'battlegroundStart',matchId:s.battleground.id,revision:s.battleground.revision},s.wallAt);}
function live():Rules{const s=start();s.battleground.clock=10000;s.battleground.phase='combat';s.battleground.nextAiAt=Infinity;return s;}
function isolated(s:Rules){for(const c of s.battleground.teams.flatMap((t:Rules)=>t.members)){c.hp=0;c.respawnAt=999999;}return s;}
function place(c:Rules,node:string){Object.assign(c,{hp:c.maxHp,...bgNodes[node],id:c.id,node,edge:null,respawnAt:0,nextAttack:999999,stunnedUntil:0,order:{task:'rally',pointId:node,route:'tunnel'}});}
function carry(s:Rules,side:number,c:Rules){Object.assign(s.battleground.flags[side],{status:'carried',carrierId:c.id,takenAt:s.battleground.clock,x:c.x,y:c.y});}
function order(s:Rules,ids:string[],task='recover',extra:Rules={}):Rules{return act(s,{type:'battlegroundOrder',matchId:s.battleground.id,revision:s.battleground.revision,memberIds:ids,task,route:'ramp',...extra},s.wallAt);}

test('20级解锁；双方种族均可参赛，补足10v10且不修改世界角色与背包',()=>{
 assert.throws(()=>prepare(player(19)),/20级/);
 for(const race of [1,5]){const s=player(20,race),before=structuredClone(s),p=prepare(s);assert.equal(p.battleground.teams[0].members.length,10);assert.equal(p.battleground.teams[1].members.length,10);assert.deepEqual(s,before);assert.deepEqual(p.party,s.party);assert.deepEqual(p.bag,s.bag);assert.equal(p.hp,s.hp);assert.equal(p.location,s.location);assert.equal(p.teamId,s.teamId);assert.equal(new Set(p.battleground.teams.flatMap((t:Rules)=>t.members.map((c:Rules)=>c.id))).size,20);}
});
test('准备不限时、倒计时不移动；活动互斥，取消后可重新准备',()=>{
 const p=prepare(),later=advance(p,86400000,{maxTicks:1});assert.equal(later.complete,true);assert.deepEqual(later.state.battleground,p.battleground);
 const started=start(p),next=advance(started,9000).state as Rules;assert.equal(next.battleground.phase,'countdown');assert.equal(next.battleground.teams[0].members[0].x,12);
 assert.throws(()=>act(p,{type:'hunt',id:299},0),/战场/);assert.throws(()=>act(p,{type:'arenaPrepare'},0),/战场/);
 assert.throws(()=>prepare({...player(),activity:{type:'travel'}}),/当前活动/);
 const cancelled=act(p,{type:'battlegroundCancel',matchId:p.battleground.id},0) as Rules;assert.equal(cancelled.activity.type,'idle');assert.equal(battlegroundView(cancelled).match,null);assert.notEqual(prepare(cancelled).battleground.id,p.battleground.id);
});
test('战中批量即时改令；拒绝外队、重复成员、陈旧版本与无效地点',()=>{
 const s=start(),ids=s.battleground.teams[0].members.slice(0,3).map((c:Rules)=>c.id),p=order(s,ids);
 assert.equal(p.battleground.revision,s.battleground.revision+1);assert.ok(p.battleground.teams[0].members.slice(0,3).every((c:Rules)=>c.order.task==='recover'));
 assert.throws(()=>order(s,['bg:1:0']),/己方/);assert.throws(()=>order(s,[ids[0],ids[0]]),/不重复/);assert.throws(()=>order(s,[]),/请选择/);assert.throws(()=>order(s,ids,'rally',{pointId:'wall'}),/集合点/);assert.throws(()=>order(s,ids,'unknown'),/无效/);assert.throws(()=>order(s,ids,'defend',{revision:999}),/其他页面/);assert.throws(()=>order(s,ids,'defend',{matchId:'old'}),/场次/);
 const rally=order(s,ids,'rally',{pointId:'blue-roof'});assert.equal(rally.battleground.teams[0].members[0].order.pointId,'blue-roof');
});
test('基地双入口路径连通；不同路线改变行进，改令不会穿墙或传送',()=>{
 for(const from of WARSONG.nodes)for(const to of WARSONG.nodes){const path=battlegroundPath(from.id,to.id);assert.equal(path.at(-1)||from.id,to.id);let prev=from.id;for(const id of path){assert.ok(bgSight(bgNodes[prev],bgNodes[id]));prev=id;}}
 assert.notDeepEqual(battlegroundPath('blue-flag','red-flag','tunnel'),battlegroundPath('blue-flag','red-flag','ramp'));
 assert.notDeepEqual(battlegroundPath('blue-flag','red-flag','tunnel'),battlegroundPath('blue-flag','red-flag','flank'));
 const c:Rules={x:12,y:50,node:'blue-flag',edge:null,order:{route:'tunnel'}};moveBgActor(c,'red-flag',1,5);const previous={...c};c.order.route='ramp';moveBgActor(c,'blue-roof',.1,5);assert.ok(Math.hypot(c.x-previous.x,c.y-previous.y)<=.50001);assert.equal(c.edge,'blue-tunnel');
 assert.equal(bgSight({x:18,y:36},{x:42,y:36}),false);
});
test('持旗回家必须己旗归位；三旗胜利，结算只记一次，得分重置有间隔',()=>{
 const s=isolated(live()),m=s.battleground,c=m.teams[0].members[0],enemy=m.teams[1].members[0];place(c,'blue-flag');place(enemy,'red-roof');carry(s,1,c);carry(s,0,enemy);
 battlegroundTick(s);assert.equal(m.score[0],0);
 Object.assign(m.flags[0],{status:'base',carrierId:null,...bgNodes['blue-flag']});place(c,'blue-flag');battlegroundTick(s);assert.equal(m.score[0],1);assert.ok(m.flags.every((f:Rules)=>f.status==='resetting'));assert.equal(m.flagResetAt,m.clock+10000);
 for(let i=0;i<99;i++)battlegroundTick(s);assert.equal(m.flags[1].status,'resetting');
 battlegroundTick(s);assert.equal(m.flags[1].status,'base');
 for(let n=1;n<3;n++){place(c,'blue-flag');carry(s,1,c);Object.assign(m.flags[0],{status:'base',carrierId:null});m.flagResetAt=0;battlegroundTick(s);}
 assert.equal(m.phase,'finished');assert.equal(m.result.winner,0);assert.equal(m.result.score[0],3);assert.equal(s.activity.type,'idle');assert.deepEqual(s.battlegroundRecord,{played:1,won:1,captures:3});battlegroundTick(s);assert.equal(s.battlegroundRecord.played,1);
 assert.throws(()=>order(s,[c.id]),/已结束/);
});
test('击杀旗手掉旗、队友接力、原属队归还、无人拾取10秒自动回旗',()=>{
 const s=isolated(live()),m=s.battleground,c=m.teams[0].members[0],e=m.teams[1].members[0];place(c,'mid');place(e,'mid');c.hp=1;e.nextAttack=0;carry(s,1,c);battlegroundTick(s);
 // Original owner standing on the dropped flag returns it in the same tick.
 assert.equal(c.hp,0);assert.equal(c.score.deaths,1);assert.equal(e.score.kills,1);assert.equal(e.score.returns,1);assert.equal(m.flags[1].status,'base');assert.equal(c.respawnAt,40000);
 e.hp=0;e.respawnAt=999999;const friend=m.teams[0].members[1];place(friend,'mid');Object.assign(m.flags[1],{status:'dropped',carrierId:null,x:80,y:50,returnAt:m.clock+10000});battlegroundTick(s);assert.equal(m.flags[1].carrierId,friend.id);
 friend.hp=0;friend.respawnAt=999999;Object.assign(m.flags[1],{status:'dropped',carrierId:null,returnAt:m.clock+10000});for(let i=0;i<100;i++)battlegroundTick(s);assert.equal(m.flags[1].status,'base');
});
test('复活波次恢复生命与法力，保留任务，死亡期间可以改令',()=>{
 let s=isolated(live());const c=s.battleground.teams[0].members[0];c.respawnAt=40000;s=order(s,[c.id],'rally',{pointId:'mid-bottom'});s.battleground.clock=39900;
 battlegroundTick(s);const revived=s.battleground.teams[0].members[0];assert.equal(revived.hp,revived.maxHp);assert.equal(revived.mana,revived.maxMana);assert.equal(revived.order.task,'rally');assert.equal(revived.order.pointId,'mid-bottom');assert.equal(revived.respawnAt,0);assert.ok(revived.x>=26&&revived.x<27);
});
test('隧道增益与双方持旗压力有真实效果，公开快照可显示战场',()=>{
 const s=isolated(live()),m=s.battleground,c=m.teams[0].members[0],e=m.teams[1].members[0];place(c,'blue-tunnel');battlegroundTick(s);assert.ok(c.speedUntil>m.clock);assert.equal(m.buffs[0].readyAt,m.clock+60000);
 place(c,'blue-roof');place(e,'red-roof');carry(s,0,e);carry(s,1,c);m.clock+=180000;assert.equal(battlegroundView(s).match!.pressure,1);
 const projection=projectClientSnapshot(s,view(s));assert.equal((projection.view.battleground as Rules).match.id,m.id);assert.equal((projection.view.battleground as Rules).match.teams[0].members.length,10);
});
test('集合撤退优先移动，治疗者不会被沿途伤员锁住，追旗不会追错目标',()=>{
 const s=isolated(live()),m=s.battleground,c=m.teams[0].members[1],ally=m.teams[0].members[0],e=m.teams[1].members[0];
 place(c,'blue-flag');place(ally,'blue-flag');place(e,'blue-tunnel');ally.hp=ally.maxHp*.2;c.order={task:'rally',pointId:'blue-roof',route:'ramp'};
 for(let i=0;i<10;i++)battlegroundTick(s);
 assert.ok(c.y<46);assert.equal(c.cast,null);
 const pursuer=m.teams[0].members[6];place(pursuer,'mid');place(e,'east-mid');pursuer.order={task:'recover',route:'ramp',pointId:'mid'};
 const flagCarrier=m.teams[1].members[1];place(flagCarrier,'red-roof');carry(s,0,flagCarrier);
 const before={x:pursuer.x,y:pursuer.y};battlegroundTick(s);assert.ok(Math.hypot(pursuer.x-before.x,pursuer.y-before.y)>0);
});
test('模拟确定性、存档续跑相同，战斗产生伤害与治疗，双方可执行夺旗',()=>{
 const s=start(),first=advance(s,180000).state as Rules,sliced=advance(advance(s,90000).state,180000).state as Rules;
 assert.deepEqual(first.battleground,sliced.battleground);
 const actors=first.battleground.teams.flatMap((t:Rules)=>t.members);assert.ok(actors.some((c:Rules)=>c.score.damage>0));assert.ok(actors.some((c:Rules)=>c.score.healing>0));assert.ok(first.battleground.events.some((e:Rules)=>e.text.includes('夺取了')));
 const restored=advance(JSON.parse(JSON.stringify(first)),240000).state as Rules;assert.deepEqual(restored.battleground,(advance(first,240000).state as Rules).battleground);
});
test('领域服务保存战场、恢复指挥、撤离与再次进入；世界数值保持独立',async()=>{
 let now=1000;const service=new GameService(new MemoryStore(),{now:()=>now,seed:()=>321,contentVersion:'test'});const save=await service.createSave('bg-service',{name:'战场队长',classId:8,raceId:1,raidReady:true},'test');
 const prepared=await service.command(save.id,{type:'battlegroundPrepare',requestId:'prepare'}),id=prepared.state.battleground.id;
 await service.command(save.id,{type:'battlegroundStart',matchId:id,revision:0,requestId:'start'});now+=20000;await service.work();
 const snapshot=await service.snapshot(save.id);assert.equal(snapshot.state.battleground.phase,'combat');
 const commanded=await service.command(save.id,{type:'battlegroundOrder',matchId:id,revision:1,memberIds:['bg:0:0'],task:'recover',route:'ramp',requestId:'order'});assert.equal(commanded.state.battleground.teams[0].members[0].order.task,'recover');
 const leave=await service.command(save.id,{type:'battlegroundSurrender',matchId:id,requestId:'leave'});assert.equal(leave.state.activity.type,'idle');assert.equal(leave.state.battleground.result.winner,1);assert.equal(leave.state.hp,prepared.state.hp);assert.deepEqual(leave.state.equipment,prepared.state.equipment);
 const next=await service.command(save.id,{type:'battlegroundPrepare',requestId:'again'});assert.notEqual(next.state.battleground.id,id);
});
test('本地战场检查点支持连续保存、刷新接管、即时命令并拒绝旧检查点',async()=>{
 const store=new MemoryStore();let now=1000000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>321});
 const save=await service.createSave('bg-local',{name:'本地指挥官',classId:8,raceId:1,raidReady:true},'test');
 const p=await service.command(save.id,{type:'battlegroundPrepare',requestId:'prepare'});
 const started=await service.command(save.id,{type:'battlegroundStart',matchId:p.state.battleground.id,revision:0,requestId:'start'});
 const base={ownerId:started.localSimulation!.ownerId,characterId:started.state.id,clientId:'bg-browser',contentVersion:'test'};
 let session=await service.localSimulation(save.id,{...base,type:'claim',requestId:'claim'});
 for(let i=1;i<=4;i++){
  now+=10000;const next=advance(session.state,now).state;
  const saved=await service.localSimulation(save.id,{...base,type:'checkpoint',sessionId:session.session.id,sequence:i,state:next,requestId:`save-${i}`});
  assert.equal(saved.state,undefined);
  assert.deepEqual((await service.snapshot(save.id)).state.battleground,projectLocalCheckpoint(next).battleground);
  session={...saved,state:next};
 }
 assert.equal(session.state.battleground.clock,40000);
 await service.localSimulation(save.id,{...base,type:'release',sessionId:session.session.id,requestId:'release'});
 const fresh={...base,clientId:'bg-refreshed'};
 const restored=await service.localSimulation(save.id,{...fresh,type:'claim',requestId:'reclaim'});
 assert.deepEqual(restored.state.battleground,projectLocalCheckpoint(session.state).battleground);
 const commanded=await service.command(save.id,{type:'battlegroundOrder',matchId:p.state.battleground.id,revision:1,memberIds:['bg:0:0','bg:0:1'],task:'escort',route:'ramp',localClientId:fresh.clientId,localSessionId:restored.session.id,requestId:'live-order'});
 assert.ok(commanded.state.battleground.teams[0].members.slice(0,2).every((c:Rules)=>c.order.task==='escort'));
 await assert.rejects(()=>service.localSimulation(save.id,{...base,type:'checkpoint',sessionId:session.session.id,sequence:5,state:session.state,requestId:'old'}),/更新/);
});
