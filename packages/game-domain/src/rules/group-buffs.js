import {knownRank,spellInfo} from './character.js';
import {spells} from './catalog.js';
import {usableCount,consume,marketPrice} from './inventory.js';

export const groupBuffRoots={
 'Arcane Intellect':23028,'Power Word: Fortitude':21562,'Divine Spirit':27681,'Shadow Protection':27683,'Mark of the Wild':21849,
 'Blessing of Kings':25898,'Blessing of Might':25782,'Blessing of Wisdom':25894,'Blessing of Salvation':25895,'Blessing of Sanctuary':25899,'Blessing of Light':25890,
};
const families={'Arcane Brilliance':'Arcane Intellect','Prayer of Fortitude':'Power Word: Fortitude','Prayer of Spirit':'Divine Spirit','Prayer of Shadow Protection':'Shadow Protection','Gift of the Wild':'Mark of the Wild'};
export const buffFamily=name=>families[name]||name?.replace(/^Greater Blessing/,'Blessing');
export const buffSquad=(s,c)=>Math.floor([s,...s.party].findIndex(a=>a.id===(c.ownerId||c.id))/5);
export function groupBuffTargets(s,target,sp,members=[s,...s.party]){
 return members.filter(a=>a.hp>0&&(sp.SpellName.startsWith('Greater Blessing')?a.classId===target.classId:buffSquad(s,a)===buffSquad(s,target)));
}
function reagentPlan(c,sp){
 const bag={bag:c.bag||[]};return Array.from({length:8},(_,i)=>i+1).filter(i=>sp['Reagent'+i]>0&&sp['ReagentCount'+i]>0).map(i=>{
  const id=sp['Reagent'+i],count=sp['ReagentCount'+i],owned=Math.min(count,usableCount(bag,id));
  return {id,count,owned,cost:(count-owned)*(marketPrice(id)?.buy??Infinity)};
 });
}
export function buffReagents(c,sp,spend=false){
 const rows=reagentPlan(c,sp),cost=rows.reduce((n,r)=>n+r.cost,0);
 if(rows.some(r=>r.owned<r.count)&&(!c.npcPlayer||c.goldNpc||!Number.isFinite(cost)||!(c.money>=cost)))return false;
 if(spend){for(const r of rows)if(r.owned)consume(c,r.id,r.owned);c.money=(c.money||0)-cost;if(c.goldProfile)c.goldProfile.consumableSpent+=cost;}
 return true;
}
// Compress only when one caster's assignment agrees for the entire real scope.
// Mixed-role paladins/druids may deliberately retain different single blessings.
export function groupBuffRequests(s,requests){
 const result=[],used=new Set();
 for(const r of requests){
  if(used.has(r))continue;
  const id=knownRank(r.c,groupBuffRoots[r.sp.SpellName]),sp=id&&spellInfo(r.c,id);
  const targets=sp&&groupBuffTargets(s,r.target,sp);
  const rows=targets?.map(t=>requests.find(x=>x.c===r.c&&x.target===t&&x.sp.SpellName===r.sp.SpellName));
  if(sp&&sp.durationMs>=r.sp.durationMs&&buffReagents(r.c,sp)&&rows.every(Boolean)&&rows.every(x=>!used.has(x))){
   rows.forEach(x=>used.add(x));result.push({...r,sp,targets,fallback:rows.map(x=>({target:x.target.id,spell:x.sp.Id}))});
  }else{used.add(r);result.push({...r,targets:[r.target]});}
 }
 return result;
}
