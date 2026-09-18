import {classResource} from '../../../sim-core/src/class-combat.js';
import {spells,spellChain} from './catalog.js';
import {stats} from './character.js';
import {passiveSpellNames,utilitySpellNames} from './class-utility-data.js';
import {racialPassiveNames} from './racial-effects.js';
import {combatRole} from './combat-roles.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {areaTargets,selfArea,groundArea,aliveEnemy} from './combat-space.js';
import {combatMembers} from './combat-members.js';
import {supportedSpellNames} from './class-support.js';
import {MAX_STRATEGY_RULES,MAX_STRATEGY_EXTRA_CONDITIONS} from '../../../sim-core/src/strategy-config.js';

export const defaultPolicy={protectCC:true,waitForTank:true,pullDelaySeconds:3};
export function waitingTank(s,c){
 if(c.petUnit)c=combatMembers(s).find(a=>a.id===c.ownerId)||c;
 const policy={...defaultPolicy,...c.strategyPolicy};
 if(!s.combat||!policy.waitForTank||combatRole(c)==='tank'||c.escortNpc)return null;
 return combatMembers(s).find(a=>a.id!==c.id&&!a.petUnit&&!a.totemUnit&&!a.escortNpc&&a.hp>0&&combatRole(a)==='tank')||null;
}
export function waitingForPull(s,c){
 if(!waitingTank(s,c))return false;
 const policy={...defaultPolicy,...c.strategyPolicy};
 return s.clock-(s.combat.pull?.startsAt??s.combat.startedAt)<policy.pullDelaySeconds*1000;
}
export const strategyConditions=['always','targetCasting','enemyNear','enemyFar','healthBelow','healthAbove','allyHealthBelow','manaAbove','manaBelow','targetHealthBelow','targetHealthAbove','enemyCountAtLeast','combatEnemyCountAtMost','comboAtLeast','petHealthBelow','underAttack','combatTimeBelow'];
export const areaSpell=sp=>selfArea(sp)||groundArea(sp)||['Cleave','Multi-Shot','Chain Lightning'].includes(sp.SpellName);
export const protectedTarget=(e,clock)=>!!e&&(e.polyUntil>clock||(e.auras||[]).some(a=>a.until>clock&&([5,7].includes(a.type)||a.type===12&&((spells[a.spell]?.AuraInterruptFlags||0)&2))));
// The final hostile sheep is the kill target; keep CC intact until damage lands.
export function protectCombatTarget(s,e){
 if(e?.polyUntil>s.clock){
  const remaining=(s.combat?.enemies||[]).filter(x=>aliveEnemy(x)&&!x.controlledBy);
  if(remaining.length===1&&remaining[0].id===e.id)return false;
 }
 return protectedTarget(e,s.clock);
}
const preparationSpells=new Set(['Frost Armor','Arcane Intellect','Power Word: Fortitude','Resurrection','Redemption','Ancestral Spirit']);
export function strategySpellIds(c){
 const highest=new Map();
 for(const id of c.learned||[]){
  const sp=spells[id],name=sp?.SpellName;
  if(!sp||sp.Attributes&64||passiveSpellNames.has(name)||racialPassiveNames.has(name)||utilitySpellNames.has(name)||preparationSpells.has(name)||!supportedSpellNames.has(name))continue;
  const previous=spells[highest.get(name)];
  if(!previous||sp.SpellLevel>previous.SpellLevel||sp.SpellLevel===previous.SpellLevel&&(spellChain[id]?.rank||0)>(spellChain[previous.Id]?.rank||0))highest.set(name,id);
 }
 return [...highest.values()];
}
export function currentStrategyRules(c,rules){
 const highest=new Map(strategySpellIds(c).map(id=>[spells[id].SpellName,id]));
 return (rules||[]).filter(r=>highest.has(spells[r.spell]?.SpellName)).map(r=>({...r,spell:highest.get(spells[r.spell].SpellName)}));
}
export function validateRules(c,rules){
 if(!Array.isArray(rules)||rules.length>MAX_STRATEGY_RULES)throw new Error(`最多允许 ${MAX_STRATEGY_RULES} 条施法规则`);
 const allowed=strategySpellIds(c);
 for(const r of rules){
  if(!r||!Number.isInteger(r.spell)||!spells[r.spell]||!allowed.includes(r.spell))throw new Error('该成员不能使用这个技能');
  if(typeof r.enabled!=='boolean'||r.and!==undefined&&(!Array.isArray(r.and)||r.and.length>MAX_STRATEGY_EXTRA_CONDITIONS))throw new Error('施法条件或阈值无效');
  for(const clause of [r,...(r.and||[])])if(!clause||!strategyConditions.includes(clause.condition)||!Number.isFinite(clause.value)||clause.value<0||clause.value>100||['enemyCountAtLeast','combatEnemyCountAtMost','comboAtLeast'].includes(clause.condition)&&(!Number.isInteger(clause.value)||clause.value<1||clause.condition==='comboAtLeast'&&clause.value>5))throw new Error('施法条件或阈值无效');
 }
}
export function ruleMatches(s,c,e,rule,sp){return [rule,...(rule.and||[])].every(clause=>conditionMatches(s,c,e,clause,sp));}
function conditionMatches(s,c,e,rule,sp){const st=stats(c);switch(rule.condition){
 case 'always':return true;case 'targetCasting':return !!e.cast;case 'enemyNear':return distance(c,e)<=rule.value;case 'enemyFar':return distance(c,e)>rule.value;
 case 'allyHealthBelow':return combatMembers(s).some(a=>a.hp>0&&a.hp/stats(a).maxHp*100<rule.value);
 case 'healthAbove':return c.hp/st.maxHp*100>=rule.value;
 case 'targetHealthAbove':return e.hp/e.maxHp*100>=rule.value;
 case 'comboAtLeast':return c.comboTarget===e.id&&(c.combo||0)>=rule.value;
 case 'petHealthBelow':return !!c.pet&&c.pet.hp>0&&c.pet.hp/c.pet.maxHp*100<rule.value;
 case 'underAttack':return (s.combat?.enemies||[]).some(x=>aliveEnemy(x)&&!x.controlledBy&&!protectedTarget(x,s.clock)&&x.target===c.id);
 case 'combatTimeBelow':return !!s.combat&&s.clock-(s.combat.pull?.startsAt??s.combat.startedAt)<rule.value*1000;
 // Include crowd-controlled enemies so keeping one sheep does not turn a large pack into a small pull.
 case 'combatEnemyCountAtMost':return (s.combat?.enemies||[]).filter(x=>aliveEnemy(x)&&!x.controlledBy).length<=rule.value;
 case 'healthBelow':return c.hp/st.maxHp*100<rule.value;case 'manaAbove':{const r=classResource(c,st);return r?.max>0&&r.value/r.max*100>=rule.value;}case 'manaBelow':{const r=classResource(c,st);return r?.max>0&&r.value/r.max*100<rule.value;}case 'targetHealthBelow':return e.hp/e.maxHp*100<rule.value;
 case 'enemyCountAtLeast':return areaTargets(s,c,e,sp,undefined,{uncapped:true}).filter(x=>c.strategyPolicy?.protectCC===false||!protectCombatTarget(s,x)).length>=rule.value;
 default:return false;
}}
export function strategyAllows(s,c,e,sp,rule,center){
 const policy={...defaultPolicy,...c.strategyPolicy};
 if(rule&&!ruleMatches(s,c,e,rule,sp))return false;
 const targets=areaSpell(sp)?areaTargets(s,c,e,sp,center,{uncapped:true}):e?[e]:[];
 if(policy.protectCC&&targets.some(x=>protectCombatTarget(s,x)))return false;
 if(sp.SpellName!=='Polymorph'){
  const tank=waitingTank(s,c);
  if(tank&&(waitingForPull(s,c)||targets.some(x=>x.target!==tank.id||!(x.threat?.[tank.id]>0))))return false;
 }
 return true;
}
export function companionRules(c){
 if(c.rules)return c.rules;
 if(c.classId===1)return [{spell:355,condition:'always',value:0,enabled:true},{spell:7386,condition:'always',value:0,enabled:true},{spell:845,condition:'enemyCountAtLeast',value:3,enabled:true},{spell:78,condition:'always',value:0,enabled:true}];
 if(c.classId===4)return [{spell:2098,condition:'always',value:0,enabled:true},{spell:1752,condition:'always',value:0,enabled:true}];
 if(c.classId===5)return [{spell:585,condition:'always',value:0,enabled:true}];
 return null;
}
