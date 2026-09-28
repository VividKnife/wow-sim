import {stats,rng} from './character.js';
import {spellPowerBonus} from './spell-scaling.js';
import {spellCritBonus,talentSpellValue} from './talent-effects.js';
import {weaponCritChance} from './weapon-attacks.js';

// Resolve coefficient and critical rules once, before the world's common damage
// pipeline handles mitigation, health, threat, logging and proc notifications.
export function resolveSpellDamage(s,c,target,base,sp,applyDamage,{
 periodic=false,effect=1,coefficient=1,bonus=true,label=sp.SpellName,
}={}){
 if(!target||target.hp<=0||!applyDamage)return {dealt:0,amount:0,critical:false};
 const before=target.hp,st=stats(c),physical=sp.School===0,weapon=physical||[2,3].includes(sp.DmgClass);
 const critChance=weapon?weaponCritChance(c,target,st,{ranged:sp.DmgClass===3,spell:sp}):st.spellCrit+spellCritBonus(c,sp,target);
 const critical=!periodic&&rng(s)<critChance;
 let amount=base;
 if(!physical&&bonus)amount+=spellPowerBonus(st,sp,{periodic,effect})*coefficient;
 if(critical)amount*=1+(weapon?1:.5)*talentSpellValue(c,sp,15,100)/100;
 applyDamage(s,c,target,amount,label,1,{spellId:sp.Id,school:sp.School,periodic,critical,effectIndex:effect,triggeredBy:sp.triggeredBy??null});
 return {dealt:before-target.hp,amount,critical};
}
