// Classic Era reference: wowsims/classic 7779ebbf79dc7f1341e6ab939b28a3402c9a730a
// sim/core/spell_resistances.go (piecewise fit to measured resistance bins).
export function pureDamageOverTime(sp){
 if(sp?.pureDot!=null)return sp.pureDot;
 return !!sp&&!sp.ChannelInterruptFlags&&[1,2,3].some(n=>[3,53,89].includes(sp['EffectApplyAuraName'+n]))&&![1,2,3].some(n=>[2,7,9,17,31,58,121].includes(sp['Effect'+n]));
}
export function binarySpell(sp){
 if(!sp||sp.School===0)return false;
 if(sp.binary!=null)return sp.binary;
 if(pureDamageOverTime(sp))return false;
 const effects=[1,2,3].filter(n=>sp['Effect'+n]&&!([3,64,77].includes(sp['Effect'+n])||sp['EffectApplyAuraName'+n]===4));
 const direct=effects.filter(n=>[2,7,9,17,31,58,121].includes(sp['Effect'+n]));
 const nonDamage=effects.filter(n=>!direct.includes(n)&&![3,53,64,89].includes(sp['EffectApplyAuraName'+n]));
 if(!direct.length)return nonDamage.length>0;
 return direct.some(i=>nonDamage.some(j=>sp['EffectImplicitTargetA'+i]===sp['EffectImplicitTargetA'+j]&&sp['EffectImplicitTargetB'+i]===sp['EffectImplicitTargetB'+j]));
}
export function resistanceCoefficient({level,targetLevel,resistance=0,penetration=0,binary=false,pureDot=false,playerTarget=false,school}){
 if(school===0)return 0;
 const value=school===1?0:Math.max(0,resistance-penetration);
 const base=value/Math.max(1,level*5)/(pureDot?10:1);
 const levelPenalty=!binary&&!playerTarget?Math.max(0,targetLevel-level)*.02/.75:0;
 return Math.min(1,base+levelPenalty);
}
export function partialResistThresholds(coefficient){
 const value=Math.max(0,Math.min(1,coefficient))*3;
 if(value<=1)return [.76*value,.21*value,.03*value];
 if(value<=2)return [.76+.24*(value-1),.21+.57*(value-1),.03+.19*(value-1)];
 return [1,.78+.18*(value-2),.22+.58*(value-2)];
}
export function partialResistFraction(coefficient,roll){
 const [any,half,threeQuarters]=partialResistThresholds(coefficient);
 return roll>=any?0:roll>=half?.25:roll>=threeQuarters?.5:.75;
}
