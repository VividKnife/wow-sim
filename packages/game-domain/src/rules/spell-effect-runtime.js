import {spellProgram} from '../../../sim-core/src/spell-program.js';
import {spells,items,classEnchantments} from './catalog.js';
import {stats,spellInfo,effectRange,roll,armorReduction} from './character.js';
import {weaponDamage,effectiveArmor} from './companion-combat.js';
import {spellPowerBonus} from './spell-scaling.js';
import {talentSpellValue,talentArmorPenetration,healingMultiplier} from './talent-effects.js';

// Spell effects execute by source effect ID. Class scripts supply only exceptions;
// recursive triggers carry the original cast snapshot and never start another GCD.
function effect2(ctx){const {s,c,t,sp,api,periodic,coefficient,n,effect,v,damage}=ctx;
 let raw=roll(s,...effectRange(c,sp,n))*coefficient+(sp['EffectPointsPerComboPoint'+n]||0)*(c.combo||0);if(sp.SpellName==='Bloodthirst')raw=stats(c).attackPower*v/100;if(sp.SpellName==='Shield Slam')raw+=(items[c.equipment[17]?.id]?.block||0)+Math.max(0,stats(c).str/20-1);if(sp.SpellName==='Ferocious Bite'){raw+=(c.energy||0)*(sp['EffectMultipleValue'+n]||1)+stats(c).attackPower*(c.combo||0)*.03;c.energy=0;}if(sp.School===0)raw*=1-armorReduction(effectiveArmor(t,s.clock)-talentArmorPenetration(c),c.level);damage(s,c,t,raw,sp,api,periodic,{effect:n,coefficient});
}
function effect9(ctx){const {s,c,t,sp,api,n,v,damage,heal}=ctx;
 const dealt=damage(s,c,t,v,sp,api);heal(s,c,c,dealt*(sp['EffectMultipleValue'+n]||1),sp,api);
}
function effect10(ctx){const {s,c,t,sp,api,coefficient,n,effect,v,heal}=ctx;
 if(api.heal)api.heal(s,c,t,sp,{effect:n,coefficient});else heal(s,c,t,(v+spellPowerBonus(stats(c),sp,{healing:true,effect:n})*coefficient)*healingMultiplier(c,sp,t),sp,api);
}
function effect67(ctx){const {s,c,t,sp,api,heal}=ctx;
 heal(s,c,t,stats(t).maxHp,sp,api);
}
function effect8(ctx){const {c,t,sp,n,v}=ctx;
 const drain=Math.min(t.mana||0,v);t.mana-=drain;c.mana=Math.min(stats(c).maxMana,c.mana+drain*(sp['EffectMultipleValue'+n]||0));
}
function effect30(ctx){const {c,t,sp,n,v}=ctx;
 const u=sp['EffectImplicitTargetA'+n]===1?c:t;const k={0:'mana',1:'rage',3:'energy'}[sp['EffectMiscValue'+n]];if(k)u[k]=Math.min(k==='mana'?stats(u).maxMana:k==='rage'?1000:stats(u).maxEnergy||100,(u[k]||0)+v);
}
function effect92(ctx){const {s,c,t,sp,n,amount}=ctx;
 const ench=classEnchantments[sp['EffectMiscValue'+n]],weapon=t.equipment?.[16];if(ench&&weapon&&items[weapon.id]?.class===2&&!(t.weaponEnchants?.[16]?.until>s.clock||t.weaponEnchant?.until>s.clock))t.totemWeaponEnchant={name:sp.SpellName,spell:sp.Id,trigger:ench.effects[0]?.spellId,chance:(ench.effects[0]?.amount||20)/100,until:s.clock+10000,weaponUid:weapon.uid,bonus:talentSpellValue(c,sp,3,1)};
}
function effect63(ctx){const {c,t,v}=ctx;
 if(t.threat)t.threat[c.id]=Math.max(0,(t.threat[c.id]||0)+v);
}
function effect38(ctx){const {s,t,sp,actors,n,v,dispelClassEffects}=ctx;
 dispelClassEffects(t,[sp['EffectMiscValue'+n]],Math.max(1,v),s,actors.includes(t)?'negative':'positive');
}
function effect62(ctx){const {s,c,t,sp,api,n,v,damage}=ctx;
 const drain=Math.min(t.mana||0,v);t.mana-=drain;damage(s,c,t,drain*talentSpellValue(c,sp,27,sp['EffectMultipleValue'+n]||.5),sp,api,false,{bonus:false});
}
function effect68(ctx){const {s,t,sp}=ctx;
 if(t.cast){t.schoolLockouts??={};t.schoolLockouts[spells[t.cast.spell]?.School]=s.clock+(sp.durationMs||({'Counterspell':10000,'Kick':5000,'Pummel':4000,'Shield Bash':6000}[sp.SpellName]||5000));t.cast=null;t.nextAction=s.clock;}
}
function effect80(ctx){const {s,c,t,v}=ctx;
 c.combo=Math.min(5,(c.comboTarget===t.id?c.combo||0:0)+Math.max(1,v));c.comboTarget=t.id;
}
function effect6(ctx){const {s,c,t,sp,actors,api,periodic,coefficient,depth,n,effect,type,v,amount,duration,damage,heal,aura,genericEffects}=ctx;
 if(effect===27&&!periodic){const origin=sp['EffectImplicitTargetA'+n]===18?c:t,interval=sp['EffectAmplitude'+n]||1000;s.groundEffects??=[];s.groundEffects=s.groundEffects.filter(a=>!(a.extended&&a.caster===c.id&&a.spell===sp.Id&&a.effect===n));s.groundEffects.push({side:'friendly',extended:true,caster:c.id,spell:sp.Id,effect:n,position:origin.position,positionY:origin.positionY||0,radius:sp.radius||8,interval,next:s.clock+interval,until:s.clock+sp.durationMs,amount:v,school:sp.School});return;}

   if([3,53,64,89].includes(type)){if(periodic){if(type===64){const drain=Math.min(t.mana||0,v);t.mana-=drain;c.mana=Math.min(stats(c).maxMana,c.mana+drain*(sp['EffectMultipleValue'+n]||0));}else{const dealt=damage(s,c,t,v,sp,api,true,{effect:n,coefficient});if(type===53)heal(s,c,c,dealt*(sp['EffectMultipleValue'+n]||1),sp,api);}}else{const interval=sp['EffectAmplitude'+n]||3000;t.dots??=[];const previous=t.dots.find(d=>d.caster===c.id&&spells[d.spell??d.spellId]?.SpellName===sp.SpellName),stacks=Math.min(sp.StackAmount||1,(previous?.stacks||0)+1);t.dots=t.dots.filter(d=>d!==previous);t.dots.push({caster:c.id,spellId:sp.Id,school:sp.School,amount:(v+(type===64?0:spellPowerBonus(stats(c),sp,{periodic:true,effect:n})*coefficient))*stacks,stacks,next:s.clock+interval,interval,remaining:Math.floor(duration(sp,c.combo)/interval),label:sp.SpellName,manaDrain:type===64,manaReturn:sp['EffectMultipleValue'+n]||0,dispelResistance:talentSpellValue(c,sp,28,0),leech:type===53?sp['EffectMultipleValue'+n]||1:0,dispel:sp.Dispel});}}
   else if(type===8||type===20||type===24||type===161){if(periodic){if(type===8||type===161)heal(s,c,t,(v+spellPowerBonus(stats(c),sp,{healing:true,periodic:true,effect:n})*coefficient)*healingMultiplier(c,sp,t),sp,api);else t.mana=Math.min(stats(t).maxMana,(t.mana||0)+v);}else{const interval=sp['EffectAmplitude'+n]||5000;t.periodicClass??=[];t.periodicClass=t.periodicClass.filter(p=>p.spell!==sp.Id);t.periodicClass.push({spell:sp.Id,caster:c.id,effect:n,amount:(type===8||type===161?(v+spellPowerBonus(stats(c),sp,{healing:true,periodic:true,effect:n})*coefficient)*healingMultiplier(c,sp,t):v),type,next:s.clock+interval,interval,until:s.clock+sp.durationMs});}}
   else if(type===23&&periodic&&sp['EffectTriggerSpell'+n]){const child=spells[sp['EffectTriggerSpell'+n]];if(child)genericEffects(s,c,t,spellInfo(c,child.Id),actors,api,{depth:depth+1,periodic:true});}
   else if(type===86){t.soulShardClaims??=[];t.soulShardClaims=t.soulShardClaims.filter(a=>a.caster!==c.id);t.soulShardClaims.push({caster:c.id,spell:sp.Id,item:sp['EffectItemType'+n],until:s.clock+sp.durationMs,channel:sp.SpellName==='Drain Soul'});}
   else if(type===125){t.stoneskin={spell:sp.Id,amount:Math.abs(v),until:s.clock+(sp.durationMs||2500)};}
   else if(type===15){t.thorns={spell:sp.Id,amount:v,until:s.clock+(sp.durationMs||1800000)};}
   else if(type===69){t.absorb={spell:sp.Id,caster:c.id,dispel:sp.Dispel,positive:true,amount:talentSpellValue(c,sp,8,effectRange(c,sp,n)[0]+spellPowerBonus(stats(c),sp,{effect:n}))*coefficient,schoolMask:sp['EffectMiscValue'+n],until:s.clock+sp.durationMs};}
   else if(type===97)t.manaShield={spell:sp.Id,amount:v+spellPowerBonus(stats(c),sp),multiplier:talentSpellValue(c,sp,27,sp['EffectMultipleValue'+n]||2),until:s.clock+sp.durationMs};
   else if(type===42&&sp['EffectTriggerSpell'+n])t.reactiveClass={spell:sp.Id,trigger:sp['EffectTriggerSpell'+n],charges:sp.ProcCharges>0?sp.ProcCharges:2147483647,until:s.clock+sp.durationMs,next:0};
   else if(type===33)aura(s,c,t,sp,n,talentSpellValue(c,sp,12,v));
   else if(![29,22,99,124].includes(type)||type===22&&!(sp['EffectMiscValue'+n]&1)||!(t.classBuffs||[]).some(b=>b.spell===sp.Id&&b.until>s.clock))aura(s,c,t,sp,n,v);
  
}
function effect64(ctx){const {s,c,t,sp,actors,api,depth,n,genericEffects}=ctx;
 const trigger=spells[sp['EffectTriggerSpell'+n]];if(trigger)genericEffects(s,c,t,spellInfo(c,trigger.Id),actors,api,{depth:depth+1});
}

