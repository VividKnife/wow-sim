import {initializeHunterPetSkills,observeHunterPetSkill} from './pet-knowledge.js';
import {initializePetProgression,saveHunterPet,tickPetProgression,gainPetLoyaltyXp,petTrainingReason,petTrainingCost} from './pet-progression.js';
import petReference from '../../data/pet-family-reference.json' with {type:'json'};
import {canPolymorph,applyPolymorph} from './polymorph.js';
import {enemySpellInfo} from './enemy-spells.js';
import {consume} from './inventory.js';
import {spells,items,creatures,table,nameOf,lookup,classEnchantments,spellChain,xpTable} from './catalog.js';
import {stats,spellInfo,effectRange,roll,rng,armorReduction,log,refreshPetStats} from './character.js';
import {distance,point,areaTargets,aliveEnemy,moveToward} from './combat-space.js';
import {addCombatAura,activeAuras,schoolImmune} from './combat-auras.js';
import {weaponDamage,effectiveArmor,stanceAllows} from './companion-combat.js';
import {ranks,healingMultiplier,talentSpellValue,talentArmorPenetration,spellCritBonus,talentModifiers} from './talent-effects.js';
import {extendedSpellNames,extendedHeals,extendedBuffs,extendedChannels,extendedDispels,extendedTotems,extendedSeals,extendedEnchants,extendedSummons,classAbilityKind} from './class-spell-registry.js';
export {classAbilityKind,extendedSpellNames};
const sealTrigger=(c,seal)=>spells[seal?.EffectTriggerSpell1];
const friendlyDispel=new Set(['Purify','Cleanse','Cure Disease','Abolish Disease','Cure Poison','Abolish Poison','Remove Curse','Remove Lesser Curse']);
const comboFinishers=new Set(['Slice and Dice','Rupture','Expose Armor','Kidney Shot','Ferocious Bite']);
const stealthAttacks=new Set(['Garrote','Cheap Shot','Pounce','Ravage']);
const selfControls=new Set(['Feign Death','Disengage','Feint','Blink']);
const pendingDispel=(u,types)=>(u.auras||[]).some(a=>types.includes(a.dispel??spells[a.spell]?.Dispel))||(u.dots||[]).some(a=>types.includes(a.dispel??spells[a.spell??a.spellId]?.Dispel));
const dispelTypes=sp=>[1,2,3].filter(n=>sp['Effect'+n]===38).map(n=>sp['EffectMiscValue'+n]);
export function dispelClassEffects(unit,types,count=Infinity,s){let left=count;for(const key of ['auras','dots','classBuffs','hots'])unit[key]=(unit[key]||[]).filter(a=>{if(left>0&&types.includes(a.dispel??spells[a.spell??a.spellId]?.Dispel)){left--;if(s&&a.dispelResistance>0&&rng(s)<a.dispelResistance/100)return true;return false;}return true;});return count-left;}
function allLiving(s){return(s.combat?.enemies||[]).filter(e=>aliveEnemy(e)&&!e.controlledBy);}
function buffActive(c,name,clock){return(c.classBuffs||[]).some(b=>b.name===name&&b.until>clock+1500)||(c.auras||[]).some(a=>spells[a.spell]?.SpellName===name&&a.until>clock+1500);}
function duration(sp,combo=0){const row=lookup.SpellDuration[sp.DurationIndex];return Math.max(0,Math.min(row?.maximumMs>0?row.maximumMs:Infinity,(sp.durationMs||0)+(row?.maximumMs>sp.durationMs?(row.maximumMs-sp.durationMs)*combo/5:0)));}
function amount(c,sp,n=1){const raw=effectRange(c,sp,n)[0]+(sp['EffectPointsPerComboPoint'+n]||0)*(c.combo||0);return [2,9,17,31,58,121].includes(sp['Effect'+n])||[3,53].includes(sp['EffectApplyAuraName'+n])?raw:talentSpellValue(c,sp,8,raw);}
function aura(s,c,target,sp,n,value=amount(c,sp,n),until=s.clock+(duration(sp,c.combo)||1800000)){addCombatAura(target,{spell:sp.Id,effect:n,type:sp['EffectApplyAuraName'+n],amount:value,misc:sp['EffectMiscValue'+n],dispel:sp.Dispel,consumeOnImmune:sp.SpellName==='Fear Ward',dispelResistance:talentSpellValue(c,sp,28,0),charges:sp.ProcCharges>0?talentSpellValue(c,sp,4,sp.ProcCharges):null,mechanic:sp['EffectMechanic'+n]||sp.Mechanic,caster:c.id,until},s.clock);}
function heal(s,c,t,value,sp,api){if(api.healAmount)return api.healAmount(s,c,t,value,sp.Id,sp.SpellName);if(!t||t.hp<=0)return;const actual=Math.min(stats(t).maxHp-t.hp,Math.max(0,Math.round(value)));t.hp+=actual;}
function damage(s,c,t,value,sp,api,periodic=false){if(!t||t.hp<=0||!api.damage)return 0;const before=t.hp,st=stats(c),critical=!periodic&&rng(s)<(sp.School===0?st.crit:st.spellCrit)+spellCritBonus(c,sp,t);if(sp.School>0&&!periodic){const coefficient=table('spell_bonus_data').find(r=>r.entry===sp.Id)?.direct_bonus??Math.min(1,(sp.castMs||0)/3500);value+=st.spellPower*coefficient;}if(critical)value*=sp.School===0?2:1+.5*talentSpellValue(c,sp,15,100)/100;api.damage(s,c,t,value,sp.SpellName,1,{spellId:sp.Id,school:sp.School,periodic,critical});return before-t.hp;}
export function prepareClassAbility(s,c,e,sp,actors){
 const name=sp.SpellName;if(!extendedSpellNames.has(name))return undefined;if(name==='Ritual of Doom')return null;
 let target=e;
 if(extendedBuffs.has(name)||extendedSeals.has(name)||extendedEnchants.has(name)||extendedTotems.has(name)||extendedSummons.has(name)&&name!=='Inferno'||selfControls.has(name)||['Evocation','Tranquility'].includes(name))target=c;
 if(extendedHeals.has(name)&&!['Holy Shock','Holy Nova','Rebirth','Tranquility'].includes(name)){target=actors.filter(a=>a.hp>0&&a.hp<stats(a).maxHp*.9).sort((a,b)=>a.hp/stats(a).maxHp-b.hp/stats(b).maxHp)[0];if(!target)return null;}
 if(['Mend Pet','Health Funnel'].includes(name)){target=c.pet;if(!target||target.hp<=0||target.hp>=target.maxHp||name==='Health Funnel'&&c.hp<stats(c).maxHp*.2)return null;}
 if(['Blessing of Sacrifice','Divine Intervention'].includes(name)){target=actors.filter(a=>a!==c&&!a.petUnit&&a.hp>0).sort((a,b)=>a.hp/stats(a).maxHp-b.hp/stats(b).maxHp)[0];if(!target||name==='Divine Intervention'&&c.hp>stats(c).maxHp*.1)return null;}
 if(['Shoot','Throw'].includes(name)&&!items[c.equipment[18]?.id])return null;
 if(name==='Vampiric Embrace'&&e.vampiricEmbrace?.caster===c.id&&e.vampiricEmbrace.until>s.clock)return null;
 if(name==='Rebirth'){target=actors.find(a=>a.hp<=0&&!a.petUnit);if(!target)return null;}
 if(friendlyDispel.has(name)||name==='Dispel Magic'){const types=dispelTypes(sp);target=actors.find(a=>a.hp>0&&pendingDispel(a,types));if(!target){if(name==='Dispel Magic'&&pendingDispel(e,[1]))target=e;else return null;}}
 if(name==='Purge'&&!pendingDispel(e,[1]))return null;
 if(comboFinishers.has(name)&&(!c.combo||c.comboTarget!==e.id))return null;
 if(stealthAttacks.has(name)&&!c.stealthed)return null;
 if(name==='Execute'&&e.hp/e.maxHp>.2)return null;
 if(name==='Hammer of Wrath'&&e.hp/e.maxHp>.2)return null;
 if(name==='Conflagrate'&&!e.dots.some(d=>d.caster===c.id&&spells[d.spell??d.spellId]?.SpellName==='Immolate'))return null;
 if(['Exorcism','Holy Wrath','Turn Undead','Shackle Undead'].includes(name)&&![3,6].includes(creatures[e.entry]?.CreatureType))return null;
 if(['Scare Beast','Hibernate'].includes(name)&&![1,...(name==='Hibernate'?[2]:[])].includes(creatures[e.entry]?.CreatureType))return null;
 if(name==='Banish'&&![3,4].includes(creatures[e.entry]?.CreatureType))return null;
 if(name==='Enslave Demon'&&(creatures[e.entry]?.CreatureType!==3||e.level>amount(c,sp)))return null;
 if(name==='Sap'&&(creatures[e.entry]?.CreatureType!==7||!c.stealthed))return null;
 if(name==='Shield Bash'||name==='Shield Block'||name==='Shield Slam'||name==='Shield Wall')if(items[c.equipment[17]?.id]?.InventoryType!==14)return null;
 if(['Pummel','Shield Bash','Counterspell','Silence'].includes(name)&&!e.cast)return null;
 if(c.classId===1&&!stanceAllows(c,sp))return null;
 if(['Rake','Shred','Ferocious Bite','Pounce','Ravage'].includes(name)&&c.form!=='cat')return null;
 if(['Swipe','Bash','Frenzied Regeneration','Enrage'].includes(name)&&c.form!=='bear')return null;
 if(name==='Overpower'&&!(c.overpowerUntil>s.clock)||name==='Revenge'&&!(c.revengeUntil>s.clock)||name==='Mongoose Bite'&&!(c.dodgeUntil>s.clock)||name==='Counterattack'&&!(c.parryUntil>s.clock))return null;
 if(extendedBuffs.has(name)&&buffActive(c,name,s.clock))return null;
 if(extendedSeals.has(name)&&spells[c.seal?.spell]?.SpellName===name&&c.seal.until>s.clock)return null;
 if(extendedSummons.has(name)&&name!=='Dismiss Pet'&&c.pet?.hp>0&&c.pet.spell===sp.Id)return null;
 if(name==='Dismiss Pet'&&!c.pet)return null;
 if(extendedTotems.has(name)&&Object.values(c.totems||{}).some(t=>t.name===name&&t.until>s.clock))return null;
 if(extendedEnchants.has(name)&&c.weaponEnchant?.spell===sp.Id&&c.weaponEnchant.until>s.clock)return null;
 if(name==='Evocation'&&c.mana>stats(c).maxMana*.35)return null;
 if(name==='Innervate'){target=actors.filter(a=>a.hp>0&&stats(a).maxMana>0&&a.mana<stats(a).maxMana*.5).sort((a,b)=>a.mana/stats(a).maxMana-b.mana/stats(b).maxMana)[0];if(!target)return null;}
 if(name==='Lay on Hands'&&target.hp>stats(target).maxHp*.3)return null;
 if(['Ice Block','Divine Shield','Divine Protection','Deterrence','Shield Wall','Last Stand','Barkskin','Feign Death'].includes(name)&&c.hp>stats(c).maxHp*.4)return null;
 if(['Vanish','Prowl'].includes(name)&&c.stealthed)return null;
 if(name==='Ghost Wolf'&&c.form==='wolf'||name==='Dire Bear Form'&&c.form==='bear'||name==='Travel Form'&&c.form==='travel'||name==='Moonkin Form'&&c.form==='moonkin'||name==='Shadowform'&&c.form==='shadow')return null;
 if(name==='Berserker Stance'&&c.stance==='berserker')return null;
 if(name==='Curse of Doom'&&e.dots.some(d=>d.caster===c.id&&spells[d.spell??d.spellId]?.SpellName===name))return null;
 if(name.endsWith('Trap')&&(c.trap?.until>s.clock||s.clock>s.combat.startedAt+100&&!(c.feignUntil>s.clock)))return null;
 if(target?.entry&&sp.TargetCreatureType&&!(sp.TargetCreatureType&(1<<((creatures[target.entry]?.CreatureType||1)-1))))return null;
 if(name==='Mind Control'&&target.level>amount(c,sp))return null;
 return {target,channel:extendedChannels.has(name)};
}
function applyStatsBuff(s,c,t,sp){const values={};for(let n=1;n<=3;n++){const type=sp['EffectApplyAuraName'+n],misc=sp['EffectMiscValue'+n],v=amount(c,sp,n);if(type===29){if(misc===-1)for(const k of ['str','agi','sta','int','spi'])values[k]=v;else if(['str','agi','sta','int','spi'][misc])values[['str','agi','sta','int','spi'][misc]]=v;}if(type===22&&misc&1)values.armor=v;if(type===99)values.attackPower=v;if(type===124)values.rangedAttackPower=v;}
 t.classBuffs=(t.classBuffs||[]).filter(b=>b.name!==sp.SpellName);t.classBuffs.push({spell:sp.Id,name:sp.SpellName,caster:c.id,charges:sp.ProcCharges||null,until:s.clock+(sp.durationMs||1800000),stats:values});}
