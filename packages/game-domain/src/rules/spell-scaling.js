import {table,spellChain,lookup,spells} from './catalog.js';
import coefficients from '../../../game-data/data/classic-spell-coefficients.json' with {type:'json'};

let bonuses;
const rankCoefficients={...coefficients.spells};
// Arcane Missiles deals damage through a separate spell ID for each missile.
// Those effects must inherit the channel rank's coefficient, not its cast time.
for(const [id,row] of Object.entries(coefficients.spells))if(row.source==='mage/arcane_missiles'){
 const trigger=spells[id]?.EffectTriggerSpell1;if(trigger)rankCoefficients[trigger]=row;
}
// This ClassicDB uses 22048 for rank-one Searing Totem, while the reference
// simulator uses 3606 for the same totem attack rank.
rankCoefficients[22048]=rankCoefficients[3606];
export function spellBonus(sp){
 bonuses??=new Map(table('spell_bonus_data').map(row=>[row.entry,row]));
 return bonuses.get(sp.Id)||bonuses.get(spellChain[sp.Id]?.first_spell);
}
// Coefficients use the unmodified spell, never a talent/haste-shortened cast.
// Explicit source coefficients are per effect tick, including a valid zero.
export function spellCoefficient(sp,{periodic=false,effect=1}={}){
 const rank=rankCoefficients[sp.Id];
 if(rank)return periodic?rank.periodic:rank.direct;
 const row=spellBonus(sp),explicit=periodic?row?.dot_bonus:row?.direct_bonus;
 if(explicit!=null&&explicit>=0)return explicit;
 const raw=spells[sp.Id]||sp,cast=lookup.SpellCastTimes[raw.CastingTimeIndex]?.baseMs||0;
 const duration=Math.max(0,lookup.SpellDuration[raw.DurationIndex]?.baseMs||sp.durationMs||0);
 const interval=raw['EffectAmplitude'+effect]||3000,ticks=Math.max(1,Math.floor(duration/interval));
 const channel=!!raw.ChannelInterruptFlags&&duration>0;
 const area=[1,2,3].some(n=>[8,15,16,20,22,24,28,30,31,33,34,37,53,54].includes(raw['EffectImplicitTargetA'+n])||[8,15,16,20,22,24,28,30,31,33,34,37,53,54].includes(raw['EffectImplicitTargetB'+n]));
 let base=channel?Math.max(1500,Math.min(7000,duration))/3500/(periodic?ticks:1):periodic?duration/15000/ticks:Math.max(1500,Math.min(7000,cast))/3500;
 const direct=[1,2,3].some(n=>[2,8,9,10,62].includes(raw['Effect'+n]));
 const overTime=[1,2,3].some(n=>[3,8,53].includes(raw['EffectApplyAuraName'+n]));
 if(direct&&overTime&&duration>0){const dotShare=(duration/15000)/(duration/15000+Math.max(1500,Math.min(7000,cast))/3500);base*=periodic?dotShare:1-dotShare;}
 const leech=[1,2,3].some(n=>raw['Effect'+n]===9||raw['EffectApplyAuraName'+n]===53);
 const penalties=[1,2,3].reduce((sum,n)=>sum+([4,33].includes(raw['EffectApplyAuraName'+n])?1:[5,12,26].includes(raw['EffectApplyAuraName'+n])?2:0),0);
 return base*(area?.5:1)*(leech?.5:1)*Math.pow(.95,penalties);
}
export function spellPowerBonus(derived,sp,options={}){
 const penalty=rankCoefficients[sp.Id]?1:Math.max(0,1-Math.max(0,20-(sp.SpellLevel||20))*.0375);
 const power=options.healing?derived.healing||0:(derived.spellPower||0)+(derived['schoolPower'+(1<<sp.School)]||0);
 return power*spellCoefficient(sp,options)*penalty;
}
