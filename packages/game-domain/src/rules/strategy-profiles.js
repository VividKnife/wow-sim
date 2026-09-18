import {MAX_STRATEGY_PROFILES,MAX_STRATEGY_PROFILE_NAME} from '../../../sim-core/src/strategy-config.js';
import {validateRules,currentStrategyRules,defaultPolicy} from './combat-strategy.js';
import {combatRoles} from './combat-roles.js';
import {validateAutoBuffs,defaultAutoBuffs} from './auto-buffs.js';
import {validatePotions,defaultPotions} from './consumables.js';

const copy=value=>structuredClone(value);
const nameKey=name=>name.toLocaleLowerCase('en-US');
function profileName(value){
 if(typeof value!=='string'||!value.trim()||value.trim().length>MAX_STRATEGY_PROFILE_NAME)throw new Error(`方案名称需要 1—${MAX_STRATEGY_PROFILE_NAME} 字`);
 return value.trim();
}
function strategyConfig(c,input){
 validateRules(c,input.rules);
 const policy=input.policy===undefined?{...defaultPolicy,...c.strategyPolicy}:input.policy;
 if(!policy||typeof policy.protectCC!=='boolean'||typeof policy.waitForTank!=='boolean'||policy.role!==undefined&&!combatRoles.includes(policy.role)||policy.pullDelaySeconds!==undefined&&(!Number.isInteger(policy.pullDelaySeconds)||policy.pullDelaySeconds<0||policy.pullDelaySeconds>10))throw new Error('战斗策略设置无效');
 const buffs=validateAutoBuffs(input.autoBuffs===undefined?{...defaultAutoBuffs,...c.autoBuffs}:input.autoBuffs);
 return {
  rules:input.rules.map(r=>({spell:r.spell,condition:r.condition,value:r.value,enabled:r.enabled,...(r.and?{and:r.and.map(clause=>({condition:clause.condition,value:clause.value}))}:{})})),
  policy:{role:policy.role||'auto',protectCC:policy.protectCC,waitForTank:policy.waitForTank,pullDelaySeconds:policy.pullDelaySeconds??3},
  autoBuffs:{enabled:buffs.enabled,armor:buffs.armor,int:buffs.int,sta:buffs.sta,targets:buffs.targets,refreshSeconds:buffs.refreshSeconds},
  potions:validatePotions(input.potions===undefined?{...defaultPotions,...c.potions}:input.potions),
 };
}
function applyConfig(c,config){c.rules=copy(config.rules);c.strategyPolicy=copy(config.policy);c.autoBuffs=copy(config.autoBuffs);c.potions=copy(config.potions);}

// Match current learned ranks when loading, without changing the stored template.
export function strategyProfiles(c){return(c.strategyProfiles||[]).map(profile=>{
 const rules=currentStrategyRules(c,profile.rules);
 return {...copy(profile),rules,unavailableRules:profile.rules.length-rules.length,totalRules:profile.rules.length};
});}

export function strategyAction(c,action){
 const operation=action.operation??'apply';
 if(operation==='apply'){applyConfig(c,strategyConfig(c,action));return;}
 if(!['saveProfile','loadProfile','deleteProfile'].includes(operation))throw new Error('未知策略操作');
 const name=profileName(action.name),profiles=c.strategyProfiles||[],index=profiles.findIndex(p=>nameKey(p.name)===nameKey(name));
 if(operation==='saveProfile'){
  if(index>=0&&action.overwrite!==true)throw new Error('已有同名方案，请使用覆盖所选方案');
  if(index<0&&action.overwrite===true)throw new Error('找不到要覆盖的策略方案');
  if(index<0&&profiles.length>=MAX_STRATEGY_PROFILES)throw new Error(`最多保存 ${MAX_STRATEGY_PROFILES} 套策略方案`);
  const profile={name,...strategyConfig(c,action)},next=[...profiles];
  if(index<0)next.push(profile);else next[index]=profile;
  c.strategyProfiles=next;return;
 }
 if(index<0)throw new Error('找不到已保存的策略方案');
 if(operation==='deleteProfile'){c.strategyProfiles=profiles.filter((_,i)=>i!==index);return;}
 const profile=profiles[index];
 applyConfig(c,strategyConfig(c,{...profile,rules:currentStrategyRules(c,profile.rules)}));
}
