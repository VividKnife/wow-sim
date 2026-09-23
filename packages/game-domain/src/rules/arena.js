import {arenaTacticalTick} from './arena-tactics.js';
import {arenaMaps,arenaSight,arenaPointAllowed} from '../../../sim-core/src/arena-space.js';
import {activeAuras} from '../../../sim-core/src/combat-auras.js';
import {unitCreatureType} from './pvp-runtime.js';
import {stats,clone,spellInfo,log} from './character.js';
import {spells,nameOf,classDefinitions,icon} from './catalog.js';
import {recruit} from './party.js';
import {combatRole} from './combat-roles.js';
import {combatTick} from './combat.js';
import {recoveryTick} from './recovery.js';
import {detectsTarget} from './combat-space.js';
import {applyPvpProfile,savePvpProfile} from './pvp-profiles.js';

export const arenaCommands=['arenaPrepare','arenaSave','arenaStart','arenaCancel','arenaSurrender','pvpConfigure'];
export const arenaOpponents=[
 {id:'rmp',name:'银月试炼队',description:'盗贼压制，法师控场，牧师支援。',members:[['rogue','melee'],['mage','ranged'],['priest','healer'],['warrior','melee'],['paladin','healer']]},
 {id:'cleave',name:'赤砂突击队',description:'近战持续施压，萨满负责治疗与打断。',members:[['warrior','melee'],['rogue','melee'],['shaman','healer'],['hunter','ranged'],['paladin','healer']]},
 {id:'casters',name:'暮光织法者',description:'法术压制与控制，依靠柱体维持距离。',members:[['warlock','ranged'],['mage','ranged'],['druid','healer'],['priest','ranged'],['shaman','healer']]},
];
const tasks=['focus','pressure','protect','control'];
const need=(condition,message)=>{if(!condition)throw new Error(message);};
const living=team=>team.members.filter(c=>c.hp>0);
function prepareActor(source,id,side,index,map){
 const c=applyPvpProfile(clone(source));for(const key of ['arena','party','combat','lastCombat','battleHistory','journey','quests','completed','logs','receipts','bank','auctions','pending','guildRaid','goldRaid','activity','dungeon','mounted','rest','cast','pet','totems','talentProcs','racialBuff','racialEffects','soulstone','bloodrage','classBuffs','classBuff','flares','trap','sunder','absorb','manaShield','groundEffects','stealthed','invisible','queuedStrike'])delete c[key];
 c.sourceId=source.id;c.id=id;c.teamId=side;c.pvp=true;c.arenaArea=map;c.arenaBag=clone(source.bag||[]);delete c.bag;
 Object.assign(c,{time:0,cooldowns:{},categoryCooldowns:{},globalCooldowns:{},schoolLockouts:{},buffs:{},auras:[],dots:[],hots:[],periodicClass:[],movementSlows:[],diminishing:{},threat:{},form:null,stunUntil:0,rootUntil:0,polyUntil:0,slowUntil:0,frozenUntil:0,silenceUntil:0,weakenedSoulUntil:0,combo:0,comboTarget:null,rage:0,energy:100,inCombat:false,lastManaUse:-5000,nextAction:3000,nextSwing:3000,nextRanged:3000,nextOffhand:3000,nextPowerRegen:5000,position:side===0?map.minX+5:map.maxX-5,positionY:index*3-3,moveSpeed:7,dead:false});
 c.strategyPolicy={...c.strategyPolicy,waitForTank:false,protectCC:true};c.potions={...c.potions,enabled:false};
 c.baseRules=clone(c.rules||[]);const st=stats(c);Object.assign(c,{hp:st.maxHp,mana:st.maxMana,maxHp:st.maxHp,maxMana:st.maxMana,armor:st.armor,resistances:st.resistances});return c;
}
function npcMembers(s,opponent,size,map){
 const staging={...clone(s),arena:null,party:[],logs:[],journey:[],money:0,itemSequence:0,clock:0,growthPolicy:undefined};
 return opponent.members.slice(0,size).map(([id,role],index)=>{staging.party=[];const c=recruit(staging,id,{role});c.name=['A','B','C','D','E'][index]+' · '+c.name;return prepareActor(c,`arena:1:${index}`,1,index,map);});
}
function defaults(members,enemies){
 const healer=enemies.find(c=>combatRole(c)==='healer')||enemies.at(-1),focus=enemies.find(c=>c.id!==healer?.id)||enemies[0],ownHealer=members.find(c=>combatRole(c)==='healer')||members[0];
 return {focusId:focus.id,controlId:healer.id,killOrder:enemies.map(c=>c.id),swapOnImmunity:true,minControlMs:3000,maxBurstWaitMs:12000,burst:'controlled',assignments:members.map(c=>({actorId:c.id,task:combatRole(c)==='healer'?'focus':c.classId===8?'control':'focus',targetId:focus.id,protectId:ownHealer.id,retreatBelow:30,leash:30,interrupt:'healer'})),controlOrder:members.map(c=>c.id)};
}
function validatePlan(arena,input){
 need(input&&typeof input==='object','战术配置无效。');const own=arena.teams[0].members,enemy=arena.teams[1].members;
 need(enemy.some(c=>c.id===input.focusId)&&enemy.some(c=>c.id===input.controlId)&&input.focusId!==input.controlId,'集火与控制对象必须是不同的敌方成员。');
 need(['controlled','immediate'].includes(input.burst),'爆发条件无效。');
 need(Array.isArray(input.killOrder)&&input.killOrder.length===enemy.length&&new Set(input.killOrder).size===enemy.length&&input.killOrder.every(id=>enemy.some(e=>e.id===id)),'转火顺序必须包含所有敌方成员。');
 need(typeof input.swapOnImmunity==='boolean'&&[1000,3000,5000].includes(input.minControlMs)&&[8000,12000,20000].includes(input.maxBurstWaitMs),'控制与爆发窗口设置无效。');
 need(Array.isArray(input.assignments)&&input.assignments.length===own.length,'请为每名出战成员设置战术。');
 const seen=new Set(),assignments=input.assignments.map(a=>{need(a&&own.some(c=>c.id===a.actorId)&&!seen.has(a.actorId),'战术成员无效或重复。');seen.add(a.actorId);need(tasks.includes(a.task)&&enemy.some(c=>c.id===a.targetId)&&own.some(c=>c.id===a.protectId),'战术任务或目标无效。');need(Number.isFinite(a.retreatBelow)&&a.retreatBelow>=0&&a.retreatBelow<=80&&Number.isFinite(a.leash)&&a.leash>=10&&a.leash<=50,'回撤生命阈值应为0–80%，追击距离应为10–50码。');need(['off','focus','healer','any'].includes(a.interrupt),'打断职责无效。');return{actorId:a.actorId,task:a.task,targetId:a.targetId,protectId:a.protectId,retreatBelow:a.retreatBelow,leash:a.leash,interrupt:a.interrupt};});
 need(Array.isArray(input.controlOrder)&&input.controlOrder.length===own.length&&new Set(input.controlOrder).size===own.length&&input.controlOrder.every(id=>seen.has(id)),'控制顺序必须包含每名队员且不能重复。');
 need(!assignments.some(a=>a.task==='control')||!assignments.some(a=>a.task==='pressure'&&a.targetId===input.controlId),'压制目标与控场目标冲突，请选择不同目标或停用控制接力。');
 const positions=(input.positions||[]).map(p=>{need(seen.has(p.id)&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x<=arena.map.minX+10&&arenaPointAllowed(arena.map,p),'初始站位必须位于己方出生区。');return{id:p.id,x:p.x,y:p.y};});
 need(new Set(positions.map(p=>p.id)).size===positions.length,'初始站位重复。');return{focusId:input.focusId,controlId:input.controlId,killOrder:[...input.killOrder],swapOnImmunity:input.swapOnImmunity,minControlMs:input.minControlMs,maxBurstWaitMs:input.maxBurstWaitMs,burst:input.burst,assignments,controlOrder:[...input.controlOrder],positions};
}
export function arenaAction(s,a){
 if(a.type==='pvpConfigure'){
  need(!['countdown','combat'].includes(s.arena?.phase),'开战后 PvP 配置已锁定，请在下一场准备时修改。');
  const source=savePvpProfile(s,a),arena=s.arena;
  if(arena?.phase==='preparing'){
   const members=arena.teams[0].members,index=members.findIndex(c=>c.sourceId===source.id);
   if(index>=0){const old=members[index],next=prepareActor(source,old.id,0,index,arena.map);next.position=old.position;next.positionY=old.positionY;members[index]=next;arena.planRevision++;}
  }
  return;
 }
 if(a.type==='arenaPrepare'){
  need(!s.combat&&!s.dungeon&&!s.guildRaid?.active&&!s.goldRaid?.active&&s.activity.type==='idle'&&s.hp>0,'请先结束当前活动并离开副本。');
  need(s.level>=18&&s.growthPolicy!=='companion','主角达到18级后可以率领小队参加竞技场。');
  need([2,3,5].includes(a.size),'请选择2v2、3v3或5v5。');const map=arenaMaps.find(m=>m.id===a.mapId),opponent=arenaOpponents.find(o=>o.id===a.opponentId);
  need(map&&opponent,'竞技场或NPC队伍不存在。');need(Array.isArray(a.memberIds)&&a.memberIds.length===a.size&&a.memberIds[0]===s.id&&new Set(a.memberIds).size===a.size,'阵容必须包含主角和对应数量的不重复队友。');
  const roster=[s,...s.party],chosen=a.memberIds.map(id=>roster.find(c=>c.id===id));need(chosen.every(c=>c&&c.hp>0&&c.level===s.level),'请选择同级且存活的小队成员。');
  const serial=(s.arena?.serial||0)+1,teams=[{members:chosen.map((c,i)=>prepareActor(c,`arena:0:${i}`,0,i,map))},{members:npcMembers(s,opponent,a.size,map)}];
  s.arena={id:`arena:${s.id}:${serial}`,serial,phase:'preparing',size:a.size,map:clone(map),opponentId:opponent.id,opponentName:opponent.name,clock:0,rngState:s.rngState,logs:[],logSequence:0,metrics:{version:1,actors:{},startedAt:3000,partial:false},teams,result:null,planRevision:0};
  for(let i=0;i<2;i++){teams[i].plan=defaults(teams[i].members,teams[1-i].members);teams[i].projectiles=[];teams[i].groundEffects=[];}
  s.activity={type:'arenaPrepare'};s.rest=null;return;
 }
 const arena=s.arena;need(arena&&a.matchId===arena.id,'竞技场场次已变化，请刷新。');
 if(a.type==='arenaCancel'){need(arena.phase==='preparing','只有准备阶段可以取消。');arena.phase='cancelled';s.activity={type:'idle'};return;}
 if(a.type==='arenaSurrender'){need(arena.phase==='combat'||arena.phase==='countdown','当前没有正在进行的竞技战斗。');finishArena(s,1,'投降');return;}
 need(arena.phase==='preparing','本场已经开始，战术已锁定。');need(a.revision===arena.planRevision,'准备配置已在其他页面修改，请刷新。');
 arena.teams[0].plan=validatePlan(arena,a.plan);arena.planRevision++;
 if(a.type==='arenaStart'){for(const p of arena.teams[0].plan.positions){const c=arena.teams[0].members.find(c=>c.id===p.id);c.position=p.x;c.positionY=p.y;}arena.phase='countdown';s.activity={type:'arenaCombat'};}
}
function arenaUnits(team,map,initialize=true){
 const units=[...team.members,...team.members.flatMap(c=>c.pet?[c.pet]:[]),...team.members.flatMap(c=>Object.values(c.totems||{}).filter(t=>t.totemUnit))];
 if(initialize)for(const c of units){c.pvp=true;c.teamId=team.members[0].teamId;c.arenaArea=map;c.dots??=[];c.threat??={};c.equipment??={};c.talents??={};c.learned??=[];}
 return units;
}
function simulateTeam(arena,index){
 const team=arena.teams[index],actors=arenaUnits(team,arena.map),enemies=arenaUnits(arena.teams[1-index],arena.map),root=team.members[0];
 const injected={party:team.members.slice(1),arenaActors:actors,arenaAllActors:[...actors,...enemies],combat:{id:arena.id,startedAt:3000,pvp:true,area:arena.map,enemies,participantIds:actors.map(c=>c.id),projectiles:team.projectiles,pendingSpawns:[],damage:{},healing:{},casts:0,metrics:arena.metrics,projectileSequence:team.projectileSequence||0},clock:arena.clock,rngState:arena.rngState,logs:arena.logs,logSequence:arena.logSequence,groundEffects:team.groundEffects,settings:{},activity:{type:'arenaCombat'},totals:{deaths:0},bag:root.arenaBag,pending:[],quests:{},completed:{},journey:[],journeySequence:0};
 const old=new Map(Object.keys(injected).map(key=>[key,{present:Object.hasOwn(root,key),value:root[key]}]));Object.assign(root,injected);
 try{
  for(const c of actors){c.time=arena.clock;const st=stats(c);c.maxHp=st.maxHp;c.maxMana=st.maxMana;}
  recoveryTick(root,arena.clock%2000===0);arenaTacticalTick(root,team,enemies);combatTick(root,{pvpTeam:true});
  arena.rngState=root.rngState;arena.logSequence=root.logSequence;team.projectiles=root.combat.projectiles;team.projectileSequence=root.combat.projectileSequence;team.groundEffects=root.groundEffects;
 }finally{for(const [key,previous]of old)if(previous.present)root[key]=previous.value;else delete root[key];}
}
function finishArena(s,winner,reason){
 const a=s.arena;a.phase='finished';a.result={winner,reason,endedAt:a.clock,durationMs:Math.max(0,a.clock-3000)};
 for(const t of a.teams)for(const c of t.members)c.cast=null;
 s.activity={type:'idle'};log(s,`竞技场：${winner===0?'获胜':winner===1?'落败':'平局'} · ${reason}`,'arena');
}
export function arenaTick(s){
 const a=s.arena;if(!a||!['countdown','combat'].includes(a.phase))return;
 a.clock+=100;if(a.clock<3000)return;a.phase='combat';
 // Alternate priority by tick; both sides use exactly the same actor pipeline.
 const first=Math.floor(a.clock/100)%2;simulateTeam(a,first);simulateTeam(a,1-first);
 const alive=a.teams.map(t=>living(t).length);
 if(!alive[0]||!alive[1])finishArena(s,alive[0]?0:alive[1]?1:null,'全队倒下');
 else if(a.clock>=603000)finishArena(s,null,'达到本场10分钟上限');
}
function memberView(c,clock,own){
 const st=stats(c),definition=classDefinitions.find(d=>d.id===c.classId),cast=c.cast,castInfo=cast?spellInfo(c,cast.spell):null;
 return{id:c.id,sourceId:c.sourceId,name:c.name,classId:c.classId,raceId:c.raceId,gender:c.gender,entry:c.entry,pvpProfileName:c.pvpProfileName,className:definition?.name,level:c.level,role:combatRole(c),hp:c.hp,maxHp:st.maxHp,mana:c.mana,maxMana:st.maxMana,energy:c.energy,rage:c.rage,power:c.power,x:c.position,y:c.positionY,teamId:c.teamId,petUnit:!!c.petUnit,totemUnit:!!c.totemUnit,kind:c.kind,form:c.form,creatureType:unitCreatureType(c),hidden:false,stealthed:!!c.stealthed,targetId:c.target,intent:own?c.arenaIntent:undefined,cast:cast?{spellId:cast.spell,school:spells[cast.spell]?.School,range:castInfo.range,radius:castInfo.radius,channel:!!cast.channel,center:cast.center,name:nameOf('spells',cast.spell),startedAt:cast.startedAt,until:cast.until,targetId:cast.target}:null,effects:activeAuras(c,clock).filter(a=>[5,7,12,26,27,67].includes(a.type)).map(a=>({spellId:a.spell,name:nameOf('spells',a.spell),type:a.type,until:a.until})),diminishing:clone(c.diminishing||{})};
}
export function arenaView(s){
 const a=s.arena,roster=[s,...s.party].map(c=>({id:c.id,name:c.name,classId:c.classId,role:combatRole(c),level:c.level,alive:c.hp>0}));
 const base={maps:arenaMaps,opponents:arenaOpponents.map(o=>({id:o.id,name:o.name,description:o.description})),roster,unlocked:s.level>=18&&s.growthPolicy!=='companion'};
 if(!a)return{...base,match:null};
 const own=a.teams[0].members,hidden=new Set();
 const teams=a.teams.map((team,index)=>({members:arenaUnits(team,a.map,false).map(c=>{const v=memberView(c,a.clock,index===0);if(index===1&&a.phase==='combat'&&!own.some(observer=>observer.hp>0&&detectsTarget(observer,c,a.clock))){hidden.add(c.id);return{...v,x:null,y:null,hidden:true,cast:null,targetId:null,effects:[],diminishing:{}};}return v;})}));
 const logs=a.logs.filter(e=>!hidden.has(e.actorId)&&!hidden.has(e.targetId)).slice(-50).map(e=>({id:e.id,at:e.at,text:e.text,kind:e.kind,actorId:e.actorId,targetId:e.targetId,spellId:e.spellId,school:e.school,amount:e.amount,critical:e.critical,periodic:e.periodic,center:e.center,radius:e.radius,from:e.from,to:e.to,startedAt:e.startedAt,landsAt:e.landsAt,projectileId:e.projectileId?`${e.actorId}:${e.projectileId}`:undefined,visual:e.visual}));
 const projectiles=a.teams.flatMap(t=>t.projectiles).filter(p=>!hidden.has(p.actorId)&&!hidden.has(p.targetId)).map(p=>({id:`${p.actorId}:${p.id}`,spellId:p.spellId,actorId:p.actorId,targetId:p.targetId,from:p.from,to:p.to,startedAt:p.startedAt,landsAt:p.landsAt,school:p.school,visual:p.visual}));
 const groundEffects=a.teams.flatMap(t=>t.groundEffects).filter(e=>!hidden.has(e.caster)).map((e,i)=>({id:`ground:${i}`,actorId:e.caster,spellId:e.spellId||e.spell,center:e.center||{x:e.position,y:e.positionY||0},radius:e.radius,startedAt:e.startedAt,until:e.until,school:e.school}));
 const spellIds=new Set([...logs.map(e=>e.spellId),...projectiles.map(e=>e.spellId),...groundEffects.map(e=>e.spellId),...teams.flatMap(t=>t.members.map(c=>c.cast?.spellId))]);
 const skills=[...spellIds].filter(id=>spells[id]).map(id=>({spellId:id,name:nameOf('spells',id),icon:icon('spells',id),school:spells[id].School}));
 return{...base,match:{id:a.id,revision:a.planRevision,size:a.size,phase:a.phase,map:a.map,opponentName:a.opponentName,clock:a.clock,activeFocusId:a.teams[0].currentFocusId,tacticalStatus:a.teams[0].tacticalStatus,plan:clone(a.teams[0].plan),teams,result:a.result,logs,metrics:Object.values(a.metrics.actors).map(m=>({actorId:m.actorId,name:m.name,damage:m.damage,healing:m.healing})),projectiles,groundEffects,skills}};
}