function genericEffects(s,c,t,sp,actors,api,{periodic=false,coefficient=1,depth=0}={}){
 if(depth>5)return;const weaponEffects=[1,2,3].filter(n=>[17,31,58,121].includes(sp['Effect'+n]));
 if(weaponEffects.length){let raw=weaponDamage(s,c,sp.Effect1===121||sp.Effect2===121),flat=0;for(const n of weaponEffects){if(sp['Effect'+n]===31)raw*=amount(c,sp,n)/100;else flat+=amount(c,sp,n);}damage(s,c,t,(raw+flat)*coefficient*(1-armorReduction(effectiveArmor(t,s.clock)-talentArmorPenetration(c),c.level)),sp,api,periodic);}
 for(let n=1;n<=3;n++){const effect=sp['Effect'+n],type=sp['EffectApplyAuraName'+n],v=amount(c,sp,n)*coefficient;if(!effect)continue;
  if(effect===2){let raw=roll(s,...effectRange(c,sp,n))*coefficient+(sp['EffectPointsPerComboPoint'+n]||0)*(c.combo||0);if(sp.SpellName==='Bloodthirst')raw=stats(c).attackPower*v/100;if(sp.SpellName==='Shield Slam')raw+=(items[c.equipment[17]?.id]?.block||0)+Math.max(0,stats(c).str/20-1);if(sp.SpellName==='Ferocious Bite'){raw+=(c.energy||0)*(sp['EffectMultipleValue'+n]||1)+stats(c).attackPower*(c.combo||0)*.03;c.energy=0;}if(sp.School===0)raw*=1-armorReduction(effectiveArmor(t,s.clock)-talentArmorPenetration(c),c.level);damage(s,c,t,raw,sp,api,periodic);}
  if(effect===9){const dealt=damage(s,c,t,v,sp,api);heal(s,c,c,dealt*(sp['EffectMultipleValue'+n]||1),sp,api);}
  if(effect===10){if(api.heal&&n===1)api.heal(s,c,t,{...sp,EffectBasePoints1:Math.round(sp.EffectBasePoints1*coefficient)});else heal(s,c,t,v*healingMultiplier(c,sp,t),sp,api);}
  if(effect===67)heal(s,c,t,stats(t).maxHp,sp,api);
  if(effect===8){const drain=Math.min(t.mana||0,v);t.mana-=drain;c.mana=Math.min(stats(c).maxMana,c.mana+drain*(sp['EffectMultipleValue'+n]||0));}
  if(effect===30){const u=sp['EffectImplicitTargetA'+n]===1?c:t;const k={0:'mana',1:'rage',3:'energy'}[sp['EffectMiscValue'+n]];if(k)u[k]=Math.min(k==='mana'?stats(u).maxMana:k==='rage'?1000:stats(u).maxEnergy||100,(u[k]||0)+v);}
  if(effect===92){const ench=classEnchantments[sp['EffectMiscValue'+n]],weapon=t.equipment?.[16];if(ench&&weapon&&items[weapon.id]?.class===2&&!(t.weaponEnchants?.[16]?.until>s.clock||t.weaponEnchant?.until>s.clock))t.totemWeaponEnchant={name:sp.SpellName,spell:sp.Id,trigger:ench.effects[0]?.spellId,chance:(ench.effects[0]?.amount||20)/100,until:s.clock+10000,weaponUid:weapon.uid,bonus:talentSpellValue(c,sp,3,1)};}
  if(effect===63&&t.threat)t.threat[c.id]=Math.max(0,(t.threat[c.id]||0)+v);
  if(effect===38)dispelClassEffects(t,[sp['EffectMiscValue'+n]],Math.max(1,v),s);
  if(effect===62){const drain=Math.min(t.mana||0,v);t.mana-=drain;damage(s,c,t,drain*(sp['EffectMultipleValue'+n]||.5),sp,api);}
  if(effect===68){if(t.cast){t.schoolLockouts??={};t.schoolLockouts[spells[t.cast.spell]?.School]=s.clock+(sp.durationMs||({'Counterspell':10000,'Kick':5000,'Pummel':4000,'Shield Bash':6000}[sp.SpellName]||5000));t.cast=null;}}
  if(effect===80){c.combo=Math.min(5,(c.comboTarget===t.id?c.combo||0:0)+Math.max(1,v),s);c.comboTarget=t.id;}
  if(effect===27&&!periodic){const origin=sp['EffectImplicitTargetA'+n]===18?c:t,interval=sp['EffectAmplitude'+n]||1000;s.groundEffects??=[];s.groundEffects=s.groundEffects.filter(a=>!(a.extended&&a.caster===c.id&&a.spell===sp.Id&&a.effect===n));s.groundEffects.push({side:'friendly',extended:true,caster:c.id,spell:sp.Id,effect:n,position:origin.position,positionY:origin.positionY||0,radius:sp.radius||8,interval,next:s.clock+interval,until:s.clock+sp.durationMs,amount:v,school:sp.School});continue;}
  if(effect===6||effect===27||effect===35){
   if([3,53,64,89].includes(type)){if(periodic){if(type===64){const drain=Math.min(t.mana||0,v);t.mana-=drain;c.mana=Math.min(stats(c).maxMana,c.mana+drain*(sp['EffectMultipleValue'+n]||0));}else{const dealt=damage(s,c,t,v,sp,api,true);if(type===53)heal(s,c,c,dealt*(sp['EffectMultipleValue'+n]||1),sp,api);}}else{const interval=sp['EffectAmplitude'+n]||3000;t.dots??=[];const previous=t.dots.find(d=>d.caster===c.id&&spells[d.spell??d.spellId]?.SpellName===sp.SpellName),stacks=Math.min(sp.StackAmount||1,(previous?.stacks||0)+1);t.dots=t.dots.filter(d=>d!==previous);t.dots.push({caster:c.id,spellId:sp.Id,school:sp.School,amount:v*stacks,stacks,next:s.clock+interval,interval,remaining:Math.floor(duration(sp,c.combo)/interval),label:sp.SpellName,manaDrain:type===64,manaReturn:sp['EffectMultipleValue'+n]||0,dispelResistance:talentSpellValue(c,sp,28,0),leech:type===53?sp['EffectMultipleValue'+n]||1:0,dispel:sp.Dispel});}}
   else if(type===8||type===20||type===24||type===161){if(periodic){if(type===8||type===161)heal(s,c,t,v,sp,api);else t.mana=Math.min(stats(t).maxMana,(t.mana||0)+v);}else{const interval=sp['EffectAmplitude'+n]||5000;t.periodicClass??=[];t.periodicClass=t.periodicClass.filter(p=>p.spell!==sp.Id);t.periodicClass.push({spell:sp.Id,caster:c.id,effect:n,amount:v,type,next:s.clock+interval,interval,until:s.clock+sp.durationMs});}}
   else if(type===23&&periodic&&sp['EffectTriggerSpell'+n]){const child=spells[sp['EffectTriggerSpell'+n]];if(child)genericEffects(s,c,t,spellInfo(c,child.Id),actors,api,{depth:depth+1,periodic:true});}
   else if(type===86){t.soulShardClaims??=[];t.soulShardClaims=t.soulShardClaims.filter(a=>a.caster!==c.id);t.soulShardClaims.push({caster:c.id,spell:sp.Id,item:sp['EffectItemType'+n],until:s.clock+sp.durationMs,channel:sp.SpellName==='Drain Soul'});}
   else if(type===125){t.stoneskin={spell:sp.Id,amount:Math.abs(v),until:s.clock+(sp.durationMs||2500)};}
   else if(type===15){t.thorns={spell:sp.Id,amount:v,until:s.clock+(sp.durationMs||1800000)};}
   else if(type===69){t.absorb={spell:sp.Id,amount:v,schoolMask:sp['EffectMiscValue'+n],until:s.clock+sp.durationMs};}
   else if(type===97)t.manaShield={spell:sp.Id,amount:v,multiplier:talentSpellValue(c,sp,27,sp['EffectMultipleValue'+n]||2),until:s.clock+sp.durationMs};
   else if(type===42&&sp['EffectTriggerSpell'+n])t.reactiveClass={spell:sp.Id,trigger:sp['EffectTriggerSpell'+n],charges:sp.ProcCharges>0?sp.ProcCharges:2147483647,until:s.clock+sp.durationMs,next:0};
   else if(type===33)aura(s,c,t,sp,n,talentSpellValue(c,sp,12,v));
   else if(![29,22,99,124].includes(type)||type===22&&!(sp['EffectMiscValue'+n]&1)||!(t.classBuffs||[]).some(b=>b.spell===sp.Id&&b.until>s.clock))aura(s,c,t,sp,n,v);
  }
  if(effect===64||effect===77){const trigger=spells[sp['EffectTriggerSpell'+n]];if(trigger)genericEffects(s,c,t,spellInfo(c,trigger.Id),actors,api,{depth:depth+1});}
 }
}
export function executeExtendedClassEffect(s,c,target,sp,actors=[c],api={}){
 const name=sp.SpellName;if(!extendedSpellNames.has(name))return false;const r=ranks(c);target??=c;
 if(name==='Thorns')return false;
 if(name.startsWith('Polymorph:')){if(canPolymorph(target,sp)&&(!api.lands||api.lands(s,c,target,sp)))applyPolymorph(s,c,target,sp);return true;}
 if(name==='Flare'){s.flares??=[];s.flares.push({caster:c.id,position:target.position,positionY:target.positionY||0,radius:sp.radius||10,until:s.clock+sp.durationMs});return true;}
 if(name==='Divine Intervention'){if(target===c)return true;genericEffects(s,c,target,spellInfo(c,19753),actors,api);c.hp=0;c.cast=null;for(const e of allLiving(s))delete e.threat[target.id];return true;}
 if(name==='Blessing of Sacrifice'){if(target!==c)target.sacrifice={caster:c.id,amount:amount(c,sp),until:s.clock+sp.durationMs};return true;}
 if(name==='Shoot'||name==='Throw'){const weapon=items[c.equipment[18]?.id];if(!weapon)return true;const raw=roll(s,weapon.dmg_min1||0,weapon.dmg_max1||0)+(name==='Throw'?stats(c).rangedAttackPower/14*(weapon.delay||2000)/1000:0),school=name==='Shoot'?(weapon.dmg_type1||0):0;c.nextAction=Math.max(c.nextAction,s.clock+(weapon.delay||1500));damage(s,c,target,raw*(school===0?1-armorReduction(target.armor,c.level):1),{...sp,School:school},api);if(name==='Throw'&&c.equipment[18].count>0)c.equipment[18].count--;return true;}

 if(extendedEnchants.has(name)){const row=classEnchantments[sp.EffectMiscValue1];if(name==='Rockbiter Weapon'){const effect=spells[row?.effects?.find(e=>e.type===3)?.spellId];if(effect){applyStatsBuff(s,c,c,{...spellInfo(c,effect.Id),SpellName:name,Id:sp.Id,durationMs:1800000});}return true;}c.weaponEnchant={spell:sp.Id,name,until:s.clock+1800000,charges:name.includes('Poison')?120:null,bonus:talentSpellValue(c,sp,3,1),chance:talentSpellValue(c,sp,18,row?.effects?.[0]?.amount||20)/100,enchant:sp.EffectMiscValue1,trigger:row?.effects?.[0]?.spellId||0};return true;}
 if(extendedSeals.has(name)){c.seal={spell:sp.Id,until:s.clock+sp.durationMs};applyStatsBuff(s,c,c,sp);genericEffects(s,c,c,sp,actors,api);return true;}
 if(extendedTotems.has(name)){createClassTotem(s,c,sp);return true;}
 if(name==='Inferno'){if(api.summonInfernal)api.summonInfernal(s,c,target);return true;}
 if(name==='Ritual of Doom'){if(api.doomRitual)api.doomRitual(s);return true;}
 if(extendedSummons.has(name)){if(name==='Dismiss Pet'){if(c.pet?.kind==='beast')saveHunterPet(s,c);c.pet=null;return true;}summonClassPet(s,c,sp);return true;}
 if(name==='Vampiric Embrace'){target.vampiricEmbrace={caster:c.id,until:s.clock+sp.durationMs};return true;}
 if(name==='Rebirth'){target.hp=Math.min(stats(target).maxHp,amount(c,sp));target.mana=Math.min(stats(target).maxMana,amount(c,sp,2));return true;}
 if(name==='Execute'){const trigger=spells[sp.EffectTriggerSpell1]||sp;const extra=(c.rage||0)*(sp.DmgMultiplier1||.3);c.rage=0;damage(s,c,target,(amount(c,trigger)+extra)*(1-armorReduction(effectiveArmor(target,s.clock),c.level)),sp,api);return true;}
 if(name==='Charge'||name==='Intercept'||name==='Feral Charge'){const p=point(target);c.position=p.x-3;c.positionY=p.y;genericEffects(s,c,target,sp,actors,api);return true;}
 if(name==='Blink'){c.position=(c.position||0)+20;c.rootUntil=0;c.stunUntil=0;c.auras=(c.auras||[]).filter(a=>![12,26].includes(a.type));return true;}
 if(name==='Feign Death'||name==='Vanish'){c.feignResisted=[];for(const e of allLiving(s)){if(name==='Feign Death'&&api.lands&&!api.lands(s,c,e,sp)){c.feignResisted.push(e.id);continue;}e.threat[c.id]=0;if(e.target===c.id)e.target=null;}c.cast=null;c.stealthed=true;c.feignUntil=name==='Feign Death'?s.clock+sp.durationMs:0;c.auras=(c.auras||[]).filter(a=>![26,33].includes(a.type));c.rootUntil=0;return true;}
 if(name==='Fade'){c.fade={until:s.clock+sp.durationMs,amount:Math.abs(amount(c,sp))};return true;}
 if(['Feint','Disengage','Cower'].includes(name)){target=allLiving(s).find(e=>e.id===c.target)||allLiving(s)[0];if(target)target.threat[c.id]=Math.max(0,(target.threat[c.id]||0)+Math.min(-1,sp.EffectBasePoints1+1));return true;}
 if(['Challenging Shout','Challenging Roar','Mocking Blow','Distracting Shot'].includes(name)){for(const e of (name.startsWith('Challenging')?allLiving(s).filter(e=>distance(c,e)<=10):[target])){e.tauntedBy=c.id;e.tauntUntil=s.clock+(sp.durationMs||6000);e.target=c.id;if(name==='Distracting Shot')e.threat[c.id]=(e.threat[c.id]||0)+amount(c,sp);}genericEffects(s,c,target,sp,actors,api);return true;}
 if(name==='Berserker Stance'){c.stance='berserker';c.rage=Math.min(c.rage||0,50*(r['Tactical Mastery']||0));return true;}
 const forms={'Dire Bear Form':'bear','Ghost Wolf':'wolf','Travel Form':'travel','Aquatic Form':'aquatic','Moonkin Form':'moonkin','Shadowform':'shadow'};
 if(forms[name]){c.form=forms[name];c.rootUntil=0;c.movementSlows=[];c.auras=(c.auras||[]).filter(a=>![26,33].includes(a.type));applyStatsBuff(s,c,c,sp);return true;}
 if(name==='Prowl'){c.stealthed=true;return true;}
 if(['Preparation','Readiness'].includes(name)){for(const id of c.learned||[])if(id!==sp.Id&&(name==='Readiness'||['Evasion','Sprint','Vanish','Cold Blood','Shadowstep','Premeditation'].includes(spells[id]?.SpellName)))c.cooldowns[id]=0;return true;}
 if(name==='Tranquilizing Shot'){target.enraged=false;dispelClassEffects(target,[9]);target.auras=(target.auras||[]).filter(a=>a.type!==138);return true;}
 if(name==='Swiftmend'){const hot=target.hots?.find(h=>['Rejuvenation','Regrowth'].includes(h.name));if(hot){heal(s,c,target,hot.amount*(hot.name==='Rejuvenation'?4:6),sp,api);target.hots=target.hots.filter(h=>h!==hot);}return true;}
 if(name==='Demonic Sacrifice'){if(c.pet?.hp>0){c.sacrificedDemon={kind:c.pet.kind,until:s.clock+1800000};c.pet.hp=0;}return true;}
 if(name==='Soul Link'){c.soulLink=true;return true;}
 if(name==='Enslave Demon'||name==='Mind Control'){if(api.lands&&!api.lands(s,c,target,sp))return true;if(name==='Enslave Demon')c.pet=null;const applications=target.lastControlEnd&&s.clock-target.lastControlEnd<15000?(target.controlApplications||0)+1:0;target.controlApplications=applications;target.controlHeartbeatInterval=Math.max(1000,sp.durationMs/(2+applications));target.controlHeartbeatNext=s.clock+target.controlHeartbeatInterval;const difference=target.level-c.level;target.controlHeartbeatChance=Math.min(.99,Math.max(.01,(difference<=2?.04+difference*.01:.17+(difference-3)*.11)-talentSpellValue(c,sp,16,0)/100-(stats(c).spellHit||0))*(1+applications));target.controlledBy=c.id;target.controlUntil=s.clock+sp.durationMs;target.controlSpell=sp.Id;target.controlAttackMultiplier=1-talentSpellValue(c,sp,23,amount(c,sp,2))/100;target.controlCastMultiplier=1-talentSpellValue(c,sp,24,amount(c,sp,3))/100;target.threat={};target.cast=null;if(name==='Mind Control'){c.cast={spell:sp.Id,target:target.id,channel:true,controlChannel:true,startedAt:s.clock,until:s.clock+sp.durationMs,next:s.clock+1000,interval:1000};c.nextAction=c.cast.until;}return true;}
 if(name.endsWith('Trap')){c.trap={spell:sp.Id,name,position:c.position,positionY:c.positionY||0,armAt:s.clock+Math.max(0,talentSpellValue(c,sp,19,2000)),until:s.clock+(sp.durationMs||60000)};return true;}
 if(name==='Barkskin'&&spells[22839])genericEffects(s,c,c,{...spellInfo(c,22839),durationMs:sp.durationMs},actors,api);
 if(name==='Innervate'){target.innervateUntil=s.clock+sp.durationMs;applyStatsBuff(s,c,target,sp);return true;}
 if(name==='Frenzied Regeneration'){c.frenziedRegen={until:s.clock+sp.durationMs,next:s.clock+1000,spell:sp.Id,amount:amount(c,sp)};return true;}
 if(name==='Enrage'){addCombatAura(c,{spell:sp.Id,effect:3,type:101,misc:1,amount:c.learned.includes(9634)?-16:-27,until:s.clock+sp.durationMs},s.clock);c.rage=Math.min(1000,(c.rage||0)+100);c.bloodrage={next:s.clock+1000,until:s.clock+10000};applyStatsBuff(s,c,c,sp);return true;}
 if(name==='Holy Shock'){const ids={20473:[25914,25912],20929:[25913,25911],20930:[25903,25902]}[sp.Id];const id=ids?.[actors.includes(target)?0:1];if(id&&spells[id])genericEffects(s,c,target,spellInfo(c,id),actors,api);return true;}
 if(name==='Holy Nova'){const healing=Object.values(spells).find(p=>p.SpellName===name&&p.Rank1===sp.Rank1&&p.Effect1===10);for(const a of actors.filter(a=>a.hp>0&&distance(c,a)<=(sp.radius||10)))if(healing)genericEffects(s,c,a,spellInfo(c,healing.Id),actors,api);for(const e of allLiving(s).filter(e=>distance(c,e)<=(sp.radius||10)))genericEffects(s,c,e,sp,actors,api);return true;}
 if(extendedHeals.has(name)&&!extendedChannels.has(name)){const recipients=name==='Prayer of Healing'||name==='Holy Nova'?actors.filter(a=>a.hp>0&&distance(c,a)<=(sp.radius||30)):name==='Chain Heal'?[target,...actors.filter(a=>a!==target&&a.hp>0&&distance(target,a)<=12).sort((a,b)=>a.hp/stats(a).maxHp-b.hp/stats(b).maxHp)].slice(0,3):[target];recipients.forEach((a,i)=>genericEffects(s,c,a,sp,actors,api,{coefficient:name==='Chain Heal'?Math.pow(.5,i):1}));if(name==='Lay on Hands'){c.mana=0;heal(s,c,target,stats(c).maxHp,sp,api);}return true;}
 if(name==='Slice and Dice'){const n=[1,2,3].find(n=>sp['EffectApplyAuraName'+n]===138);aura(s,c,c,sp,n,amount(c,sp,n),s.clock+(6000+3000*(c.combo||0))*(1+.15*(r['Improved Slice and Dice']||0)));c.combo=0;return true;}
 if(name==='Conflagrate')target.dots=target.dots.filter(d=>!(d.caster===c.id&&spells[d.spell??d.spellId]?.SpellName==='Immolate'));
 if(name.startsWith('Curse of ')){target.auras=(target.auras||[]).filter(a=>!(a.caster===c.id&&spells[a.spell]?.SpellName.startsWith('Curse of ')));target.dots=(target.dots||[]).filter(a=>!(a.caster===c.id&&spells[a.spell??a.spellId]?.SpellName.startsWith('Curse of ')));}
 if(extendedDispels.has(name)){genericEffects(s,c,target,sp,actors,api);if(name.startsWith('Abolish'))target.abolish={spell:sp.Id,types:name==='Abolish Poison'?[4]:[3],next:s.clock+5000,until:s.clock+sp.durationMs};return true;}
 if(extendedBuffs.has(name)){const group=name.startsWith('Prayer of ')||name.startsWith('Greater Blessing')||name.endsWith(' Aura')||['Trueshot Aura','Aspect of the Pack'].includes(name);const recipients=group?actors.filter(a=>a.hp>0&&distance(c,a)<=40):[target];for(const a of recipients){applyStatsBuff(s,c,a,sp);genericEffects(s,c,a,sp,actors,api);}return true;}
 if(['Garrote','Rupture','Expose Armor','Kidney Shot'].includes(name)){genericEffects(s,c,target,sp,actors,api);if(comboFinishers.has(name))c.combo=0;return true;}
 const recipients=name==='Chain Lightning'?[target,...allLiving(s).filter(e=>e!==target&&distance(target,e)<=10)].slice(0,sp.EffectChainTarget1||3):areaTargets(s,c,target,sp);for(const [index,t] of recipients.entries()){if(api.lands&&!api.lands(s,c,t,sp))continue;genericEffects(s,c,t,sp,actors,api,{coefficient:name==='Chain Lightning'?Math.pow(sp.DmgMultiplier1||.7,index):1});}
 if(comboFinishers.has(name))c.combo=0;return true;
}
export function classChannelTick(s,c,target,sp,cast,actors,api){
 if(sp.SpellName==='Evocation'){const st=stats(c);c.mana=Math.min(st.maxMana,c.mana+st.maxMana*.15);return;}
 if(sp.SpellName==='Health Funnel'){const v=amount(c,sp);const cost=Math.max(0,(sp.ManaPerSecond||0)+(sp.ManaPerSecondPerLevel||0)*c.level);if(c.hp<=cost){c.cast=null;return;}c.hp-=cost;heal(s,c,target,v,sp,api);return;}
 const friendly=sp.SpellName==='Tranquility',targets=friendly?actors.filter(a=>a.hp>0&&distance(c,a)<=(sp.radius||30)):sp.SpellName==='Mend Pet'?[target]:areaTargets(s,c,target,sp,cast.center);
 for(const t of targets)genericEffects(s,c,t,sp,actors,api,{periodic:true});
 if(sp.SpellName==='Hellfire')c.hp=Math.max(1,c.hp-amount(c,sp));
}
export function classChannelInterval(sp){return sp.SpellName==='Evocation'?2000:Math.min(...[1,2,3].map(n=>sp['EffectAmplitude'+n]).filter(v=>v>0),100000)||1000;}
export function summonClassPet(s,c,sp){const kind={'Summon Imp':'imp','Summon Voidwalker':'voidwalker','Call Pet':'beast','Tame Beast':'beast','Summon Succubus':'succubus','Summon Felhunter':'felhunter','Inferno':'infernal','Ritual of Doom':'doomguard'}[sp.SpellName]||'beast';const entry=(kind==='beast'?c.hunterPet?.entry:0)||sp.EffectMiscValue1||sp.EffectMiscValue2,raw=creatures[entry];const level=kind==='beast'?(c.hunterPet?.level||c.level):c.level;const source=table('pet_levelstats').find(r=>r.creature_entry===(kind==='beast'?1:entry)&&r.level===level);const maxHp=Math.round((source?.hp||raw?.MinLevelHealth||45+level*22));c.pet={id:c.id+'-pet',ownerId:c.id,petUnit:true,classId:0,level,entry,name:raw?.Name||sp.SpellName,kind,hp:maxHp,maxHp,mana:source?.mana||0,maxMana:source?.mana||0,armor:source?.armor||level*35,low:2+level*.7,high:4+level*1.1,swing:2000,position:c.position,positionY:(c.positionY||0)+2,nextSwing:s.clock+1000,nextAction:s.clock,nextPowerRegen:s.clock+2000,learned:[],equipment:{},talents:{},cooldowns:{},buffs:{},time:s.clock,spell:sp.Id,mode:'defensive',happiness:c.hunterPet?.happiness??166500,trainingPoints:c.hunterPet?.trainingPoints??(kind==='beast'?0:level*5),availableSkills:Object.values(table('petcreateinfo_spell').find(r=>r.entry===entry)||{}).slice(1).filter(id=>spells[id]),until:sp.durationMs?s.clock+sp.durationMs:null};c.pet.availableSkills=[...new Set([...c.pet.availableSkills,...(c.petLearnedSkills?.[entry]||[]),...(c.petAvailableSkills?.[entry]||[])])];c.pet.learned=[...new Set([...Object.values(table('petcreateinfo_spell').find(r=>r.entry===entry)||{}).slice(1).filter(id=>spells[id]),...(c.petLearnedSkills?.[entry]||[])])];if(kind==='beast'){const base=Math.floor((raw?.MeleeBaseAttackTime||2000)*level/2000);c.pet.swing=raw?.MeleeBaseAttackTime||2000;c.pet.low=base*.75;c.pet.high=base*1.125;c.pet.mana=c.pet.maxMana=0;c.pet.xp=c.hunterPet?.xp||0;c.pet.loyalty=c.hunterPet?.loyalty||1;initializePetProgression(s,c,c.pet,c.hunterPet||{});c.pet.learned=[...new Set([...c.pet.learned,...(c.hunterPet?.learned||[])])];c.pet.availableSkills=[...new Set([...c.pet.availableSkills,...(c.hunterPet?.availableSkills||[])])];initializeHunterPetSkills(s,c,c.pet,c.hunterPet||{});}refreshPetStats(c,c.pet,{heal:true});if(s.combat&&!s.combat.participantIds.includes(c.pet.id))s.combat.participantIds.push(c.pet.id);}
function creatureSpellIds(entry){const raw=creatures[entry],rows=table('creature_template_spells').filter(r=>(r.entry??r.Entry)===entry);return[raw?.Spell1,raw?.Spell2,raw?.Spell3,raw?.Spell4,...rows.flatMap(r=>Object.entries(r).filter(([k,v])=>/^spell\d/i.test(k)&&v).map(([,v])=>v))].filter(id=>spells[id]);}
export function createClassTotem(s,c,sp){const name=sp.SpellName;const element=/Searing|Magma|Fire Nova|Flametongue|Frost Resistance/.test(name)?'fire':/Healing|Mana|Cleansing|Fire Resistance/.test(name)?'water':/Grounding|Wind|Grace|Nature Resistance|Tranquil|Sentry/.test(name)?'air':'earth';const entry=[1,2,3].map(n=>sp['EffectMiscValue'+n]).find(v=>creatures[v]);c.totems??={};const hp=Math.max(1,sp.EffectBasePoints1+1);c.totems[element]={id:c.id+'-totem-'+element,totemUnit:true,petUnit:true,ownerId:c.id,classId:0,level:c.level,hp,maxHp:hp,mana:0,maxMana:0,armor:0,equipment:{},talents:{},cooldowns:{},learned:[],spell:sp.Id,name,entry,effects:creatureSpellIds(entry),until:s.clock+(sp.durationMs||120000),next:s.clock+2000,position:c.position,positionY:c.positionY||0};if(s.combat&&!s.combat.participantIds.includes(c.totems[element].id))s.combat.participantIds.push(c.totems[element].id);}
export function tickExtendedClassEffects(s,actors,api){for(const e of s.combat?.enemies||[])if(e.controlledBy){while(e.controlHeartbeatNext&&e.controlHeartbeatNext<s.clock){e.controlHeartbeatNext+=e.controlHeartbeatInterval;if(rng(s)<e.controlHeartbeatChance){e.controlUntil=s.clock;break;}}const owner=actors.find(a=>a.id===e.controlledBy&&a.hp>0);if(e.hp<=0||e.removed||e.controlUntil<=s.clock||!owner||spells[e.controlSpell]?.SpellName==='Mind Control'&&(!owner.cast?.controlChannel||owner.cast.target!==e.id)){delete e.controlledBy;e.controlUntil=0;e.lastControlEnd=s.clock;e.controlCast=null;}else{const victim=allLiving(s)[0];if(victim){if(e.controlCast){if(e.controlCast.until<=s.clock){const cast=e.controlCast;e.controlCast=null;genericEffects(s,owner,victim,enemySpellInfo(e,cast.spell),actors,api);}}else{const spell=creatureSpellIds(e.entry).map(id=>enemySpellInfo(e,id)).find(sp=>[1,2,3].some(n=>sp['Effect'+n]===2)&&sp.mana<=(e.mana||0)&&(e.controlCooldowns?.[sp.Id]||0)<=s.clock&&distance(e,victim)<=(sp.range||30));if(spell){e.mana-=spell.mana;e.controlCooldowns??={};e.controlCooldowns[spell.Id]=s.clock+Math.max(1500,spell.RecoveryTime||0);if(spell.castMs)e.controlCast={spell:spell.Id,until:s.clock+spell.castMs*(e.controlCastMultiplier||1)};else genericEffects(s,owner,victim,spell,actors,api);}else if(distance(e,victim)>5)moveToward(e,victim,5,s.clock);else if((e.nextControlledAttack||0)<=s.clock){e.nextControlledAttack=s.clock+e.swing*(e.controlAttackMultiplier||1);api.damage(s,owner,victim,roll(s,Math.floor(e.low),Math.ceil(e.high))*(1-armorReduction(victim.armor,e.level)),'控制 · '+e.name,1,{school:0,ownerId:owner.id});}}}}}

 s.flares=(s.flares||[]).filter(f=>f.until>s.clock);for(const f of s.flares)for(const e of allLiving(s))if(distance(f,e)<=f.radius){e.stealthed=false;e.invisible=false;}
 for(const area of s.groundEffects||[])if(area.extended){const caster=actors.find(a=>a.id===area.caster);while(caster&&area.next<=s.clock&&area.next<=area.until){for(const e of allLiving(s).filter(e=>distance(area,e)<=area.radius))damage(s,caster,e,area.amount,spells[area.spell],api,true);area.next+=area.interval;}}
 for(const c of actors.filter(a=>a.hp>0)){
 if(c.feignUntil&&c.feignUntil<=s.clock){c.feignUntil=0;c.stealthed=false;}
 tickPetProgression(s,c);
 if(c.pet?.until&&c.pet.until<=s.clock)c.pet.hp=0;const feed=c.pet?.feeding;if(feed){if(s.combat)c.pet.feeding=null;else{while(feed.next<=s.clock&&feed.next<=feed.until){c.pet.happiness=Math.min(1000000,(c.pet.happiness||0)+feed.amount);feed.next+=feed.interval;}if(feed.until<=s.clock)c.pet.feeding=null;}}
 if(c.abolish&&c.abolish.next<=s.clock&&c.abolish.until>=s.clock){dispelClassEffects(c,c.abolish.types,1,s);c.abolish.next+=5000;}
 for(const p of c.periodicClass||[]){const source=actors.find(a=>a.id===p.caster);while(source&&p.next<=s.clock&&p.next<=p.until){if(p.type===8||p.type===161)heal(s,source,c,p.amount,spells[p.spell],api);else c.mana=Math.min(stats(c).maxMana,c.mana+p.amount);p.next+=p.interval;}}c.periodicClass=(c.periodicClass||[]).filter(p=>p.until>s.clock);
 if(c.frenziedRegen&&c.frenziedRegen.next<=s.clock&&c.frenziedRegen.until>=s.clock){const use=Math.min(100,c.rage||0);c.rage-=use;heal(s,c,c,use/10*c.frenziedRegen.amount,spells[c.frenziedRegen.spell],api);c.frenziedRegen.next+=1000;}
 if(c.trap){const trap=c.trap;if(trap.until<=s.clock){c.trap=null;}else if(trap.armAt<=s.clock){const victim=allLiving(s).find(e=>distance(trap,e)<=5);if(victim){const sp=spellInfo(c,trap.spell),name=sp.SpellName;const triggerName={'Immolation Trap':'Immolation Trap Effect','Explosive Trap':'Explosive Trap Effect','Freezing Trap':'Freezing Trap Effect','Frost Trap':'Frost Trap Aura'}[name];const trigger=Object.values(spells).filter(p=>p.SpellName===triggerName&&p.SpellLevel<=c.level).sort((a,b)=>b.SpellLevel-a.SpellLevel)[0];if(trigger){for(const t of name==='Explosive Trap'||name==='Frost Trap'?allLiving(s).filter(e=>distance(trap,e)<=10):[victim])genericEffects(s,c,t,spellInfo(c,trigger.Id),actors,api);}c.trap=null;}}}
 for(const [element,t]of Object.entries(c.totems||{})){if(!extendedTotems.has(t.name))continue;if(t.hp<=0||t.until<=s.clock){delete c.totems[element];continue;}if(t.next>s.clock)continue;t.next+=2000;const friends=actors.filter(a=>a.hp>0&&distance(t,a)<=20),foes=allLiving(s).filter(e=>distance(t,e)<=20);if(t.name==='Tremor Totem'){for(const a of friends){a.auras=(a.auras||[]).filter(a=>![7,5,6].includes(a.type));a.polyUntil=0;}}else if(t.name.includes('Cleansing'))for(const a of friends)dispelClassEffects(a,[t.name.startsWith('Poison')?4:3],1,s);else if(t.name==='Grounding Totem'){for(const a of friends)a.groundingTotemOwner=c.id;}else if(t.name==='Stoneclaw Totem'){for(const e of foes){const procId=spells[(t.effects||[])[0]]?.EffectTriggerSpell1,value=spells[procId]?amount(c,spells[procId]):0;e.threat[t.id]=(e.threat[t.id]||0)+value;}}else if(t.name==='Earthbind Totem'){for(const e of foes)addCombatAura(e,{spell:t.spell,effect:1,type:33,amount:-50,until:s.clock+2500},s.clock);}else for(const id of t.effects||[]){if(t.name==='Windfury Totem'&&spells[id]?.SpellName==='Windfury Totem')continue;const effect={...spellInfo(c,id),durationMs:2500};const offensive=[1,2,3].some(n=>effect['Effect'+n]===2||effect['EffectApplyAuraName'+n]===3);for(const a of offensive?(t.name==='Searing Totem'?foes.slice(0,1):foes):friends){applyStatsBuff(s,c,a,effect);genericEffects(s,c,a,effect,actors,{...api,healAmount:(s,c,a,v)=>heal(s,c,a,v,spells[t.spell],api),damage:(s,c,victim,v,l,m,d)=>api.damage(s,c,victim,v,t.name||l,m,{...d,spellId:t.spell})},{periodic:true});}}if(t.name==='Fire Nova Totem')delete c.totems[element];}
}}
export function classIncoming(s,e,c,value,detail,api){const school=detail.school??spells[detail.spellId]?.School??0;if(schoolImmune(c,school,s.clock))return 0;if(school>0&&!detail.periodic&&c.groundingTotemOwner){const owner=(api.actors||[]).find(a=>a.id===c.groundingTotemOwner),totem=owner?.totems?.air;if(totem?.name==='Grounding Totem'&&totem.until>s.clock&&totem.hp>0){totem.hp=0;delete owner.totems.air;return 0;}}
 const sacrifice=c.sacrifice;if(sacrifice?.until>s.clock){const caster=api.actors?.find(a=>a.id===sacrifice.caster&&a.hp>0);if(caster&&caster!==c){const transfer=Math.min(value,sacrifice.amount,caster.hp);caster.hp-=transfer;value-=transfer;}}
 const shield=c.manaShield;if(school===0&&shield?.until>s.clock&&shield.amount>0){const absorbed=Math.min(value,shield.amount,(c.mana||0)/shield.multiplier);c.mana-=absorbed*shield.multiplier;shield.amount-=absorbed;value-=absorbed;}
 for(const a of activeAuras(c,s.clock))if(a.type===14&&(!a.misc||a.misc&(1<<school)))value=Math.max(0,value+a.amount);
 for(const a of activeAuras(c,s.clock))if(a.type===87&&(a.misc&(1<<school)))value*=1+a.amount/100;
 if(value>0&&!detail.periodic&&!detail.spellId){const inner=c.classBuffs?.find(b=>b.name==='Inner Fire'&&b.until>s.clock&&b.charges>0);if(inner&&!--inner.charges)inner.until=s.clock;const retaliation=activeAuras(c,s.clock).find(a=>spells[a.spell]?.SpellName==='Retaliation'&&a.charges>0);if(retaliation&&c.lastRetaliation!==s.clock){c.lastRetaliation=s.clock;retaliation.charges--;damage(s,c,e,weaponDamage(s,c)*(1-armorReduction(e.armor,c.level)),spells[retaliation.spell],api);}}
 const reactive=c.reactiveClass;if(value>0&&!detail.periodic&&(spells[reactive?.spell]?.SpellName!=='Feedback'||detail.spellId)&&reactive?.until>s.clock&&reactive.charges>0&&reactive.next<=s.clock){reactive.charges--;reactive.next=s.clock+3000;let trigger=spellInfo(c,reactive.trigger);if([28598,28376].includes(trigger?.Id)){const parent=spells[reactive.spell],proc=Object.values(spells).find(p=>p.SpellName===parent.SpellName&&p.Rank1===parent.Rank1&&p.Effect1===2);if(proc)trigger=spellInfo(c,proc.Id);}if(['Aspect of the Cheetah','Aspect of the Pack'].includes(spells[reactive.spell]?.SpellName)){genericEffects(s,c,c,trigger,[c],api);return Math.max(0,value);}if(trigger?.Id===26545)damage(s,c,e,amount(c,spells[reactive.spell]),spells[reactive.spell],api);else if(trigger)genericEffects(s,c,e,trigger,[c],{...api,damage:(s,c,t,v,l,m,d)=>api.damage(s,c,t,v,spells[reactive.spell]?.SpellName||l,m,{...d,spellId:reactive.spell})});}
 if(c.soulLink&&c.pet?.hp>0){const transfer=Math.min(c.pet.hp,value*.3);c.pet.hp-=transfer;value-=transfer;}
 return Math.max(0,value);
}
export function classMeleeProc(s,c,target,api,slot=16){const totem=c.totemWeaponEnchant;if(slot===16&&totem?.until>s.clock&&totem.weaponUid===c.equipment?.[16]?.uid&&!(c.weaponEnchants?.[16]?.until>s.clock||c.weaponEnchant?.until>s.clock)){const proc=spells[totem.trigger];if(proc&&totem.name.startsWith('Windfury')&&rng(s)<totem.chance){const speed=(items[c.equipment[16]?.id]?.delay||2000)/1000;damage(s,c,target,(weaponDamage(s,c)+amount(c,proc)*totem.bonus*speed/14)*(1-armorReduction(effectiveArmor(target,s.clock),c.level)),proc,api);}else if(proc&&totem.name.startsWith('Flametongue'))damage(s,c,target,amount(c,proc)*.01*(items[c.equipment[16]?.id]?.delay||2000)/1000*totem.bonus,{...proc,castMs:0},api);}const j=target.judgement;if(j?.until>s.clock){if(j.caster===c.id)j.until=s.clock+10000;if(rng(s)<.5){if(j.name==='Seal of Light')heal(s,c,c,j.amount,spells[j.spell],api);if(j.name==='Seal of Wisdom')c.mana=Math.min(stats(c).maxMana,c.mana+j.amount);}}const enchant=c.weaponEnchants?.[slot]||(slot===16?c.weaponEnchant:null);if(enchant?.until>s.clock&&(!enchant.weaponUid||enchant.weaponUid===c.equipment?.[slot]?.uid)&&(enchant.charges==null||enchant.charges>0)){const sp=spellInfo(c,enchant.spell),name=enchant.name,speed=(items[c.equipment[slot]?.id]?.delay||2000)/1000;let trigger=spells[enchant.trigger];if(!trigger){const candidates=Object.values(spells).filter(p=>p.SpellName===name.replace(' Weapon',' Attack')&&p.SpellLevel<=c.level);trigger=candidates.sort((a,b)=>b.SpellLevel-a.SpellLevel)[0];}
 if(name==='Windfury Weapon'){if((c.windfuryReady||0)<=s.clock&&rng(s)<.2){c.windfuryReady=s.clock+3000;for(let n=0;n<2;n++)damage(s,c,target,(weaponDamage(s,c)+(trigger?amount(c,trigger):0)*speed/14)*(enchant.bonus||1)*(1-armorReduction(effectiveArmor(target,s.clock),c.level)),sp,api);}}
 else if(name==='Flametongue Weapon'&&trigger)damage(s,c,target,(amount(c,trigger)*.01*speed+stats(c).spellPower*.0385*speed)*(enchant.bonus||1),sp,api);
 else if(trigger&&rng(s)<(name.includes('Poison')?(enchant.chance||.2):Math.min(1,9*speed/60))){genericEffects(s,c,target,spellInfo(c,trigger.Id),[c],api,{coefficient:enchant.bonus||1});if(enchant.charges!=null)enchant.charges--;}}
 const seal=spells[c.seal?.spell];if(c.seal?.until>s.clock&&seal&&extendedSeals.has(seal.SpellName)){const name=seal.SpellName;if(name==='Seal of Command'&&rng(s)<Math.min(1,7*(items[c.equipment[16]?.id]?.delay||2000)/60000))damage(s,c,target,weaponDamage(s,c)*.7,seal,api);if(name==='Seal of Justice'&&rng(s)<.2)target.stunUntil=s.clock+2000;if(name==='Seal of Light'&&rng(s)<.5)heal(s,c,c,amount(c,sealTrigger(c,seal)),seal,api);if(name==='Seal of Wisdom'&&rng(s)<.5)c.mana=Math.min(stats(c).maxMana,c.mana+amount(c,sealTrigger(c,seal)));}
}

