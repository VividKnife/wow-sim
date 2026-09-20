import {creatures,creatureLoot,referenceLoot} from './catalog.js';
import {questProgress,meetsCondition} from './quests.js';

function dropsItem(s,rows,item,depth=0){
 if(depth>8)return false;
 return (rows||[]).some(row=>meetsCondition(s,row.condition_id)&&(row.mincountOrRef<0?dropsItem(s,referenceLoot[-row.mincountOrRef],item,depth+1):row.item===item));
}
export function dungeonQuestObjectives(s){
 return Object.keys(s.quests).flatMap(id=>{
  const q=questProgress(s,id);
  return (q?.objectives||[]).filter(o=>o.count<o.required&&['item','kill'].includes(o.kind)).map(o=>({...o,questId:q.id,questName:q.name}));
 });
}
export function dungeonQuestTargets(s,entries,objectives){
 return objectives.flatMap(o=>{
  const targets=entries.filter(entry=>{
   const c=creatures[entry];
   return o.kind==='kill'?[entry,c?.KillCredit1,c?.KillCredit2].includes(o.id):dropsItem(s,creatureLoot[c?.LootId],o.id);
  });
  return targets.length?[{questId:o.questId,questName:o.questName,name:o.name,count:o.count,required:o.required,entries:targets}]:[];
 });
}
