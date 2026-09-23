import {WARSONG,BATTLEGROUND_ORDERS,BATTLEGROUND_ROUTES} from '../../../game-data/battlegrounds.js';
import {stats,log} from './character.js';
import {recruit} from './party.js';
import {combatRole} from './combat-roles.js';
import {classDefinitions} from './catalog.js';
import {bgNodes,bgDistance,bgSight,nearestBgNode,moveBgActor} from './battleground-space.js';

export const battlegroundCommands=['battlegroundPrepare','battlegroundStart','battlegroundOrder','battlegroundCancel','battlegroundSurrender'];
export const battlegroundActive=s=>['preparing','countdown','combat'].includes(s.battleground?.phase);
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const all=m=>m.teams.flatMap(t=>t.members);
const alive=c=>c.hp>0;
const carrying=(m,c)=>m.flags.find(f=>f.carrierId===c.id);
const carrier=(m,flag)=>all(m).find(c=>c.id===flag.carrierId&&alive(c));
const atNode=(c,id)=>bgDistance(c,bgNodes[id])<=3;
function event(m,text,kind='info'){
 m.events.push({id:++m.eventSequence,at:m.clock,text,kind});if(m.events.length>80)m.events.shift();
}
function resetFlag(m,side){m.flags[side]={side,status:'base',carrierId:null,...bgNodes[WARSONG.teams[side].base],returnAt:0};}
function makeActor(source,side,index){
 const st=stats(source),role=combatRole(source),base=bgNodes[WARSONG.teams[side].base];
 return {id:`bg:${side}:${index}`,sourceId:source.id,name:source.name,classId:source.classId,
  className:classDefinitions.find(c=>c.id===source.classId)?.name,level:source.level,role,side,number:index+1,
  maxHp:st.maxHp,hp:st.maxHp,maxMana:st.maxMana,mana:st.maxMana,
  x:base.x,y:base.y,node:base.id,edge:null,order:{task:'midfield',route:'tunnel',pointId:'mid'},
  nextAttack:0,nextControl:0,stunnedUntil:0,slowUntil:0,controlImmuneUntil:0,speedUntil:0,berserkUntil:0,
  respawnAt:0,protectedUntil:0,lastCombatAt:-10000,cast:null,targetId:null,intent:'等待开战',
  score:{kills:0,deaths:0,damage:0,healing:0,captures:0,returns:0},
 };
}
const lineup=[['druid','tank'],['priest','healer'],['paladin','healer'],['warrior','melee'],['rogue','melee'],['mage','ranged'],['hunter','ranged'],['warlock','ranged'],['shaman','healer'],['warrior','tank']];
function fillTeam(s,side,sources){
 const staging={...s,party:[],logs:[],journey:[],money:0,itemSequence:0,growthPolicy:undefined};
 return Array.from({length:10},(_,i)=>{
  let source=sources[i];
  if(!source){staging.party=[];const [id,role]=lineup[i];source=recruit(staging,id,{role});source.name=`${side?'战歌':'银翼'}·${source.name}`;}
  return makeActor(source,side,i);
 });
}
function defaultOrders(team){
 const runner=team.members.find(c=>c.role==='tank')||team.members.find(c=>c.role!=='healer')||team.members[0];
 const healers=team.members.filter(c=>c.role==='healer');let attackers=0;
 for(const c of team.members){
  const task=c===runner?'capture':healers.includes(c)?'escort':++attackers<=2?'defend':attackers<=4?'recover':'capture';
  c.order={task,route:task==='capture'?'ramp':'tunnel',pointId:'mid'};
 }
}
function blockedReason(s){
 if(s.level<20)return'主角达到20级后开放战场。';
 if(s.growthPolicy==='companion')return'请切换到主角指挥战场。';
 if(s.hp<=0)return'请先复活主角。';
 if(s.combat||s.dungeon||s.guildRaid?.active||s.goldRaid?.active||s.escort||s.stockadesQuestEvent||s.activity.type!=='idle')return'请先结束当前活动并离开副本。';
 return'';
}
export function battlegroundAction(s,a){
 if(a.type==='battlegroundPrepare'){
  need(!battlegroundActive(s),'请先结束当前战场。');const reason=blockedReason(s);need(!reason,reason);
  const serial=(s.battleground?.serial||0)+1;
  // Only present, living, same-level companions join; the match supplies the
  // remaining volunteers. No persistent recruitment or inventory mutations.
  const own=[s,...s.party.filter(c=>c.hp>0&&c.level===s.level)].slice(0,10);
  const teams=[{...WARSONG.teams[0],members:fillTeam(s,0,own)},{...WARSONG.teams[1],members:fillTeam(s,1,[])}];
  for(const team of teams)defaultOrders(team);
  const m={id:`battleground:${s.id}:${serial}`,serial,mapId:WARSONG.id,phase:'preparing',clock:0,revision:0,
   teams,flags:[],score:[0,0],events:[],eventSequence:0,effects:[],result:null,flagResetAt:0,
   buffs:WARSONG.buffs.map(b=>({...b,readyAt:0})),nextAiAt:0,startedAt:WARSONG.preparationMs};
  resetFlag(m,0);resetFlag(m,1);s.battleground=m;s.activity={type:'battlegroundPrepare'};s.rest=null;
  event(m,'两支十人队伍已集结。选中队员分配任务，准备完成后开启战场。');return;
 }
 const m=s.battleground;need(m&&m.id===a.matchId,'战场场次已变化，请刷新。');
 if(a.type==='battlegroundCancel'){need(m.phase==='preparing','只能取消尚未开战的准备。');m.phase='cancelled';s.activity={type:'idle'};return;}
 if(a.type==='battlegroundSurrender'){need(['countdown','combat'].includes(m.phase),'当前没有进行中的战场。');finish(s,1,'主动撤离战场');return;}
 need(battlegroundActive(s),'本场战场已结束。');need(a.revision===m.revision,'指挥命令已在其他页面更新，请重新下令。');
 if(a.type==='battlegroundStart'){
  need(m.phase==='preparing','本场战场已经开始。');m.phase='countdown';m.revision++;s.activity={type:'battlegroundCombat'};
  event(m,'战场将在10秒后开门，指挥命令仍可随时调整。');return;
 }
 need(a.type==='battlegroundOrder','未知战场操作。');
 need(Array.isArray(a.memberIds)&&a.memberIds.length>0&&a.memberIds.length<=10&&new Set(a.memberIds).size===a.memberIds.length,'请选择1—10名不重复的己方队员。');
 const members=a.memberIds.map(id=>m.teams[0].members.find(c=>c.id===id));need(members.every(Boolean),'只能指挥本场己方队员。');
 need(BATTLEGROUND_ORDERS.some(o=>o.id===a.task)&&BATTLEGROUND_ROUTES.some(r=>r.id===a.route),'任务或行进路线无效。');
 need(a.task!=='rally'||WARSONG.nodes.some(n=>n.id===a.pointId),'请选择地图上的有效集合点。');
 for(const c of members){c.order={task:a.task,route:a.route,pointId:a.task==='rally'?a.pointId:'mid'};c.cast=null;c.targetId=null;}
 m.revision++;event(m,`${members.map(c=>c.number+'号').join('、')} → ${BATTLEGROUND_ORDERS.find(o=>o.id===a.task).name} · ${BATTLEGROUND_ROUTES.find(r=>r.id===a.route).name}${a.task==='rally'?' · '+bgNodes[a.pointId].name:''}`,'order');
}
function finish(s,winner,reason){
 const m=s.battleground;m.phase='finished';m.result={winner,reason,durationMs:Math.max(0,m.clock-m.startedAt),score:[...m.score]};
 for(const c of all(m)){c.cast=null;c.targetId=null;}
 s.activity={type:'idle'};event(m,`${m.teams[winner].name}获胜 · ${reason}`,'result');
 s.battlegroundRecord??={played:0,won:0,captures:0};s.battlegroundRecord.played++;s.battlegroundRecord.won+=Number(winner===0);s.battlegroundRecord.captures+=m.score[0];
 log(s,`战歌峡谷：${winner===0?'获胜':'落败'}，${m.score[0]} : ${m.score[1]}。`,'battleground');
}
function aiOrders(m){
 const team=m.teams[1],ownStolen=m.flags[1].status!=='base',friendlyCarrier=carrier(m,m.flags[0]);
 // Enemy macro decisions are updated periodically, while player orders persist.
 for(let i=0;i<team.members.length;i++){
  const c=team.members[i];let task=i===0?'capture':i===1||i===2?'escort':i===3||i===4?'defend':i===5||i===6?'recover':i===8?'escort':'capture';
  if(!ownStolen&&task==='recover')task='midfield';
  if(ownStolen&&i===7)task='recover';
  c.order={task,route:friendlyCarrier?friendlyCarrier.order.route:i%2?'tunnel':'ramp',pointId:'mid'};
 }
}
function objective(m,c){
 const home=WARSONG.teams[c.side],own=m.flags[c.side],enemy=m.flags[1-c.side],friend=carrier(m,enemy),foe=carrier(m,own);
 if(carrying(m,c)){c.intent=own.status==='base'?'持旗返家交旗':'持旗退守高台，等待己旗归位';return own.status==='base'?home.base:home.safe;}
 switch(c.order.task){
  case 'capture':c.intent=friend?'接应我方旗手':'前往敌方旗帜';return friend?nearestBgNode(friend):enemy.status==='dropped'?nearestBgNode(enemy):WARSONG.teams[1-c.side].base;
  case 'defend':c.intent='守卫旗室，拦截入侵';return own.status==='dropped'&&bgDistance(own,bgNodes[home.base])<35?nearestBgNode(own):home.base;
  case 'escort':{
   const runner=friend||m.teams[c.side].members.find(a=>alive(a)&&a.order.task==='capture');
   c.intent=friend?'贴身护送我方旗手':runner?'接应夺旗小队':'守家等待夺旗手';return runner?nearestBgNode(runner):home.base;
  }
  case 'recover':c.intent=foe?'追杀敌方旗手':own.status==='dropped'?'归还掉落的己旗':'己旗安全，前场拦截';return foe?nearestBgNode(foe):own.status==='dropped'?nearestBgNode(own):c.side===0?'west-mid':'east-mid';
  case 'rally':c.intent='驻守'+bgNodes[c.order.pointId].name;return c.order.pointId;
  default:c.intent='中场拦截';return 'mid';
 }
}
function chooseEnemy(m,c){
 const flag=m.flags[c.side],home=bgNodes[WARSONG.teams[c.side].base];
 return m.teams[1-c.side].members.filter(e=>alive(e)&&e.protectedUntil<=m.clock&&bgDistance(c,e)<=26&&bgSight(c,e)
  &&(c.order.task!=='defend'||bgDistance(e,home)<=32))
  .sort((a,b)=>Number(b.id===flag.carrierId)-Number(a.id===flag.carrierId)||bgDistance(c,a)-bgDistance(c,b))[0];
}
function healTarget(m,c){
 const friend=carrier(m,m.flags[1-c.side]);
 return m.teams[c.side].members.filter(a=>alive(a)&&a.hp<a.maxHp*.9&&bgDistance(c,a)<=27&&bgSight(c,a))
  .sort((a,b)=>(a.hp/a.maxHp-(a===friend?.2:0))-(b.hp/b.maxHp-(b===friend?.2:0)))[0];
}
function carrierPressure(m){
 if(!m.flags.every(f=>f.status==='carried'))return 0;
 const since=Math.max(...m.flags.map(f=>f.takenAt));return Math.min(10,Math.max(0,Math.floor((m.clock-since-180000)/30000)+1));
}
function moveUnits(m){
 for(const c of all(m)){
  if(!alive(c)||c.stunnedUntil>m.clock)continue;
  let destination=objective(m,c);const enemy=chooseEnemy(m,c),range=['ranged','healer'].includes(c.role)?24:6;
  const flag=carrying(m,c),travel=['capture','escort','recover','rally'].includes(c.order.task);
  c.targetId=enemy?.id||null;
  if(c.cast)continue;
  // Objective runners do not get stuck fighting every defender along the road.
  if(!flag&&enemy&&(!travel||c.order.task==='recover'&&enemy.id===m.flags[c.side].carrierId||bgDistance(c,bgNodes[destination])<8)){
   if(bgDistance(c,enemy)<=range)continue;
   destination=nearestBgNode(enemy);
  }
  if(c.role==='healer'&&!flag&&c.order.task!=='rally'&&healTarget(m,c)&&c.mana>=c.maxMana*.07)continue;
  const speed=(c.classId===11?6.4:5.6)*(c.speedUntil>m.clock?1.5:1)*(c.slowUntil>m.clock?.55:1);
  moveBgActor(c,destination,.1,speed);
 }
}
function kill(m,c,killer){
 c.hp=0;c.score.deaths++;c.cast=null;c.targetId=null;c.edge=null;
 if(killer)killer.score.kills++;
 const flag=carrying(m,c);
 if(flag){flag.status='dropped';flag.carrierId=null;flag.x=c.x;flag.y=c.y;flag.returnAt=m.clock+WARSONG.flagReturnMs;event(m,`${c.name}阵亡，${m.teams[flag.side].name}旗帜掉落！`,'flag');}
 c.respawnAt=m.startedAt+(Math.floor((m.clock-m.startedAt)/WARSONG.resurrectionMs)+1)*WARSONG.resurrectionMs;
 c.intent='等待墓地集体复活';
}
function combat(m){
 const damage=[],heals=[],controls=[],units=all(m),pressure=carrierPressure(m);
 for(const c of units){
  if(!alive(c))continue;
  if(c.stunnedUntil>m.clock){c.cast=null;continue;}
  if(c.cast){
   if(c.cast.until>m.clock)continue;
   const target=units.find(a=>a.id===c.cast.targetId);
   if(target&&alive(target)&&bgDistance(c,target)<=27&&bgSight(c,target))heals.push({source:c,target,amount:c.maxHp*.2});
   c.cast=null;c.nextAttack=m.clock+1000;continue;
  }
  if(c.nextAttack>m.clock)continue;
  const heal=c.role==='healer'&&(c.order.task!=='rally'||atNode(c,c.order.pointId))&&healTarget(m,c);
  if(heal&&c.mana>=c.maxMana*.07&&c.maxMana>0){c.mana-=c.maxMana*.07;c.cast={name:'治疗',targetId:heal.id,until:m.clock+1500};c.lastCombatAt=m.clock;continue;}
  const enemy=chooseEnemy(m,c),range=['ranged','healer'].includes(c.role)?24:6;
  if(!enemy||bgDistance(c,enemy)>range)continue;
  c.protectedUntil=0;c.lastCombatAt=m.clock;enemy.lastCombatAt=m.clock;c.nextAttack=m.clock+1500;
  let amount=c.maxHp*(c.role==='healer'?.028:c.role==='tank'?.045:.068);
  if(enemy.role==='tank')amount*=.72;
  if(c.berserkUntil>m.clock)amount*=1.3;
  if(enemy.berserkUntil>m.clock)amount*=1.1;
  if(carrying(m,enemy))amount*=1+pressure*.1;
  damage.push({source:c,target:enemy,amount:Math.round(amount)});
  if(m.clock>=c.nextControl&&[4,8,3,1].includes(c.classId)){
   controls.push({source:c,target:enemy});
   c.nextControl=m.clock+12000;
  }
 }
 // Resolve simultaneous actions together; team ordering confers no first-strike advantage.
 for(const hit of heals){const amount=Math.min(hit.amount,hit.target.maxHp-hit.target.hp);hit.target.hp+=amount;hit.source.score.healing+=Math.round(amount);m.effects.push({from:hit.source.id,to:hit.target.id,kind:'heal',until:m.clock+500});}
 const killers=new Map();
 for(const hit of damage){if(hit.target.hp<=0)continue;const amount=Math.min(hit.amount,hit.target.hp);hit.source.score.damage+=amount;hit.target.hp-=amount;killers.set(hit.target.id,hit.source);m.effects.push({from:hit.source.id,to:hit.target.id,kind:'attack',until:m.clock+350});}
 for(const {source,target} of controls){
  if(!alive(target))continue;
  if(source.classId===4&&target.controlImmuneUntil<=m.clock){target.stunnedUntil=m.clock+2000;target.controlImmuneUntil=m.clock+18000;target.cast=null;}
  else if(source.classId!==4)target.slowUntil=m.clock+3000;
 }
 for(const c of units)if(c.hp<=0&&!c.respawnAt)kill(m,c,killers.get(c.id));
}
function resurrectAndRegenerate(m){
 for(const c of all(m)){
  if(c.respawnAt&&m.clock>=c.respawnAt){
   const grave=bgNodes[WARSONG.teams[c.side].graveyard];Object.assign(c,{hp:c.maxHp,mana:c.maxMana,x:grave.x,y:grave.y,node:grave.id,edge:null,respawnAt:0,
    stunnedUntil:0,slowUntil:0,speedUntil:0,berserkUntil:0,controlImmuneUntil:0,protectedUntil:m.clock+3000,nextAttack:m.clock+1000});
   event(m,`${c.number}号 ${c.name}在墓地复活，继续执行${BATTLEGROUND_ORDERS.find(o=>o.id===c.order.task).short}任务。`,'resurrection');
  }
  if(alive(c)&&m.clock%1000===0){c.mana=Math.min(c.maxMana,c.mana+c.maxMana*.014);if(m.clock-c.lastCombatAt>6000)c.hp=Math.min(c.maxHp,c.hp+c.maxHp*.04);}
 }
}
function flagInteractions(s){
 const m=s.battleground;
 if(m.flagResetAt){if(m.clock<m.flagResetAt)return;resetFlag(m,0);resetFlag(m,1);m.flagResetAt=0;event(m,'双方旗帜已重置，继续夺旗。','flag');}
 for(const flag of m.flags){
  if(flag.status==='dropped'&&flag.returnAt<=m.clock){resetFlag(m,flag.side);event(m,`${m.teams[flag.side].name}旗帜自动归位。`,'flag');continue;}
  if(flag.status==='carried'){const c=carrier(m,flag);if(c){flag.x=c.x;flag.y=c.y;}continue;}
  const nearby=all(m).filter(c=>alive(c)&&c.stunnedUntil<=m.clock&&bgDistance(c,flag)<=3&&bgSight(c,flag));
  const defender=flag.status==='dropped'&&nearby.find(c=>c.side===flag.side);
  if(defender){defender.score.returns++;resetFlag(m,flag.side);event(m,`${defender.name}归还了${m.teams[flag.side].name}旗帜！`,'flag');continue;}
  const taker=nearby.filter(c=>c.side!==flag.side&&!carrying(m,c)).sort((a,b)=>Number(b.order.task==='capture')-Number(a.order.task==='capture')||a.number-b.number)[0];
  if(taker){flag.status='carried';flag.carrierId=taker.id;flag.takenAt??=m.clock;flag.returnAt=0;taker.cast=null;taker.protectedUntil=0;event(m,`${taker.number}号 ${taker.name}夺取了${m.teams[flag.side].name}旗帜！`,'flag');}
 }
 for(const flag of m.flags){
  const c=carrier(m,flag);if(!c||m.flags[c.side].status!=='base'||!atNode(c,WARSONG.teams[c.side].base))continue;
  m.score[c.side]++;c.score.captures++;event(m,`${c.name}成功交旗！${m.score[0]} : ${m.score[1]}`,'capture');
  for(const f of m.flags){f.status='resetting';f.carrierId=null;}m.flagResetAt=m.clock+WARSONG.flagResetMs;
  if(m.score[c.side]>=WARSONG.capturesToWin)finish(s,c.side,'率先夺得三面旗帜');break;
 }
}
function powerups(m){
 for(const b of m.buffs){
  if(m.clock<b.readyAt)continue;
  const c=all(m).filter(c=>alive(c)&&atNode(c,b.node)).sort((a,b)=>bgDistance(a,bgNodes[b.node])-bgDistance(b,bgNodes[b.node]))[0];
  if(!c)continue;b.readyAt=m.clock+60000;
  if(b.kind==='speed')c.speedUntil=m.clock+10000;
  else if(b.kind==='berserk')c.berserkUntil=m.clock+10000;
  else {c.hp=Math.min(c.maxHp,c.hp+c.maxHp*.5);c.mana=Math.min(c.maxMana,c.mana+c.maxMana*.5);}
  event(m,`${c.name}获得${b.name}增益。`,'buff');
 }
}
export function battlegroundTick(s){
 const m=s.battleground;if(!m||!['countdown','combat'].includes(m.phase))return;
 m.clock+=100;if(m.clock<m.startedAt)return;
 if(m.phase==='countdown'){m.phase='combat';event(m,'栅门开启！率先夺得三面旗帜的一方获胜。','flag');}
 m.effects=m.effects.filter(e=>e.until>m.clock);
 resurrectAndRegenerate(m);
 if(m.clock>=m.nextAiAt){aiOrders(m);m.nextAiAt=m.clock+5000;}
 moveUnits(m);combat(m);flagInteractions(s);if(m.phase==='combat')powerups(m);
}
export function battlegroundView(s){
 const m=s.battleground;
 return {unlocked:s.level>=20&&s.growthPolicy!=='companion',blockedReason:blockedReason(s),map:WARSONG,
  orders:BATTLEGROUND_ORDERS,routes:BATTLEGROUND_ROUTES,record:s.battlegroundRecord||{played:0,won:0,captures:0},
  match:!m||m.phase==='cancelled'?null:{id:m.id,phase:m.phase,clock:m.clock,startedAt:m.startedAt,revision:m.revision,score:[...m.score],
   flags:structuredClone(m.flags),flagResetAt:m.flagResetAt,pressure:carrierPressure(m),result:m.result,
   teams:m.teams.map(t=>({name:t.name,color:t.color,members:t.members.map(c=>({...c,order:{...c.order},score:{...c.score}}))})),
   buffs:m.buffs.map(b=>({...b})),events:m.events.slice(-35),effects:m.effects.map(e=>({...e})),
   resurrectionInMs:WARSONG.resurrectionMs-((Math.max(0,m.clock-m.startedAt))%WARSONG.resurrectionMs)},
 };
}
