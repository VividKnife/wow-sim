import {spells,spellChain} from './catalog.js';

// Spell recovery, category recovery, global recovery and cast occupancy are
// independent clocks. All values are simulation timestamps, never wall time.
const key=sp=>spellChain[sp.Id]?.first_spell||sp.Id;
export function cooldownUntil(c,sp){
 return sp?Math.max(c.cooldowns?.[key(sp)]||0,c.categoryCooldowns?.[sp.Category]?.until||0):0;
}
export function gcdUntil(c,sp){return sp?.StartRecoveryCategory&&sp.StartRecoveryTime>0?c.globalCooldowns?.[sp.StartRecoveryCategory]||0:0;}
export function spellReady(c,sp,clock,{ignoreGcd=false}={}){
 return !!sp&&cooldownUntil(c,sp)<=clock&&(ignoreGcd||gcdUntil(c,sp)<=clock);
}
export function globalCooldownRemaining(c,clock){return Math.max(0,(c.globalCooldowns?.[133]||0)-clock);}
export function resetSpellCooldowns(c,predicate){
 for(const id of Object.keys(c.cooldowns||{}))if(predicate(spells[id]))delete c.cooldowns[id];
 for(const [category,recovery]of Object.entries(c.categoryCooldowns||{}))if(predicate(spells[recovery.spellId]))delete c.categoryCooldowns[category];
}
function applyRecovery(c,timing,clock){
 if(timing.spellMs>0){c.cooldowns??={};c.cooldowns[timing.key]=Math.max(c.cooldowns[timing.key]||0,clock+timing.spellMs);}
 if(timing.category&&timing.categoryMs>0){c.categoryCooldowns??={};const old=c.categoryCooldowns[timing.category];if(!old||old.until<clock+timing.categoryMs)c.categoryCooldowns[timing.category]={spellId:timing.spellId,until:clock+timing.categoryMs};}
}
export function finishSpellTiming(c,timing,clock){
 if(!timing||timing.committed)return true;
 if((c[timing.pool]||0)<timing.cost||timing.pool==='hp'&&c.hp<=timing.cost)return false;
 c[timing.pool]=(c[timing.pool]||0)-timing.cost;
 if(timing.pool==='mana'&&timing.cost>0)c.lastManaUse=clock;
 applyRecovery(c,timing,clock);timing.committed=true;return true;
}
export function beginSpellTiming(c,sp,clock,{channel=false,cost=sp.mana||0,pool=sp.PowerType===1?'rage':sp.PowerType===2?'focus':sp.PowerType===3?'energy':[-2,4294967294].includes(sp.PowerType)?'hp':'mana'}={}){
 const timing={spellId:sp.Id,key:key(sp),spellMs:sp.spellCooldownMs??sp.RecoveryTime??0,category:sp.Category||0,categoryMs:sp.categoryCooldownMs??sp.CategoryRecoveryTime??0,pool,cost,committed:false};
 if(sp.StartRecoveryCategory&&sp.StartRecoveryTime>0){c.globalCooldowns??={};c.globalCooldowns[sp.StartRecoveryCategory]=Math.max(c.globalCooldowns[sp.StartRecoveryCategory]||0,clock+sp.StartRecoveryTime);}
 // nextAction only represents casting/AI occupancy. It must not gate off-GCD spells.
 c.nextAction=clock+(channel?sp.durationMs||0:sp.castMs||0);
 if(channel||!sp.castMs)finishSpellTiming(c,timing,clock);
 return timing;
}