export function classJudgement(s,c,target,sp,actors,api){
 const seal=spells[c.seal?.spell];if(!seal||seal.SpellName==='Seal of Righteousness')return false;c.seal=null;
 if(api.lands&&!api.lands(s,c,target,sp))return true;const slot=[1,2,3].find(n=>seal['EffectApplyAuraName'+n]===4&&seal['EffectBasePoints'+n]>0),id=slot?seal['EffectBasePoints'+slot]+1:0,judgement=spells[id];if(!judgement)return true;
 if(seal.SpellName==='Seal of Command'){const hit=Object.values(spells).find(p=>p.SpellName==='Judgement of Command'&&p.Rank1===seal.Rank1&&p.Effect1===2);if(hit)genericEffects(s,c,target,spellInfo(c,hit.Id),actors,api);}
 else if(seal.SpellName==='Seal of Light'||seal.SpellName==='Seal of Wisdom'){const trigger=Object.values(spells).find(p=>p.SpellName===judgement.SpellName&&p.Rank1===judgement.Rank1&&p.Effect1===(seal.SpellName==='Seal of Light'?10:30));target.judgement={name:seal.SpellName,spell:id,caster:c.id,amount:trigger?amount(c,trigger):amount(c,sealTrigger(c,seal)),until:s.clock+10000};}
 else genericEffects(s,c,target,spellInfo(c,id),actors,api);return true;
}

