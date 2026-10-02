import {quests,questLinks,nameOf} from './catalog.js';
import {dungeonJournal} from './dungeon-journal.js';
import {dungeonQuestIds,questPrerequisiteGroups,questAvailable,questContentReason,questProgress} from './quests.js';
import {questNpcNavigation} from './navigation.js';

const fitsCharacter=(s,q)=>q&&!questContentReason(q)&&(!q.RequiredClasses||!!(q.RequiredClasses&(1<<(s.classId-1))))&&(!q.RequiredRaces||!!(q.RequiredRaces&(1<<((s.raceId||1)-1))));
const done=(s,q)=>!!s.completed[q.entry]&&!(q.SpecialFlags&1);
function lockedReason(s,q){
 if(s.level<q.MinLevel)return `需要达到 ${q.MinLevel} 级`;
 if(q.MaxLevel&&s.level>q.MaxLevel)return '超过任务等级限制';
 if((s.questWaits?.[q.entry]||0)>s.clock)return '等待后续任务开放';
 return '尚未满足任务的接取条件';
}
// Resolve the earliest unfinished link, preserving AND between prerequisite
// groups and OR between alternative predecessors. Cycles never yield a route.
export function dungeonQuestPlan(s,id,seen=new Set()){
 const q=quests[id];
 if(!fitsCharacter(s,q))return null;
 if(seen.has(id)||seen.size>=64)return {questId:id,reason:'任务前置关系无法解析',navigation:null};
 if(done(s,q))return {questId:id,status:'completed',reason:'已完成',navigation:null};
 const next=new Set(seen);next.add(id);
 if(!s.quests[id])for(const group of questPrerequisiteGroups(q)){
  if(group.some(prior=>prior<0?s.quests[-prior]:s.completed[prior]))continue;
  const candidates=group.map(prior=>dungeonQuestPlan(s,Math.abs(prior),next)).filter(Boolean);
  const candidate=candidates.find(p=>p.navigation&&!p.reason)||candidates.find(p=>p.status!=='completed');
  return candidate?{...candidate,prerequisite:true}:{questId:id,reason:'没有适合当前角色的前置任务',navigation:null};
 }
 const progress=s.quests[id]?questProgress(s,id):null;
 const kind=progress?'ends':'starts',available=!!progress||questAvailable(s,q);
 const navigation=questNpcNavigation(s,id,kind);
 const itemStarter=!progress&&(questLinks[id]?.starts||[]).every(e=>e.type==='item');
 return {questId:id,name:nameOf('quests',id),status:progress?(progress.complete?'turnin':'active'):'available',reason:!available?lockedReason(s,q):itemStarter?'由任务物品触发，请先取得并使用起始物品':!navigation?'暂无可导航的任务人物':'',navigation:available?navigation:null};
}
export function dungeonQuestJournal(s){
 const plans=new Map();
 return Object.fromEntries(dungeonJournal.filter(d=>d.playable).map(d=>[d.id,dungeonQuestIds(d.id).flatMap(id=>{
  if(!plans.has(id))plans.set(id,dungeonQuestPlan(s,id));
  const plan=plans.get(id);if(!plan)return [];
  return [{...plan,id,name:nameOf('quests',id),targetName:plan.name||nameOf('quests',plan.questId),level:quests[id].QuestLevel,prerequisite:plan.questId!==id}];
 }).sort((a,b)=>Number(a.status==='completed')-Number(b.status==='completed')||a.level-b.level||a.id-b.id)]));
}
