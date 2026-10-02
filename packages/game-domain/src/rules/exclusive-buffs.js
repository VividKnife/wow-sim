import {spells} from './catalog.js';

const groups=[
 ['aspect','Aspect of the Hawk','Aspect of the Monkey','Aspect of the Cheetah','Aspect of the Pack','Aspect of the Wild','Aspect of the Beast'],
 ['seal','Seal of Righteousness','Seal of the Crusader','Seal of Command','Seal of Justice','Seal of Light','Seal of Wisdom'],
 ['paladinAura','Devotion Aura','Retribution Aura','Concentration Aura','Sanctity Aura','Shadow Resistance Aura','Frost Resistance Aura','Fire Resistance Aura'],
 ['mageArmor','Frost Armor','Ice Armor','Mage Armor'],
 ['demonArmor','Demon Skin','Demon Armor'],
 ['magicModifier','Dampen Magic','Amplify Magic'],
 ['form','Bear Form','Dire Bear Form','Cat Form','Travel Form','Aquatic Form','Moonkin Form','Shadowform','Ghost Wolf'],
 ['stance','Battle Stance','Defensive Stance','Berserker Stance'],
];
const families=new Map(groups.flatMap(([group,...names])=>names.map(name=>[name,group])));
export const exclusiveBuffGroup=sp=>(/^(Greater )?Blessing of /.test(sp?.SpellName||'')?'blessing':families.get(sp?.SpellName));
const groupOf=a=>exclusiveBuffGroup(spells[a?.spell??a?.spellId]);

// Remove every representation of a holder: stats, aura slots and scripted procs.
export function clearExclusiveBuffs(unit,group,predicate=()=>true){
 const remove=a=>groupOf(a)===group&&predicate(a);
 for(const key of ['classBuffs','auras','periodicClass','hots'])if(unit[key])unit[key]=unit[key].filter(a=>!remove(a));
 for(const key of ['reactiveClass','seal','sacrifice'])if(unit[key]&&remove(unit[key]))unit[key]=null;
 for(const [key,buff]of Object.entries(unit.buffs||{}))if(remove(buff))delete unit.buffs[key];
}
export function replaceExclusiveBuff(s,c,target,sp,actors=[]){
 const group=exclusiveBuffGroup(sp);if(!group)return;
 if(group==='blessing'){replaceBlessing(c,target,sp);return;}
 if(group==='aspect'||group==='paladinAura'){
  // A source can project only one aura/aspect, including to out-of-range allies.
  for(const unit of new Set([s,...(s.party||[]),...actors,c,target].filter(Boolean)))
   clearExclusiveBuffs(unit,group,a=>a.caster===c.id&&spells[a.spell??a.spellId]?.SpellName!==sp.SpellName);
 }else clearExclusiveBuffs(target,group,a=>(a.spell??a.spellId)!==sp.Id);
}

export function replaceBlessing(c,target,sp){
 if(exclusiveBuffGroup(sp)==='blessing')clearExclusiveBuffs(target,'blessing',a=>a.caster===c.id&&(a.spell??a.spellId)!==sp.Id);
}