export const spellEffectHandlers=Object.freeze({2:effect2,9:effect9,10:effect10,67:effect67,8:effect8,30:effect30,92:effect92,63:effect63,38:effect38,62:effect62,68:effect68,80:effect80,6:effect6,27:effect6,35:effect6,64:effect64,77:effect64});
export const weaponEffectIds=new Set([17,31,58,121]);
export function executeSpellEffects(s,c,t,sp,actors,api,services,options={}){
 const {periodic=false,coefficient=1,depth=0,ancestors=[],effects=null}=options;
 if(ancestors.includes(sp.Id)||depth>8)return {executed:[],unsupported:[{spellId:sp.Id,reason:'trigger-cycle-or-depth'}]};
 const {amount,duration,damage,heal,aura,dispelClassEffects}=services;
 const selected=spellProgram(sp).effects.filter(e=>!effects||effects.includes(e.index)).map(e=>e.index);
 const weaponEffects=selected.filter(n=>weaponEffectIds.has(sp['Effect'+n]));
 const result={executed:[],unsupported:[]};
 if(weaponEffects.length){let raw=weaponDamage(s,c,weaponEffects.some(n=>sp['Effect'+n]===121)),flat=0;for(const n of weaponEffects){if(sp['Effect'+n]===31)raw*=amount(c,sp,n)/100;else flat+=amount(c,sp,n);}damage(s,c,t,(raw+flat)*coefficient*(1-armorReduction(effectiveArmor(t,s.clock)-talentArmorPenetration(c),c.level)),sp,api,periodic);result.executed.push(...weaponEffects);}
 const genericEffects=(state,caster,target,child,members,callbacks,childOptions={})=>{
  const childResult=executeSpellEffects(state,caster,target,{...child,talentCast:sp.talentCast,triggeredBy:sp.Id},members,callbacks,services,{...childOptions,ancestors:[...ancestors,sp.Id],depth:depth+1});
  result.unsupported.push(...childResult.unsupported);return childResult;
 };
 for(const n of selected){const effect=sp['Effect'+n];if(weaponEffectIds.has(effect))continue;const handler=spellEffectHandlers[effect];if(!handler){result.unsupported.push({spellId:sp.Id,effectIndex:n,effect,reason:'requires-spell-script'});continue;}
  const type=sp['EffectApplyAuraName'+n],v=amount(c,sp,n)*coefficient;
  handler({s,c,t,sp,actors,api,periodic,coefficient,depth,n,effect,type,v,amount,duration,damage,heal,aura,dispelClassEffects,genericEffects});result.executed.push(n);
 }
 return result;
}
