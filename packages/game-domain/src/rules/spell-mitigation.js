import {creatures,spells} from './catalog.js';
import {stats,rng} from './character.js';
import {activeAuras} from '../../../sim-core/src/combat-auras.js';
import {binarySpell,pureDamageOverTime,resistanceCoefficient,partialResistFraction} from '../../../sim-core/src/spell-resistance.js';

export function spellResistance(s,c,target,sp,{school=sp?.School||0,binary=binarySpell(sp),periodic=false}={}){
 const st=c.classId?stats(c):c,playerTarget=!!target.classId||!!target.petUnit;
 const template=creatures[target.entry],field=['','Holy','Fire','Nature','Frost','Shadow','Arcane'][school];
 let resistance=playerTarget?stats(target).resistances?.[school]||0:target.resistances?.[school]??template?.['Resistance'+field]??0;
 if(!playerTarget)for(const aura of activeAuras(target,s.clock))if(aura.misc&(1<<school)){
  if([22,83,143].includes(aura.type))resistance+=aura.amount;
  if([101,142].includes(aura.type))resistance*=1+aura.amount/100;
 }
 const penetration=st.spellPenetration?.[school]||0;
 return resistanceCoefficient({level:c.level||60,targetLevel:target.level||60,resistance,penetration,school,binary,pureDot:periodic&&pureDamageOverTime(sp),playerTarget});
}
export function mitigateSpellDamage(s,c,target,amount,detail){
 const sp=spells[detail.spellId],school=detail.school??sp?.School??0;
 if(school===0||sp?.DmgClass===0||binarySpell(sp))return amount;
 const coefficient=spellResistance(s,c,target,sp,{school,binary:false,periodic:!!detail.periodic});
 if(!coefficient)return amount;
 const fraction=partialResistFraction(coefficient,rng(s));
 detail.resisted=Math.round(amount*fraction);detail.resistFraction=fraction;
 return amount*(1-fraction);
}
