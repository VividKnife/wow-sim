import {talents,spells,classTalentTrees,classAbilities,icon,nameOf} from './catalog.js';
import {grantTalentRank,resetTalentGrants,talentGrantIds} from './talent-acquisition.js';
import {supportedTalentNames} from './class-support.js';
import {strategySpellIds,validateRules,currentStrategyRules} from './combat-strategy.js';
import {pvpPresets} from './pvp-presets.js';

const copy=value=>structuredClone(value);
const profileActor=c=>({classId:c.classId,level:c.level,raceId:c.raceId,learned:copy(c.learned||[]),dormantTalentSpells:copy(c.dormantTalentSpells||[]),talents:copy(c.talents||{}),equipment:{},bag:[]});
const roles=['melee','ranged','healer'];
export const pvpTalentBudget=c=>Math.max(0,Math.min(60,c.level)-9);
export function validatePvpTalents(c,allocation){
 if(!allocation||typeof allocation!=='object'||Array.isArray(allocation))throw new Error('PvP 天赋配置无效');
 let total=0;
 for(const [id,rank]of Object.entries(allocation)){
  const t=talents[id];
  if(!t||t.classId!==c.classId||!supportedTalentNames.has(t.name)||!Number.isInteger(rank)||rank<1||rank>t.maxRank)throw new Error('PvP 天赋等级或职业无效');
  total+=rank;
  const lower=Object.entries(allocation).reduce((sum,[other,n])=>sum+(talents[other]?.tree===t.tree&&talents[other].row<t.row?n:0),0);
  if(lower<t.requiredTreePoints||(t.prerequisites||[]).some(p=>(allocation[p.talentId]||0)<p.requiredRank))throw new Error('PvP 天赋不满足层级或前置要求');
 }
 if(total>pvpTalentBudget(c))throw new Error('PvP 天赋点超过当前等级上限');
 return copy(allocation);
}
export function applyPvpTalents(c,allocation){
 validatePvpTalents(c,allocation);
 // Reset talent grants on the isolated build, without unequipping adventuring gear.
 const equipment=c.equipment,bag=c.bag;c.equipment={};c.bag=[];resetTalentGrants(c);c.equipment=equipment;c.bag=bag;
 for(const [id,rank]of Object.entries(allocation))grantTalentRank(c,talents[id],rank);
 // Talent spell ranks follow the arena level; ordinary trainer skills are not granted.
 for(const a of classAbilities[c.classId]||[])if(a.requiredTalentSpellId&&c.learned.includes(a.requiredTalentSpellId)&&a.requiredLevel<=c.level&&!c.learned.includes(a.spellId))c.learned.push(a.spellId);
}
function presetTalents(c,preset){
 const result={};let left=pvpTalentBudget(c);
 for(const [id,points]of preset.talents){
  for(let n=0;n<points&&left>0;n++){result[id]=(result[id]||0)+1;left--;}
 }
 return validatePvpTalents(c,result);
}
function rulesFromNames(c,rows){
 const available=new Map(strategySpellIds(c).map(id=>[spells[id].SpellName,id]));
 return rows.filter(r=>available.has(r.name)).map(({name,...r})=>({...r,spell:available.get(name)}));
}
export function recommendedPvpProfile(c,id){
 const preset=pvpPresets.find(p=>p.classId===c.classId&&(!id||p.id===id));
 if(!preset)throw new Error('该职业没有此 PvP 推荐方案');
 const allocation=presetTalents(c,preset),actor=profileActor(c);applyPvpTalents(actor,allocation);
 return{name:preset.name,role:preset.role,talents:allocation,rules:rulesFromNames(actor,preset.rules)};
}
export function effectivePvpProfile(c){
 if(!c.pvpProfile)return recommendedPvpProfile(c);
 const profile=copy(c.pvpProfile),actor=profileActor(c);applyPvpTalents(actor,profile.talents);
 profile.rules=currentStrategyRules(actor,profile.rules);return profile;
}
export function applyPvpProfile(c,profile=effectivePvpProfile(c)){
 applyPvpTalents(c,profile.talents);c.rules=copy(profile.rules);
 c.strategyPolicy={role:profile.role,protectCC:true,waitForTank:false,pullDelaySeconds:0};
 c.pvpProfileName=profile.name;c.pvpProfileRevision=profile.revision||0;
 return c;
}
export function savePvpProfile(s,action){
 const c=[s,...s.party].find(c=>c.id===action.target&&!c.npcPlayer);
 if(!c)throw new Error('找不到可配置的队伍成员');
 if(action.revision!==(c.pvpProfile?.revision||0))throw new Error('PvP 配置已变化，请刷新后重试');
 const input=action.profile;
 if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>40||!roles.includes(input.role))throw new Error('PvP 方案名称或职责无效');
 const allocation=validatePvpTalents(c,input.talents),actor=profileActor(c);applyPvpTalents(actor,allocation);validateRules(actor,input.rules);
 c.pvpProfile={revision:(c.pvpProfile?.revision||0)+1,name:input.name.trim(),role:input.role,talents:allocation,rules:copy(input.rules)};
 return c;
}
function skillCatalog(c){
 const actor=profileActor(c),classTalents=Object.values(talents).filter(t=>t.classId===c.classId),owners=new Map();
 for(const t of classTalents)for(const id of talentGrantIds(t.ranks)){owners.set(spells[id]?.SpellName,t.id);if(!actor.learned.includes(id))actor.learned.push(id);}
 for(const a of classAbilities[c.classId]||[])if(a.requiredTalentSpellId&&a.requiredLevel<=c.level&&!actor.learned.includes(a.spellId))actor.learned.push(a.spellId);
 for(const id of c.dormantTalentSpells||[])if(!actor.learned.includes(id))actor.learned.push(id);
 return strategySpellIds(actor).map(id=>({spellId:id,name:nameOf('spells',id),nameEn:spells[id]?.SpellName,icon:icon('spells',id),known:true,talentId:owners.get(spells[id]?.SpellName)}));
}
export function pvpConfiguration(s){
 return{locked:['countdown','combat'].includes(s.arena?.phase),members:[s,...s.party].filter(c=>!c.npcPlayer).map(c=>({
  id:c.id,name:c.name,classId:c.classId,level:c.level,revision:c.pvpProfile?.revision||0,automatic:!c.pvpProfile,profile:effectivePvpProfile(c),budget:pvpTalentBudget(c),
  presets:pvpPresets.filter(p=>p.classId===c.classId).map(p=>({id:p.id,name:p.name,description:p.description,profile:recommendedPvpProfile(c,p.id)})),
  skills:skillCatalog(c),trees:classTalentTrees.filter(t=>t.classId===c.classId).map(tree=>({id:tree.id,name:tree.name,talents:Object.values(talents).filter(t=>t.tree===tree.id).map(t=>({id:t.id,name:t.nameZhCN||t.name,row:t.row,col:t.col,maxRank:t.maxRank,requiredTreePoints:t.requiredTreePoints,prerequisites:t.prerequisites||[],supported:supportedTalentNames.has(t.name),icon:icon('talents',t.id),descriptions:(t.rankEffects||[]).map(r=>r.descriptionZhCN||r.descriptionEn)}))}))
 }))};
}
