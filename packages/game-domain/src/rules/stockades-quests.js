import {startCombat} from './combat.js';
import {nameOf} from './catalog.js';
import {log} from './character.js';
import {stopRecovery} from './recovery.js';

const QUEST=434,LOCATION='keep',TARGETS=[1754,1755];
// Classic quest 434 describes these narrative beats. Durations are an explicit
// 2D adaptation, not claimed to reproduce the original scripted waypoints.
const dialogue=[
 {stage:'disguise',duration:5000,text:'泰里恩为间谍机器人换上伪装，命你留在花园观察。'},
 {stage:'dismiss',duration:8000,text:'间谍机器人传来消息。格雷戈·莱斯科瓦公爵走进花园，遣散了卫兵。'},
 {stage:'conspiracy',duration:10000,text:'沉默之刃马尔松前来会面；两人的谈话暴露了他们与迪菲亚兄弟会的联系。'},
];
function blocked(s){return s.location!==LOCATION||!s.quests[QUEST]||s.quests[QUEST].event||s.completed[QUEST]||s.hp<=0||s.party.some(c=>c.hp<=0)||s.combat||s.dungeon||s.escort||s.stockadesQuestEvent||!['idle','hunt'].includes(s.activity.type);}
function stage(s,index){const event=s.stockadesQuestEvent,beat=dialogue[index];event.index=index;event.stage=beat.stage;event.endsAt=s.clock+beat.duration;s.activity={type:'stockadesQuestEvent',quest:QUEST,startedAt:s.clock,endsAt:event.endsAt};log(s,beat.text,'quest');}
function clearProgress(s){const q=s.quests[QUEST];if(q){q.event=false;for(const id of TARGETS)delete q.kills[id];}}
export function beginStockadesQuestEvent(s,questId=QUEST){
 if(Number(questId)!==QUEST||blocked(s))throw new Error('请接受“刺杀行动”任务，在暴风要塞花园结束其他活动并恢复队伍后开始。');
 clearProgress(s);stopRecovery(s);s.stockadesQuestEventSequence=(s.stockadesQuestEventSequence||0)+1;
 s.stockadesQuestEvent={quest:QUEST,location:LOCATION,startedAt:s.clock,attempt:s.stockadesQuestEventSequence,cancelled:false};stage(s,0);
}
function finish(s,success,reason){
 const event=s.stockadesQuestEvent;if(success)s.quests[QUEST].event=true;else clearProgress(s);
 s.stockadesQuestEventLast={quest:QUEST,attempt:event.attempt,outcome:success?'complete':'failed',at:s.clock,reason};delete s.stockadesQuestEvent;s.activity={type:s.hp>0?'idle':'dead',reason};log(s,reason,'quest');
}
export function cancelStockadesQuestEvent(s){
 if(!s.stockadesQuestEvent)throw new Error('当前没有进行中的袭击事件。');s.stockadesQuestEvent.cancelled=true;stockadesQuestTick(s);
}
export function stockadesQuestTick(s){
 const event=s.stockadesQuestEvent;if(!event)return;
 if(!s.quests[QUEST]||s.completed[QUEST]||s.hp<=0||s.location!==event.location)event.cancelled=true;
 if(event.cancelled){if(!s.combat)finish(s,false,'袭击失败或已停止。返回暴风要塞花园后可以重新尝试。');return;}
 if(event.stage==='combat'){
  if(s.combat)return;const battle=s.lastCombat;
  const won=battle?.questEventAttempt===event.attempt&&battle.quest===QUEST&&TARGETS.every(id=>battle.enemies.some(e=>e.entry===id&&e.hp<=0&&e.rewarded&&!e.removed));
  finish(s,won,won?'已揭露密谋并击败莱斯科瓦和马尔松。返回埃林·提亚斯处报告。':'袭击失败：目标逃脱。返回花园后可以重新尝试。');return;
 }
 if(s.combat||s.clock<event.endsAt)return;
 if(event.index+1<dialogue.length){stage(s,event.index+1);return;}
 event.stage='combat';delete event.endsAt;s.activity={type:'stockadesQuestEvent',quest:QUEST};startCombat(s,TARGETS);s.combat.quest=QUEST;s.combat.questEventAttempt=event.attempt;log(s,'密谈结束，向莱斯科瓦和马尔松发起袭击！','quest');
}
export function stockadesQuestEventView(s){
 const event=s.stockadesQuestEvent;if(event)return{active:true,questId:QUEST,location:LOCATION,stage:event.stage,name:nameOf('quests',QUEST),endsAt:event.endsAt??null,cancelled:event.cancelled};
 return s.quests[QUEST]&&!s.quests[QUEST].event?{active:false,questId:QUEST,location:LOCATION,name:'观察花园中的密谋',canStart:!blocked(s),last:s.stockadesQuestEventLast??null}:null;
}