export function applyClassWeaponEnchant(s,c,sp,slot=16){
 if(sp.Effect1!==54||!classEnchantments[sp.EffectMiscValue1])throw new Error('This item has no weapon enchant effect');
 const weapon=c.equipment?.[slot];if(![16,17].includes(slot)||!items[weapon?.id]||items[weapon.id].class!==2)throw new Error('Equip a weapon first');
 const enchant=classEnchantments[sp.EffectMiscValue1],trigger=spells[enchant.effects[0]?.spellId],seconds=sp.EffectBasePoints1>0?sp.EffectBasePoints1+1:3600;
 const state={spell:sp.Id,name:trigger?.SpellName||sp.SpellName,until:s.clock+seconds*1000,charges:null,enchant:enchant.id,trigger:trigger?.Id,weaponUid:weapon.uid,slot,chance:talentSpellValue(c,sp,18,enchant.effects[0]?.amount||20)/100,bonus:talentSpellValue(c,sp,3,1)};
 c.weaponEnchants??={};c.weaponEnchants[slot]=state;if(slot===16)c.weaponEnchant=state;return true;
}

export function petCommand(s,a){
 const pet=s.pet;if(!pet)throw new Error('Summon a pet first');
 if(['passive','defensive','aggressive','follow','stay'].includes(a.command)){pet.mode=a.command;pet.targetId=null;return;}
 if(a.command==='attack'){const target=s.combat?.enemies.find(e=>e.id===a.targetId&&aliveEnemy(e));if(!target)throw new Error('Choose a living enemy');pet.targetId=target.id;pet.mode='attack';return;}
 if(a.command==='abandon'){if(s.combat||s.classId!==3)throw new Error('Leave combat before abandoning a hunter pet');s.pet=null;s.hunterPet=null;return;}
 if(a.command==='feed'){if(!s.learned.includes(6991))throw new Error('Learn Feed Pet first');if(s.classId!==3||pet.hp<=0)throw new Error('A living hunter pet is required');const item=items[a.itemId],mask=petReference.families[creatures[pet.entry]?.Family]?.petFoodMask||0;if(!item?.FoodType||!(mask&(1<<(item.FoodType-1))))throw new Error('This pet cannot eat that food');if(s.combat)throw new Error('Leave combat before feeding');const level=item.ItemLevel||0,benefit=pet.level<=level+5?35000:pet.level<=level+10?17000:pet.level<=level+14?8000:0;if(!benefit)throw new Error('The food level is too low');consume(s,a.itemId,1);const effect=spellInfo(s,1539);pet.feeding={amount:benefit,next:s.clock+effect.EffectAmplitude1,interval:effect.EffectAmplitude1,until:s.clock+effect.durationMs};return;}
 if(a.command==='train'){const reason=petTrainingReason(s,pet,a.spellId);if(reason)throw new Error(reason);if(s.classId===3&&!s.learned.includes(5149))throw new Error('Learn Beast Training first');const spell=spells[a.spellId];if(!spell||!(pet.availableSkills||[]).includes(a.spellId)||spell.SpellLevel>pet.level)throw new Error('This pet has not acquired that training');if((pet.learned||[]).includes(spell.Id))return;const cost=petTrainingCost(pet,spell.Id);if(cost<0)throw new Error('A higher rank is already trained');if(cost>0&&(pet.trainingPoints||0)<cost)throw new Error('Not enough pet training points');pet.trainingPoints-=cost;pet.learned??=[];pet.learned.push(spell.Id);s.petLearnedSkills??={};s.petLearnedSkills[pet.entry]=[...new Set([...(s.petLearnedSkills[pet.entry]||[]),spell.Id])];refreshPetStats(s,pet);saveHunterPet(s,s);return;}
 throw new Error('Unknown pet command');
}

