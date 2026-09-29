import {combatRole} from './combat-roles.js';
import {items} from './catalog.js';

export const raidCompositionPresets=Object.freeze({
 steady:{name:'稳健开荒',size:40,tanks:4,healers:10},
 balanced:{name:'均衡阵容',size:40,tanks:3,healers:8},
 assault:{name:'速攻挑战',size:40,tanks:2,healers:6},
});
export function validateRaidComposition(value){
 if(!value||!['size','tanks','healers'].every(k=>Number.isSafeInteger(value[k]))||value.size<1||value.size>40||value.tanks<0||value.healers<0||value.tanks+value.healers>value.size)throw new Error('团队人数须为1—40，坦克与治疗须为非负整数，合计不能超过团队人数。');
 return {size:value.size,tanks:value.tanks,healers:value.healers};
}
const group=c=>['tank','healer'].includes(combatRole(c))?combatRole(c):'damage';
export function recommendRaidMembers(s,applicants,composition,priority='balanced'){
 const {size,tanks,healers}=validateRaidComposition(composition),quotas={tank:tanks,healer:healers,damage:size-tanks-healers};
 if(--quotas[group(s)]<0)throw new Error('阵容数量必须包含团长当前职责。');
 const score=c=>({expert:3,regular:2,novice:1}[c.goldProfile.skill])*(priority==='progress'?200:100)+(c.goldProfile.friend?(priority==='friends'?350:30):0)+Math.min(20,c.goldProfile.runs)+(priority==='buyers'?Math.min(300,c.money/10000):0)+Object.values(c.equipment).reduce((n,e)=>n+(items[e.id]?.ItemLevel||0),0)/20;
 const pool=[...applicants].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)),picked=[];
 const pick=c=>{picked.push(c);quotas[group(c)]--;};
 // Cover utility only within the requested role quotas; never silently add healers/tanks.
 for(const classId of [5,8,3])if(s.classId!==classId){const c=pool.find(c=>c.classId===classId&&quotas[group(c)]>0);if(c)pick(c);}
 for(const role of ['tank','healer','damage']){
  const available=pool.filter(c=>group(c)===role&&!picked.includes(c));
  if(available.length<quotas[role])throw new Error(`申请者中的${{tank:'坦克',healer:'治疗',damage:'输出'}[role]}不足，请调整人数或手动录取。`);
  for(const c of available.slice(0,quotas[role]))pick(c);
 }
 return picked;
}
export function raidCompositionWarnings(actors){
 const counts={tank:0,healer:0,damage:0};for(const c of actors)counts[group(c)]++;
 return [actors.length<40&&`当前${actors.length}/40人：首领血量、伤害与机制不随人数降低。`,counts.tank<2&&'坦克不足两名：多目标与换坦风险较高。',counts.healer<6&&'治疗少于六名：注意团队承伤与续航。',!counts.damage&&'没有输出职责：可能无法在可承受的时间内击败首领。'].filter(Boolean);
}
