import {talents,spells,items,table,preciseSpellFamilyFlags} from './catalog.js';
import {racialModifiers} from './racial-effects.js';
import {castTimeMultiplier} from '../../../sim-core/src/combat-auras.js';
import {spellAttributesEx3} from '../../../sim-core/src/spell-program.js';

export function ranks(c){const result={};for(const[id,value]of Object.entries(c.talents||{})){const t=talents[id],rank=Math.min(t?.maxRank||0,Math.max(0,Math.floor(value)));if(t&&t.classId===c.classId&&rank)result[t.name]=rank;}return result;}
export function selectedTalentSpells(c){return Object.entries(c.talents||{}).flatMap(([id,value])=>{const t=talents[id],rank=Math.min(t?.maxRank||0,Math.max(0,Math.floor(value))),sp=t&&t.classId===c.classId&&spells[t.ranks[rank-1]];return sp?[{talent:t,rank,spell:sp}]:[];});}
const n=(r,key)=>r[key]||0;
const mask=x=>{try{return BigInt(x||0);}catch{return 0n;}};
let affectRows,talentRoots;
function modifierMetadata(){affectRows??=new Map(table('spell_affect').map(r=>[`${r.entry}:${r.effectId+1}`,r.SpellFamilyMask]));talentRoots??=new Map(Object.values(talents).flatMap(t=>t.ranks.map(id=>[id,t.ranks[0]])));}
export function talentAffectsSpell(aura,index,spell){
 modifierMetadata();
 if(!spell||aura.SpellFamilyName&&aura.SpellFamilyName!==spell.SpellFamilyName)return false;
 const bits=mask(affectRows.get(`${aura.Id}:${index}`)??affectRows.get(`${talentRoots.get(aura.Id)}:${index}`)??aura['EffectItemType'+index]);
 return bits!==0n&&(bits&mask(preciseSpellFamilyFlags[spell.Id]??spell.SpellFamilyFlags))!==0n;
}
function equippedFor(c,sp){
 if(sp.Stances){const stance={cat:1,bear:5,direbear:8,moonkin:31}[c.form]||{battle:17,defensive:18,berserker:19}[c.stance]||(c.classId===1?(c.learned?.includes(71)?18:17):0);if(!stance||!(mask(sp.Stances)&1n<<BigInt(stance-1)))return false;}
 if(sp.EquippedItemClass===-1||sp.EquippedItemClass==null)return true;
 return [16,17,18].some(slot=>{const item=items[c.equipment?.[slot]?.id];return item&&item.class===sp.EquippedItemClass&&(!sp.EquippedItemSubClassMask||(mask(sp.EquippedItemSubClassMask)&1n<<BigInt(item.subclass)))&&(!sp.EquippedItemInventoryTypeMask||(mask(sp.EquippedItemInventoryTypeMask)&1n<<BigInt(item.InventoryType)));});
}
export function passiveTalentSpells(c){return [...selectedTalentSpells(c).filter(({spell})=>(spell.Attributes&64)&&equippedFor(c,spell)).map(x=>x.spell),...(c.talentBuffs||[]).filter(b=>b.until>(c.time||0)).map(b=>spells[b.spell]).filter(Boolean)];}
/** DBC SPELLMOD operations. Flat modifiers add before percentages, once per learned rank. */
export function talentSpellValue(c,sp,operation,value){
 if(sp?.AttributesEx3&spellAttributesEx3.IGNORE_CASTER_MODIFIERS)return value;
 let flat=0,percent=0;
 for(const aura of passiveTalentSpells(c))for(let i=1;i<=3;i++){const type=aura['EffectApplyAuraName'+i];if(![107,108].includes(type)||aura['EffectMiscValue'+i]!==operation||!talentAffectsSpell(aura,i,sp))continue;const amount=aura['EffectBasePoints'+i]+1;if(type===107)flat+=amount;else percent+=amount;}
 let result=(value+flat)*(1+percent/100);
 if(c.talentProcs?.amplifyCurse?.until>(c.time||0)){if(operation===8&&['Curse of Agony','Curse of Weakness'].includes(sp?.SpellName))result*=1.5;if(operation===12&&sp?.SpellName==='Curse of Exhaustion')result-=20;}
 return result;
}
export function talentModifiers(c){
 const r=ranks(c),race=c.raceId||1;
 const result={healthPct:0,manaPct:0,armorPct:0,itemArmorPct:0,intPct:race===7?.05:0,strPct:0,agiPct:0,staPct:0,spiPct:race===1?.05:0,crit:0,rangedCrit:0,spellCrit:0,dodge:race===4?.01:0,parry:0,hit:0,spellHit:0,damagePct:0,physicalPct:0,healingPct:0,threatPct:0,regenCasting:0,attackPowerPct:0,rangedAttackPowerPct:0,attackPowerFlat:0,armorFromIntPct:0,spellPowerFromSpiritPct:0,healingFromSpiritPct:0,energyFlat:0,block:0,blockValuePct:0,defense:0,weaponSkill:0,movementPct:0,meleeHastePct:0};
 if(race===6)result.healthPct=.05;
 for(const sp of passiveTalentSpells(c))for(let i=1;i<=3;i++){
  const aura=sp['EffectApplyAuraName'+i],misc=sp['EffectMiscValue'+i],amount=sp['EffectBasePoints'+i]+1,pct=amount/100;
  if(aura===137){const key=['str','agi','sta','int','spi'][misc];if(key)result[key+'Pct']+=pct;else if(misc===-1)for(const k of ['str','agi','sta','int','spi'])result[k+'Pct']+=pct;}
  const field={47:'parry',49:'dodge',51:'block',52:'crit',54:'hit',55:'spellHit',132:'manaPct',133:'healthPct',134:'regenCasting',142:'itemArmorPct',150:'blockValuePct',166:'attackPowerPct',167:'rangedAttackPowerPct',174:'spellPowerFromSpiritPct',175:'healingFromSpiritPct',182:'armorFromIntPct',31:'movementPct',138:'meleeHastePct'}[aura];
  if(field){const key=field==='crit'&&sp.EquippedItemClass===2&&(sp.EquippedItemSubClassMask&327692)?'rangedCrit':field;result[key]+=pct;}
  if(aura===35&&misc===3)result.energyFlat+=amount;
  if(aura===98&&misc===95)result.defense+=amount;
  if(aura===30)result.weaponSkill=Math.max(result.weaponSkill,amount);
  if(aura===79&&misc===1)result.physicalPct+=pct;
  if(aura===101&&misc&1)result.armorPct+=pct;
 }
 // Dummy auras with form-dependent effects are implemented by the original core in scripts.
 if(c.form==='bear'||c.form==='direbear')result.staPct+=.04*n(r,'Heart of the Wild');
 if(c.form==='cat')result.strPct+=.04*n(r,'Heart of the Wild');
 if(['bear','direbear','cat'].includes(c.form)){result.attackPowerFlat+=c.level*.5*n(r,'Predatory Strikes');result.crit+=.03*n(r,'Leader of the Pack');}
 if(c.form==='moonkin')result.spellCrit+=.03;
 result.petHealthPct=.03*(n(r,'Endurance Training')+n(r,'Fel Stamina'));result.petManaPct=.03*n(r,'Fel Intellect');result.petArmorPct=c.classId===3?.1*n(r,'Thick Hide'):0;result.petDamagePct=.04*(n(r,'Unleashed Fury')+n(r,'Unholy Power'));result.petCrit=.03*n(r,'Ferocity');
 if(c.racialBuff?.kind==='stoneform'&&c.racialBuff.until>(c.time||0))result.armorPct+=.1;
 if(c.spiritTapUntil>(c.time||0)){result.spiPct+=1;result.regenCasting+=.5;}
 for(const p of Object.values(c.talentProcs||{})){if(p.until<=(c.time||0))continue;for(const [key,value]of Object.entries(p.stats||{}))result[key]=(result[key]||0)+value;}
 const racial=racialModifiers(c);result.meleeHastePct+=racial.meleeHastePct;result.castHastePct=racial.castHastePct;result.resistances=racial.resistances;result.stealthLevel=racial.stealthLevel;result.stealthDetection=racial.stealthDetection;
 return result;
}
export function modifySpell(c,sp,info){
 const changed={...info};for(const[key,operation]of Object.entries({mana:14,castMs:10,cooldownMs:11,range:5,radius:6,durationMs:1}))changed[key]=Math.max(0,talentSpellValue(c,sp,operation,info[key]||0));
 // A cooldown modifier applies to each populated recovery clock, not to an
 // artificial maximum that loses the shared category's identity.
 for(const key of ['spellCooldownMs','categoryCooldownMs'])changed[key]=info[key]>0?Math.max(0,talentSpellValue(c,sp,11,info[key])):0;
 const p=c.talentProcs||{},now=c.time||0;
 if(p.clearcasting?.until>now)changed.mana=0;
 if(p.nightfall?.until>now&&sp.SpellName==='Shadow Bolt')changed.castMs=0;
 if(p.naturesGrace?.until>now)changed.castMs=Math.max(0,changed.castMs-500);
 if(p.presenceOfMind?.until>now&&changed.castMs<=10000)changed.castMs=0;
 if(p.naturesSwiftness?.until>now&&sp.School===3)changed.castMs=0;
 if(p.elementalMastery?.until>now&&[2,3,4].includes(sp.School))changed.mana=0;
 if(p.innerFocus?.until>now)changed.mana=0;
 if(p.spiritOfRedemption?.until>now)changed.mana=0;
 if(p.felDomination?.until>now&&sp.SpellName.startsWith('Summon ')){changed.mana*=.5;changed.castMs=Math.max(0,changed.castMs-5500);}
 changed.castMs*=castTimeMultiplier(c,c.time||0);changed.castMs/=1+racialModifiers(c).castHastePct;changed.mana=Math.floor(changed.mana);return changed;
}
export function abilityDamageMultiplier(c,sp,target,periodic=false){
 const r=ranks(c),school=sp?.School||0;let mult=1;
 if(sp){mult=talentSpellValue(c,sp,periodic?22:0,mult);mult=talentSpellValue(c,sp,8,mult);}
 if(school===0)mult*=1+talentModifiers(c).physicalPct;
 for(const aura of passiveTalentSpells(c))for(let i=1;i<=3;i++){const type=aura['EffectApplyAuraName'+i],misc=aura['EffectMiscValue'+i];if(type===79&&misc!==1&&(misc&(1<<school))&&(aura.EquippedItemClass!==2||sp?.DmgClass===3||sp?.SpellName==='Auto Shot'||sp?.SpellName==='Shoot'))mult*=1+(aura['EffectBasePoints'+i]+1)/100;if(type===168&&target?.creatureType&&(misc&(1<<(target.creatureType-1))))mult*=1+(aura['EffectBasePoints'+i]+1)/100;}
 if(target?.creatureType===1&&(c.raceId||1)===8)mult*=1.05;
 if(c.form==='shadow'&&school===5)mult*=1.15;
 if(c.talentProcs?.vengeance?.until>(c.time||0)&&[0,1].includes(school))mult*=1+.03*n(r,'Vengeance');
 if(c.talentProcs?.enrage?.until>(c.time||0)&&school===0)mult*=1+.05*n(r,'Enrage');
 if(c.talentProcs?.soulLink?.until>(c.time||0)&&c.pet?.hp>0)mult*=1.03;
 const sacrifice=c.talentProcs?.demonicSacrifice;
 if(sacrifice?.until>(c.time||0)&&(sacrifice.kind==='imp'&&school===2||sacrifice.kind==='succubus'&&school===5))mult*=1.15;
 if(c.pet?.hp>0&&c.pet.kind==='succubus')mult*=1+.02*n(r,'Master Demonologist');
 for(const aura of target?.auras||[])if(aura.until>(c.time||0)&&aura.type===87&&(aura.misc&(1<<school)))mult*=1+aura.amount/100;
 return mult;
}
export function spellCritBonus(c,sp,target){let value=talentSpellValue(c,sp,7,0)/100;for(const aura of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(aura['EffectApplyAuraName'+i]===71&&(aura['EffectMiscValue'+i]&(1<<sp.School)))value+=(aura['EffectBasePoints'+i]+1)/100;const p=c.talentProcs||{},now=c.time||0,active=key=>!!sp.talentCast?.procs?.[key]||p[key]?.until>now;if(active('elementalMastery')&&[2,3,4].includes(sp.School)||active('coldBlood')||active('divineFavor')&&sp.School===1)value+=1;if(active('innerFocus'))value+=.25;if(p.combustion?.until>now&&sp.School===2)value+=p.combustion.stacks*.1;if(active('remorseless')&&['Sinister Strike','Backstab','Ambush','Ghostly Strike'].includes(sp.SpellName))value+=(sp.talentCast?.procs?.remorseless||p.remorseless).crit;if(target?.frozenUntil>now||target?.auras?.some(a=>a.type===26&&a.until>now&&spells[a.spell]?.School===4))value+=.1*(ranks(c).Shatter||0);for(const a of target?.auras||[])if(a.until>now&&a.type===179&&(a.misc&(1<<sp.School)))value+=a.amount/100;return value;}
export function healingMultiplier(c,sp,target){let mult=talentSpellValue(c,sp,8,1);for(const aura of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(aura['EffectApplyAuraName'+i]===136)mult*=1+(aura['EffectBasePoints'+i]+1)/100;if(sp.SpellName==='Healing Wave'&&target?.talentProcs?.healingWay?.until>(c.time||0))mult*=1+.06*target.talentProcs.healingWay.stacks;return mult;}
export function supportedTalentEffectDescription(t){return t.rankEffects?.[0]?.descriptionEn||spells[t.ranks?.[0]]?.SpellName||t.name;}

export function talentControlResistance(c,mechanic){let resist=0;for(const sp of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(sp['EffectApplyAuraName'+i]===117&&sp['EffectMiscValue'+i]===mechanic)resist+=(sp['EffectBasePoints'+i]+1)/100;return Math.min(1,resist);}
export function talentOffhandMultiplier(c){let pct=0;for(const sp of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(sp['EffectApplyAuraName'+i]===122)pct+=sp['EffectBasePoints'+i]+1;return 1+pct/100;}
export function talentSchoolThreat(c,school){let pct=0;for(const sp of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(sp['EffectApplyAuraName'+i]===10&&(sp['EffectMiscValue'+i]&(1<<school)))pct+=sp['EffectBasePoints'+i]+1;const r=ranks(c);if(c.pet?.hp>0&&c.pet.kind==='imp')pct-=4*(r['Master Demonologist']||0);if(c.petUnit&&c.kind==='imp')pct-=4*(c.ownerMasterDemonologist||0);return Math.max(0,1+pct/100);}
export function talentArmorPenetration(c,school=0){let amount=0;for(const sp of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(sp['EffectApplyAuraName'+i]===123&&(sp['EffectMiscValue'+i]&(1<<school)))amount-=sp['EffectBasePoints'+i]+1;if(school===0)amount+=(ranks(c)['Serrated Blades']||0)*(c.level||1)*1.67;return Math.max(0,amount);}
export function talentPetModifiers(c,pet){const r=ranks(c),base=talentModifiers(c);let damage=base.petDamagePct,crit=base.petCrit,haste=0;
 if(pet?.kind==='imp')damage+=.1*(r['Improved Imp']||0);if(pet?.kind==='succubus')damage+=.1*(r['Improved Succubus']||0)+.02*(r['Master Demonologist']||0);
 for(const p of Object.values(pet?.talentProcs||{}))if(p.until>(c.time||0)){damage+=p.stats?.damagePct||0;haste+=p.stats?.meleeHastePct||0;}
 return {damage:1+damage,crit,haste,health:1+base.petHealthPct,armor:1+base.petArmorPct,mana:1+base.petManaPct,speed:1+.3*(r['Bestial Swiftness']||0),focusRegen:1+.1*(r['Bestial Discipline']||0),threat:pet?.kind==='voidwalker'?1+.1*(r['Improved Voidwalker']||0):1};
}

export function talentCombatDefense(c){const result={stealthLevel:0,stealthDetection:0,meleeCritReduction:0,rangedCritReduction:0,rangedAvoidance:0,spellAvoidance:0,resistances:{}};for(const sp of passiveTalentSpells(c))for(let i=1;i<=3;i++){const aura=sp['EffectApplyAuraName'+i],amount=sp['EffectBasePoints'+i]+1,misc=sp['EffectMiscValue'+i];if(aura===154)result.stealthLevel+=amount;if(aura===17)result.stealthDetection+=amount;if(aura===187)result.meleeCritReduction-=amount/100;if(aura===188)result.rangedCritReduction-=amount/100;if(aura===185)result.rangedAvoidance-=amount/100;if(aura===186)result.spellAvoidance-=amount/100;if(aura===22)for(let school=1;school<=6;school++)if(misc&(1<<school))result.resistances[school]=(result.resistances[school]||0)+amount;}
 const racial=racialModifiers(c);result.stealthLevel+=racial.stealthLevel;result.stealthDetection+=racial.stealthDetection;for(const [school,value]of Object.entries(racial.resistances))result.resistances[school]=(result.resistances[school]||0)+value;const rank=ranks(c)['Master Demonologist']||0;if(c.petUnit&&c.kind==='felhunter')for(let school=1;school<=6;school++)result.resistances[school]=(result.resistances[school]||0)+(c.level||1)*(c.ownerMasterDemonologist||0)/5;if(c.pet?.hp>0&&c.pet.kind==='felhunter')for(let school=1;school<=6;school++)result.resistances[school]=(result.resistances[school]||0)+(c.level||1)*rank/5;return result;}

