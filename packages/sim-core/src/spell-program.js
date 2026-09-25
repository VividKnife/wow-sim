// Client spell records describe up to three ordered effects. Keep decoding pure:
// the server's executor supplies targeting, world state, RNG and script hooks.
export function spellProgram(spell){
 const effects=[];
 for(let index=1;index<=3;index++){
  const id=spell['Effect'+index]||0;if(!id)continue;
  effects.push(Object.freeze({index,id,aura:spell['EffectApplyAuraName'+index]||0,
   basePoints:spell['EffectBasePoints'+index]||0,baseDice:spell['EffectBaseDice'+index]||0,
   dieSides:spell['EffectDieSides'+index]||0,pointsPerLevel:spell['EffectRealPointsPerLevel'+index]||0,
   pointsPerCombo:spell['EffectPointsPerComboPoint'+index]||0,
   targetA:spell['EffectImplicitTargetA'+index]||0,targetB:spell['EffectImplicitTargetB'+index]||0,
   amplitude:spell['EffectAmplitude'+index]||0,trigger:spell['EffectTriggerSpell'+index]||0,
   mechanic:spell['EffectMechanic'+index]||spell.Mechanic||0,misc:spell['EffectMiscValue'+index]||0}));
 }
 return Object.freeze({id:spell.Id,family:spell.SpellFamilyName||0,school:spell.School||0,effects:Object.freeze(effects)});
}

export const spellModifierOperations=Object.freeze({
 DAMAGE:0,DURATION:1,THREAT:2,ATTACK_POWER:3,CHARGES:4,RANGE:5,RADIUS:6,
 CRITICAL_CHANCE:7,ALL_EFFECTS:8,PUSHBACK_RESISTANCE:9,CASTING_TIME:10,
 COOLDOWN:11,SPEED:12,COST:14,CRITICAL_DAMAGE:15,MISS_RESISTANCE:16,
 JUMP_TARGETS:17,PROC_CHANCE:18,ACTIVATION_TIME:19,EFFECT_PAST_FIRST:20,
 GLOBAL_COOLDOWN:21,PERIODIC_DAMAGE:22,HASTE:23,SPELL_BONUS_DAMAGE:24,
 MULTIPLE_VALUE:27,DISPEL_RESISTANCE:28,
});

export const spellAttributesEx3=Object.freeze({
 NO_AVOIDANCE:0x40,PER_CASTER_AURA:0x80,SUPPRESS_CASTER_PROCS:0x10000,
 ALWAYS_HIT:0x40000,IGNORE_CASTER_MODIFIERS:0x20000000,
});
