import {table,spellChain,lookup,spells} from './catalog.js';

let bonuses;
export function spellBonus(sp){
 bonuses??=new Map(table('spell_bonus_data').map(row=>[row.entry,row]));
 return bonuses.get(sp.Id)||bonuses.get(spellChain[sp.Id]?.first_spell);
}
// Coefficients use the unmodified spell, never a talent/haste-shortened cast.
// Explicit source coefficients are per effect tick, including a valid zero.
export function spellCoefficient(sp,{periodic=false,effect=1}={}){
 const row=spellBonus(sp),explicit=periodic?row?.dot_bonus:row?.direct_bonus;
 if(explicit!=null&&explicit>=0)return explicit;
 const raw=spells[sp.Id]||sp,cast=lookup.SpellCastTimes[raw.CastingTimeIndex]?.baseMs||0;
 const duration=Math.max(0,lookup.SpellDuration[raw.DurationIndex]?.baseMs||sp.durationMs||0);
 const interval=raw['EffectAmplitude'+effect]||3000,ticks=Math.max(1,Math.floor(duration/interval));
 const channel=!!raw.ChannelInterruptFlags&&duration>0;
 const area=[1,2,3].some(n=>[8,15,16,20,22,24,28,30,31,33,34,37,53,54].includes(raw['EffectImplicitTargetA'+n])||[8,15,16,20,22,24,28,30,31,33,34,37,53,54].includes(raw['EffectImplicitTargetB'+n]));
 const base=channel?Math.min(7000,duration)/3500/ticks:periodic?duration/15000/ticks:Math.max(1500,Math.min(7000,cast))/3500;
 return base*(area?1/3:1);
}
export function spellPowerBonus(derived,sp,options={}){
 const penalty=Math.max(0,1-Math.max(0,20-(sp.SpellLevel||20))*.0375);
 const power=options.healing?derived.healing||0:(derived.spellPower||0)+(derived['schoolPower'+(1<<sp.School)]||0);
 return power*spellCoefficient(sp,options)*penalty;
}
