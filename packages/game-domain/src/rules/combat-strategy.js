import {classResource} from '../../../sim-core/src/class-combat.js';
import {abilities,spells,classAbilities} from './catalog.js';
import {stats} from './character.js';
import {classSpells} from './party.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {areaTargets} from './combat-space.js';
import {combatMembers} from './combat-members.js';
import {supportedSpellNames,defaultClassRules} from './class-support.js';

export const defaultPolicy={protectCC:true,waitForTank:false};
export const strategyConditions=['always','targetCasting','enemyNear','healthBelow','manaAbove','manaBelow','targetHealthBelow','enemyCountAtLeast'];
export const areaSpell=sp=>['Frost Nova','Arcane Explosion','Flamestrike','Blizzard','Cleave'].includes(sp.SpellName);
export const protectedTarget=(e,clock)=>!!e&&(e.polyUntil>clock||(e.auras||[]).some(a=>a.until>clock&&([5,7].includes(a.type)||a.type===12&&((spells[a.spell]?.AuraInterruptFlags||0)&2))));
export function strategySpellIds(c){return [...new Set([...(classAbilities[c.classId]||[]).map(a=>a.spellId),...(classSpells[c.classId]||[]),...(c.learned||[])])].filter(id=>supportedSpellNames.has(spells[id]?.SpellName));}
export function validateRules(c,rules){
 if(!Array.isArray(rules)||rules.length<1||rules.length>12)throw new Error('需要 1—12 条施法规则');
 const allowed=strategySpellIds(c);
 for(const r of rules){
  if(!r||!Number.isInteger(r.spell)||!spells[r.spell]||!allowed.includes(r.spell))throw new Error('该成员不能使用这个技能');
  if(!strategyConditions.includes(r.condition)||typeof r.enabled!=='boolean'||!Number.isFinite(r.value)||r.value<0||r.value>100||r.condition==='enemyCountAtLeast'&&(!Number.isInteger(r.value)||r.value<1))throw new Error('施法条件或阈值无效');
 }
}
export function ruleMatches(s,c,e,rule,sp){const st=stats(c);switch(rule.condition){
 case 'always':return true;case 'targetCasting':return !!e.cast;case 'enemyNear':return distance(c,e)<=rule.value;
 case 'healthBelow':return c.hp/st.maxHp*100<rule.value;case 'manaAbove':{const r=classResource(c,st);return r?.max>0&&r.value/r.max*100>=rule.value;}case 'manaBelow':{const r=classResource(c,st);return r?.max>0&&r.value/r.max*100<rule.value;}case 'targetHealthBelow':return e.hp/e.maxHp*100<rule.value;
 case 'enemyCountAtLeast':return areaTargets(s,c,e,sp,undefined,{uncapped:true}).filter(x=>c.strategyPolicy?.protectCC===false||!protectedTarget(x,s.clock)).length>=rule.value;
 default:return false;
}}
export function strategyAllows(s,c,e,sp,rule,center){
 const policy={...defaultPolicy,...c.strategyPolicy};
 if(rule&&!ruleMatches(s,c,e,rule,sp))return false;
 const targets=areaSpell(sp)?areaTargets(s,c,e,sp,center,{uncapped:true}):e?[e]:[];
 if(policy.protectCC&&targets.some(x=>protectedTarget(x,s.clock)))return false;
 if(policy.waitForTank&&c.classId!==1&&sp.SpellName!=='Polymorph'){const tank=combatMembers(s).find(a=>a.classId===1&&a.hp>0);if(tank&&targets.some(x=>x.target!==tank.id||!(x.threat?.[tank.id]>0)))return false;}
 return true;
}
export function companionRules(c){
 if(c.rules)return c.rules;
 if(c.classId===1)return [{spell:355,condition:'always',value:0,enabled:true},{spell:7386,condition:'always',value:0,enabled:true},{spell:845,condition:'enemyCountAtLeast',value:3,enabled:true},{spell:78,condition:'always',value:0,enabled:true}];
 if(c.classId===4)return [{spell:2098,condition:'always',value:0,enabled:true},{spell:1752,condition:'always',value:0,enabled:true}];
 if(c.classId===5)return [{spell:585,condition:'always',value:0,enabled:true}];
 return null;
}