export function petSpellTick(s,pet,owner,target,actors,api){
 if(pet.nextPowerRegen<=s.clock){pet.mana=Math.min(pet.maxMana,pet.mana+Math.max(1,pet.maxMana*.05));pet.focus=Math.min(100,(pet.focus??100)+24);pet.nextPowerRegen=s.clock+2000;}
 if(pet.cast){if(pet.cast.until>s.clock)return true;const sp=spellInfo(pet,pet.cast.spell);pet.cast=null;genericEffects(s,pet,target,sp,actors,api);observeHunterPetSkill(s,owner,pet,sp.Id);return true;}
 if(pet.nextAction>s.clock)return false;
 const best=new Map();for(const id of pet.learned||[]){const sp=spells[id];if(sp&&(!best.has(sp.SpellName)||best.get(sp.SpellName).SpellLevel<sp.SpellLevel))best.set(sp.SpellName,sp);}
 for(const raw of best.values()){const sp=spellInfo(pet,raw.Id);if((pet.cooldowns[sp.Id]||0)>s.clock)continue;const pool=sp.PowerType===2?'focus':'mana';if((pet[pool]??(pool==='focus'?100:0))<sp.mana)continue;
  const self=[1,2,3].some(n=>sp['EffectImplicitTargetA'+n]===1)&&![1,2,3].some(n=>sp['EffectImplicitTargetA'+n]===6),recipient=self?pet:target;
  if(!self&&distance(pet,target)>(sp.range||5))continue;
  if(['Spell Lock','Pummel'].includes(sp.SpellName)&&!target.cast)continue;
  if(sp.SpellName==='Sacrifice'&&owner.hp>stats(owner).maxHp*.3)continue;
  if(sp.SpellName==='Devour Magic'&&!pendingDispel(target,[1]))continue;
  if(self&&buffActive(pet,sp.SpellName,s.clock))continue;
  pet[pool]=(pet[pool]??100)-sp.mana;pet.cooldowns[sp.Id]=s.clock+(sp.cooldownMs||1500);pet.nextAction=s.clock+Math.max(1500,sp.castMs);
  if(sp.SpellName==='Sacrifice'){genericEffects(s,pet,owner,sp,actors,api);pet.hp=0;return true;}
  if(sp.castMs){pet.cast={spell:sp.Id,target:recipient.id,until:s.clock+sp.castMs};return true;}
  if(self)applyStatsBuff(s,pet,pet,sp);genericEffects(s,pet,recipient,sp,actors,api);observeHunterPetSkill(s,owner,pet,sp.Id);return true;
 }
 return false;
}

