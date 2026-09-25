import {table,nodes} from './catalog.js';
import {countItem} from './character.js';
import {professionSkillIds} from './profession-data.js';
export const professionIds=Object.fromEntries(Object.entries(professionSkillIds).map(([name,id])=>[id,name]));
const conditions=new Map(table('conditions').map(c=>[c.condition_entry,c]));
export const supportedConditionTypes=new Set([-3,-2,-1,0,1,2,3,4,6,7,8,9,12,14,15,17,18,19,22,23,26,29,35,43]);
const areaNodes={99:['rebel-camp'],1519:['stormwind','keep','cathedral','oldtown','dwarven','magetower','park','bluerecluse'],1497:['undercity','undercity-district-1','undercity-district-2'],1537:['ironforge','ironforge-district-1','ironforge-district-2'],1637:['orgrimmar','orgrimmar-district-1','orgrimmar-district-2'],1638:['thunderbluff','thunderbluff-district-1','thunderbluff-district-2'],1657:['darnassus','darnassus-district-1','darnassus-district-2']};
// Semantics: CMaNGOS Globals/Conditions.h. Unknown context stays unknown through
// NOT/OR and flags; it must never accidentally authorize a quest or loot row.
export function evaluateCondition(s,id,context={},seen=new Set()){
 if(!id)return true;
 if(seen.has(id)||seen.size>=32)return null;
 const c=conditions.get(id);if(!c||c.flags&2)return null;
 const next=new Set(seen);next.add(id);
 const child=value=>evaluateCondition(s,value,context,next);
 let result=null;
 if(c.type<0){const a=child(c.value1),b=c.type===-3?true:child(c.value2);if(a!==null&&b!==null)result=c.type===-3?!a:c.type===-2?a||b:a&&b;}
 else switch(c.type){
  case 0:result=true;break;
  case 1:result=[...(s.auras||[]),...(s.classBuffs||[]),...Object.values(s.buffs||{})].some(a=>(a.spell===c.value1||a.spellId===c.value1)&&(a.until==null||a.until>s.clock));break;
  case 2:result=countItem(s,c.value1)>=c.value2;break;
  case 3:result=Object.values(s.equipment||{}).some(i=>i.id===c.value1);break;
  case 4:{const places=areaNodes[c.value1];if(places)result=places.includes(s.location)!==!!c.value2;else if(nodes[s.location]?.areaId)result=(nodes[s.location].areaId===c.value1)!==!!c.value2;break;}
  case 6:result=(s.teamId??469)===c.value1;break;
  case 7:result=(s.professions?.[professionIds[c.value1]]?.skill||0)>=c.value2;break;
  case 8:result=!!s.completed[c.value1];break;
  case 9:result=!!s.quests[c.value1]&&(c.value2===0||context.complete?.(c.value1)===(c.value2===2));break;
  case 12:case 26:result=(s.activeEvents||[]).includes(c.value1);break;
  case 14:result=(!c.value1||!!(c.value1&(1<<(s.raceId-1))))&&(!c.value2||!!(c.value2&(1<<(s.classId-1))));break;
  case 15:result=c.value2===1?s.level>=c.value1:c.value2===2?s.level<=c.value1:s.level===c.value1;break;
  case 17:result=(s.learned||[]).includes(c.value1)!==!!c.value2;break;
  case 18:if(id===733&&['stratholme-live','stratholme-undead'].includes(s.location)){const runs=[s.dungeon,...Object.values(s.dungeonSaves||{})].filter(Boolean);result=runs.some(d=>d.defeatedBosses?.[10440]);}else if(id>=734&&id<=739&&s.dungeon?.id==='dire-maul-north')result=s.dungeon.tribute===c.value1;break;
  case 19:result=context.available?.(c.value1,next)??null;break;
  case 22:result=!s.completed[c.value1]&&!s.quests[c.value1];break;
  case 23:result=countItem(s,c.value1)+(s.bank||[]).filter(i=>i.id===c.value1).reduce((n,i)=>n+i.count,0)>=c.value2;break;
  case 29:{const p=s.professions?.[professionIds[c.value1]];result=c.value2===1?!p:!!p&&p.skill<c.value2;break;}
  case 35:result=(s.gender==='female'?1:0)===c.value1;break;
  case 43:result=!!s.combat!==!!c.value1;break;
 }
 return result===null?null:c.flags&1?!result:result;
}