export function tameClassPet(s,c,target,sp){if(c.pet||!target||target.hp<=0||!(creatures[target.entry]?.CreatureTypeFlags&1)||creatures[target.entry]?.CreatureType!==1||target.level>c.level)return false;c.hunterPet={entry:target.entry,name:target.name,level:target.level};summonClassPet(s,c,{...sp,SpellName:'Call Pet',EffectMiscValue1:target.entry,durationMs:0});c.pet.level=target.level;c.pet.name=target.name;c.pet.spell=883;target.removed=true;target.controlledBy=null;target.cast=null;return true;}

export function gainHunterPetXp(s,c,xp){const pet=c.pet;if(!pet||pet.kind!=='beast'||pet.hp<=0||xp<=0)return;pet.xp=(pet.xp||0)+Math.floor(xp);while(pet.level<Math.min(60,c.level)&&pet.xp>=Math.floor(xpTable[pet.level].xp_for_next_level/4)){pet.xp-=Math.floor(xpTable[pet.level].xp_for_next_level/4);pet.level++;const source=table('pet_levelstats').find(r=>r.creature_entry===1&&r.level===pet.level);pet.maxHp=source.hp;pet.hp=pet.maxHp;pet.armor=source.armor;const base=Math.floor(pet.swing*pet.level/2000);pet.low=base*.75;pet.high=base*1.125;pet.trainingPoints=(pet.trainingPoints||0)+(pet.loyalty||1)-1;refreshPetStats(c,pet,{heal:true});}if(pet.level>=c.level)pet.xp=0;gainPetLoyaltyXp(s,c,xp);saveHunterPet(s,c);}
