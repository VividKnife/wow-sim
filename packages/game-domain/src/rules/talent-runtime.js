import {pvpTriggeredControl} from './pvp-runtime.js';
import {applySpellAura} from './spell-aura-lifecycle.js';
import {resetSpellCooldowns} from './spell-timing.js';
import {spells,lookup,talents,items} from './catalog.js';
import {ranks,selectedTalentSpells,passiveTalentSpells,talentSpellValue,talentModifiers} from './talent-effects.js';

const duration=sp=>lookup.SpellDuration[sp?.DurationIndex]?.baseMs||0;
function random(s,api){if(api.rng)return api.rng(s);let x=s.rngState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rngState=x>>>0;return s.rngState/4294967296;}
function proc(c,key,until,extra={}){c.talentProcs??={};return c.talentProcs[key]={until,token:c.talentProcSequence=(c.talentProcSequence||0)+1,...extra};}
function heal(s,c,target,amount,spell,api){if(api.healAmount)api.healAmount(s,c,target,amount,spell);else if(target?.hp>0)target.hp=Math.min(api.stats?.(target)?.maxHp||target.maxHp||target.hp,Math.round(target.hp+amount));}
function restore(c,pool,amount,api){const max=pool==='rage'?1000:pool==='energy'?100+talentModifiers(c).energyFlat:api.stats?.(c)?.maxMana||c.maxMana||Infinity;c[pool]=Math.min(max,Math.max(0,(c[pool]||0)+Math.round(amount)));}
function damage(s,c,target,amount,spell,api,school=spells[spell]?.School||0){if(target?.hp>0&&api.damage)api.damage(s,c,target,amount,spells[spell]?.SpellName||'天赋',1,{spellId:spell,school,talentProc:true});}
function dot(s,c,target,amount,spell,api,interval=3000,ticks=4){if(!target)return;target.dots??=[];target.dots.push({caster:c.id,spellId:spell,school:spells[spell]?.School||0,amount:Math.round(amount),next:s.clock+interval,interval,remaining:ticks,label:spells[spell]?.SpellName||'天赋',talentProc:true});}
function armorBuff(s,target,pct,spell){target.classBuffs??=[];target.classBuffs=target.classBuffs.filter(b=>b.name!=='talent-armor');target.classBuffs.push({name:'talent-armor',spell,until:s.clock+15000,armorPct:pct,stats:{}});}
export const talentActiveNames=new Set(['Presence of Mind',"Nature's Swiftness",'Elemental Mastery','Inner Focus','Cold Blood','Divine Favor','Arcane Power','Power Infusion','Combustion','Preparation','Cold Snap','Last Stand','Death Wish','Sweeping Strikes','Adrenaline Rush','Blade Flurry','Premeditation','Bestial Wrath','Intimidation','Trueshot Aura','Moonkin Form','Shadowform','Demonic Sacrifice','Soul Link','Dark Pact','Swiftmend','Lightwell','Fel Domination','Amplify Curse',"Nature's Grasp",'Omen of Clarity']);
export function executeTalentActive(s,c,target,sp,api={}){
 const name=sp?.SpellName;if(!talentActiveNames.has(name))return false;const r=ranks(c),now=s.clock;
 const oneShot={'Presence of Mind':'presenceOfMind',"Nature's Swiftness":'naturesSwiftness','Elemental Mastery':'elementalMastery','Inner Focus':'innerFocus','Cold Blood':'coldBlood','Divine Favor':'divineFavor','Fel Domination':'felDomination','Amplify Curse':'amplifyCurse'};
 if(oneShot[name]){proc(c,oneShot[name],now+180000);return true;}
 if(name==='Preparation'||name==='Cold Snap'){resetSpellCooldowns(c,spell=>spell&&spell.Id!==sp.Id&&(name==='Preparation'?spell.SpellFamilyName===8:spell.School===4));return true;}
 if(name==='Premeditation'){c.combo=Math.min(5,(c.comboTarget===target?.id?c.combo||0:0)+2);c.comboTarget=target?.id;proc(c,'premeditation',now+10000,{points:2});return true;}
 if(name==='Swiftmend'){const hot=(target?.hots||[]).filter(h=>h.caster===c.id&&h.until>now&&['Rejuvenation','Regrowth'].includes(h.name)).sort((a,b)=>a.until-b.until)[0];if(hot){heal(s,c,target,hot.amount*(hot.name==='Rejuvenation'?12000:18000)/hot.interval,sp.Id,api);target.hots=target.hots.filter(h=>h!==hot);}return true;}
 if(name==='Dark Pact'){const amount=Math.min(c.pet?.mana||0,sp.EffectBasePoints1+1);if(c.pet)c.pet.mana-=amount;restore(c,'mana',amount,api);return true;}
 if(name==='Demonic Sacrifice'){if(c.pet?.hp>0){const kind=c.pet.kind;c.pet.hp=0;proc(c,'demonicSacrifice',now+1800000,{kind});}return true;}
 if(name==='Soul Link'){if(c.pet?.hp>0)proc(c,'soulLink',now+3600000);return true;}
 if(name==='Bestial Wrath'){if(c.pet?.hp>0)proc(c.pet,'bestialWrath',now+18000,{stats:{damagePct:.5}});return true;}
 if(name==='Intimidation'){if(c.pet?.hp>0)proc(c.pet,'intimidation',now+15000);return true;}
 if(name==='Shadowform'||name==='Moonkin Form'){c.form=name==='Shadowform'?'shadow':'moonkin';return true;}
 if(name==='Lightwell'){c.lightwell={spell:sp.Id,charges:5,until:now+180000,next:now};return true;}
 if(name==='Trueshot Aura'){for(const ally of api.actors||[c]){ally.classBuffs??=[];ally.classBuffs=ally.classBuffs.filter(b=>b.name!==name);ally.classBuffs.push({name,spell:sp.Id,until:now+1800000,stats:{attackPower:sp.EffectBasePoints1+1,rangedAttackPower:sp.EffectBasePoints1+1}});}return true;}
 if(name==='Last Stand'){const amount=Math.round((api.stats?.(c)?.maxHp||c.maxHp||c.hp)*.3);c.hp+=amount;proc(c,'lastStand',now+20000,{health:amount,stats:{healthPct:.3}});return true;}
 const scripted={'Sweeping Strikes':['sweepingStrikes',10000,{charges:5}],'Blade Flurry':['bladeFlurry',15000,{stats:{meleeHastePct:.2}}],'Adrenaline Rush':['adrenalineRush',15000,{}],'Combustion':['combustion',180000,{criticals:0,stacks:0}],"Nature's Grasp":['naturesGrasp',45000,{}],'Omen of Clarity':['omenOfClarity',1800000,{}]};
 if(scripted[name]){const[key,ms,extra]=scripted[name];proc(c,key,now+ms,extra);return true;}
 // Active DBC spell modifiers (Arcane Power / Power Infusion / Death Wish).
 target=name==='Power Infusion'?target:c;target??=c;target.talentBuffs??=[];target.talentBuffs=target.talentBuffs.filter(b=>b.spell!==sp.Id);target.talentBuffs.push({spell:sp.Id,until:now+(duration(sp)||15000)});for(let i=1;i<=3;i++)if(sp['EffectApplyAuraName'+i]===77){target.auras??=[];target.auras.push({spell:sp.Id,effect:i,type:77,misc:sp['EffectMiscValue'+i],amount:sp['EffectBasePoints'+i]+1,until:now+(duration(sp)||15000)});}return true;
}
const eventConditions={
 'Improved Hamstring':e=>e.type==='damage'&&e.spell?.SpellName==='Hamstring',
 'Improved Revenge':e=>e.type==='damage'&&e.spell?.SpellName==='Revenge',
 'Improved Shield Bash':e=>e.type==='cast'&&e.spell?.SpellName==='Shield Bash',
 'Improved Kick':e=>e.type==='cast'&&e.spell?.SpellName==='Kick',
 'Improved Counterspell':e=>e.type==='cast'&&e.spell?.SpellName==='Counterspell',
 'Improved Concussive Shot':e=>e.type==='cast'&&e.spell?.SpellName==='Concussive Shot',
 'Improved Wing Clip':e=>e.type==='damage'&&e.spell?.SpellName==='Wing Clip',
 'Entrapment':e=>e.type==='damage'&&e.spell?.SpellName?.includes('Trap'),
 'Aftermath':e=>e.type==='damage'&&!e.periodic&&e.spell?.SpellFamilyName===5,
 'Improved Starfire':e=>e.type==='damage'&&e.spell?.SpellName==='Starfire',
 'Blackout':e=>e.type==='damage'&&e.spell?.School===5,
 'Vindication':e=>e.type==='damage'&&e.melee,
 'Improved Shadow Bolt':e=>e.type==='damage'&&e.critical&&e.spell?.SpellName==='Shadow Bolt',
 'Shadow Weaving':e=>e.type==='damage'&&e.spell?.School===5,
 'Improved Scorch':e=>e.type==='damage'&&e.spell?.SpellName==='Scorch',
 "Winter's Chill":e=>e.type==='damage'&&e.spell?.School===4,
};
function triggerSource(s,c,target,source,api){
 for(let i=1;i<=3;i++){const id=source['EffectTriggerSpell'+i],sp=spells[id];if(!sp)continue;
  for(let j=1;j<=3;j++){const aura=sp['EffectApplyAuraName'+j],amount=sp['EffectBasePoints'+j]+1,ms=duration(sp)||5000;
   if(!target)continue;if([12,26].includes(aura)&&pvpTriggeredControl(s,c,target,id,aura,ms))continue;if(aura===12){target.stunUntil=Math.max(target.stunUntil||0,s.clock+ms);target.cast=null;}
   else if(aura===26)target.rootUntil=Math.max(target.rootUntil||0,s.clock+ms);
   else if(aura===27)applySpellAura(target,{spell:id,effect:j,type:aura,amount,misc:sp['EffectMiscValue'+j],dispel:sp.Dispel,mechanic:sp['EffectMechanic'+j]||sp.Mechanic,positive:false,caster:c.id,until:s.clock+ms},s.clock);
   else if(aura===33){target.slowUntil=s.clock+ms;target.movementSlows??=[];target.movementSlows.push({caster:c.id,spell:id,until:s.clock+ms,amount:Math.abs(amount)/100});}
   else if(aura)applySpellAura(target,{spell:id,effect:j,type:aura,amount,misc:sp['EffectMiscValue'+j],dispel:sp.Dispel,mechanic:sp['EffectMechanic'+j]||sp.Mechanic,positive:false,caster:c.id,until:s.clock+ms,charges:sp.ProcCharges||0},s.clock);
   else if(sp['Effect'+j]===2)damage(s,c,target,amount,id,api,sp.School);
  }
 }
}
/** All mutable proc state lives on actors so segmented ticks and JSON restores reproduce it. */
export function onTalentEvent(s,c,event,api={}){
 const e=event,sp=e.spell||{},name=sp.SpellName||'',r=ranks(c),now=s.clock;let amount=e.amount||0;
 if(e.talentProc||c.talentProcDepth)return amount;
 const chance=(key,p)=>r[key]&&random(s,api)<p;
 const active=key=>c.talentProcs?.[key]?.until>now;
 if(e.type==='swing'&&c.talentProcs?.flurry?.charges){if(!--c.talentProcs.flurry.charges)delete c.talentProcs.flurry;}
 if(e.type==='cast'){
  if(!e.preserveProcs)for(const[key,consume]of Object.entries(consumableProcs(sp)))if(consume&&active(key))delete c.talentProcs[key];
  if(name==='Berserker Rage')restore(c,'rage',50*(r['Improved Berserker Rage']||0),api);
  if(name==='Enrage')restore(c,'rage',50*(r['Improved Enrage']||0),api);
  if(name==='Sprint'&&chance('Improved Sprint',.5*r['Improved Sprint'])){c.rootUntil=0;c.slowUntil=0;c.movementSlows=[];c.auras=(c.auras||[]).filter(a=>![26,33].includes(a.type));}
  if(name==='Sap'&&chance('Improved Sap',.3*r['Improved Sap']))c.stealthed=true;
  if(name==='Scorpid Sting'&&r['Improved Scorpid Sting']&&e.target){e.target.auras??=[];e.target.auras.push({spell:sp.Id,effect:3,type:29,misc:2,amount:-Math.abs(sp.EffectBasePoints1+1)*.1*r['Improved Scorpid Sting'],until:now+(sp.durationMs||20000),caster:c.id});}
  if(e.comboSpent){if(chance('Relentless Strikes',.2*e.comboSpent))restore(c,'energy',25,api);delete c.talentProcs?.premeditation;}
 }
 if(e.type==='damage'){
  if(!e.periodic&&sp.School===2&&e.target){
   if(chance('Impact',.02*r.Impact)){if(!pvpTriggeredControl(s,c,e.target,12355,12,2000)){e.target.stunUntil=now+2000;e.target.cast=null;e.target.nextAction=now;}}
   if(e.critical&&r.Ignite){
    e.target.dots??=[];const previous=e.target.dots.find(d=>d.spellId===12654&&d.caster===c.id&&d.remaining>0);
    const bank=(previous?previous.amount*previous.remaining:0)+amount*.08*r.Ignite;
    e.target.dots=e.target.dots.filter(d=>d!==previous);
    e.target.dots.push({caster:c.id,spellId:12654,school:2,amount:Math.floor(bank/2),next:now+2000,interval:2000,remaining:2,label:'点燃',talentProc:true});
   }
  }
  if(c.classId===8&&!e.periodic&&sp.School>0&&chance('Arcane Concentration',.02*r['Arcane Concentration']))proc(c,'clearcasting',now+15000);
  if(!e.periodic&&e.target?.auras)e.target.auras=e.target.auras.filter(a=>!(a.type===87&&a.charges>0&&(a.misc&(1<<(sp.School||0)))&&!--a.charges));
  if(name==='Blizzard'&&r['Improved Blizzard']&&e.target){e.target.movementSlows??=[];e.target.movementSlows=e.target.movementSlows.filter(a=>a.spell!==sp.Id);e.target.movementSlows.push({spell:sp.Id,caster:c.id,amount:[0,.3,.5,.65][r['Improved Blizzard']],until:now+1500+1000*(r.Permafrost||0)});}
  if(['Rain of Fire','Hellfire','Soul Fire'].includes(name)&&chance('Pyroclasm',(.13*r.Pyroclasm)/(e.periodic?Math.max(1,(sp.durationMs||15000)/(sp.EffectAmplitude1||1000)):1))&&e.target){if(!pvpTriggeredControl(s,c,e.target,18093,12,3000)){e.target.stunUntil=now+3000;e.target.cast=null;}}
  if(e.periodic&&['Corruption','Drain Life'].includes(name)&&chance('Nightfall',.02*r.Nightfall))proc(c,'nightfall',now+10000);
  if(e.critical&&!e.periodic&&sp.School>0&&r["Nature's Grace"])proc(c,'naturesGrace',now+15000);
  if(e.critical&&e.melee){
   if(r['Deep Wounds'])dot(s,c,e.target,(e.weaponDamage||amount/2)*.2*r['Deep Wounds']/4,12721,api);
   if(r.Flurry)proc(c,'flurry',now+15000,{charges:3,stats:{meleeHastePct:(c.classId===1?.05:.05)*r.Flurry+.05}});
   if(c.form==='cat'&&['Claw','Rake','Shred','Ravage','Pounce'].includes(name)&&chance('Blood Frenzy',.5*r['Blood Frenzy'])){c.combo=Math.min(5,(c.combo||0)+1);c.comboTarget=e.target?.id;}
   if(['bear','direbear'].includes(c.form)&&chance('Primal Fury',.5*r['Primal Fury']))restore(c,'rage',50,api);
   if((e.comboBuilder||['Sinister Strike','Backstab','Ambush','Ghostly Strike','Hemorrhage'].includes(name))&&chance('Seal Fate',.2*r['Seal Fate']))c.combo=Math.min(5,(c.combo||0)+1);
  }
  if(e.critical&&r.Vengeance&&c.classId===2)proc(c,'vengeance',now+8000);
  if(e.critical&&sp.School>0&&r['Elemental Devastation'])proc(c,'elementalDevastation',now+10000,{stats:{crit:.03*r['Elemental Devastation']}});
  if(e.critical&&[2,4].includes(sp.School)&&r['Master of Elements'])restore(c,'mana',(sp.mana||sp.ManaCost||0)*.1*r['Master of Elements'],api);

  if(e.melee&&active('omenOfClarity')&&random(s,api)<.06)proc(c,'clearcasting',now+15000);
  if(e.melee&&active('reckoning')){const charges=c.talentProcs.reckoning.charges;delete c.talentProcs.reckoning;for(let i=0;i<charges;i++)damage(s,c,e.target,e.weaponDamage||amount,20178,api);}
  if(!e.periodic&&[2,3,4].includes(sp.School)&&chance('Elemental Focus',.1))proc(c,'clearcasting',now+15000);
  if(e.melee&&chance('Sword Specialization',.01*r['Sword Specialization'])&&[7,8].includes(items[c.equipment?.[16]?.id]?.subclass))damage(s,c,e.target,e.weaponDamage||amount,16459,api);
  if(e.melee&&chance('Mace Specialization',.01*r['Mace Specialization'])&&[4,5].includes(items[c.equipment?.[16]?.id]?.subclass)){if(!pvpTriggeredControl(s,c,e.target,5530,12,3000)){e.target.stunUntil=now+3000;e.target.cast=null;}}
  if(sp.School===5&&e.target?.vampiricEmbrace?.caster===c.id)for(const ally of api.actors||[c])heal(s,c,ally,amount*(.2+.05*(r['Improved Vampiric Embrace']||0)),15286,api);
  if(name==='Drain Mana'&&r['Improved Drain Mana'])damage(s,c,e.target,amount*.15*r['Improved Drain Mana'],sp.Id,api,5);
  for(const key of ['sweepingStrikes','bladeFlurry'])if(e.melee&&active(key)){const second=s.combat?.enemies?.find(t=>t.hp>0&&t.id!==e.target?.id&&!t.removed&&Math.hypot((t.position||0)-(c.position||0),(t.positionY||0)-(c.positionY||0))<=5);if(second){damage(s,c,second,amount,sp.Id,api);if(key==='sweepingStrikes'&&!--c.talentProcs[key].charges)delete c.talentProcs[key];}}
  if(active('combustion')&&sp.School===2&&!e.periodic){const buff=c.talentProcs.combustion;buff.stacks++;if(e.critical&&++buff.criticals>=3)delete c.talentProcs.combustion;}
 }
 if(e.type==='heal'){
  if(name==='Mend Pet'&&chance('Improved Mend Pet',.25*r['Improved Mend Pet'])){for(const key of ['auras','dots']){const list=e.target?.[key]||[],index=list.findIndex(a=>[1,2,3,4].includes(a.dispel??spells[a.spell||a.spellId]?.Dispel));if(index>=0){list.splice(index,1);break;}}}
  if(name==='Lay on Hands'&&r['Improved Lay on Hands']){armorBuff(s,e.target,.15*r['Improved Lay on Hands'],sp.Id);e.target.classBuffs.find(b=>b.name==='talent-armor').until=now+120000;}
  if(e.critical&&r.Illumination&&random(s,api)<.2*r.Illumination)restore(c,'mana',sp.mana||sp.ManaCost||0,api);
  if(e.critical&&r.Inspiration)armorBuff(s,e.target,[0,.08,.16,.25][r.Inspiration],sp.Id);
  if(e.critical&&r['Ancestral Healing'])armorBuff(s,e.target,[0,.08,.16,.25][r['Ancestral Healing']],sp.Id);
  if(name==='Healing Wave'&&chance('Healing Way',r['Healing Way']/3)){e.target.talentProcs??={};const stacks=Math.min(3,(e.target.talentProcs.healingWay?.stacks||0)+1);proc(e.target,'healingWay',now+15000,{stacks,caster:c.id});}
 }
 if(e.type==='incoming'){
  if(active('spiritOfRedemption'))return 0;
  for(const aura of passiveTalentSpells(c))for(let i=1;i<=3;i++)if(aura['EffectApplyAuraName'+i]===87&&(aura['EffectMiscValue'+i]&(1<<(sp.School||0))))amount*=1+(aura['EffectBasePoints'+i]+1)/100;
  if(c.pet?.hp>0&&c.pet.kind==='voidwalker'&&!(sp.School||0))amount*=1-.02*(r['Master Demonologist']||0);if(c.petUnit&&c.kind==='voidwalker'&&!(sp.School||0))amount*=1-.02*(c.ownerMasterDemonologist||0);
  if(active('soulLink')&&c.pet?.hp>0){const split=Math.min(c.pet.hp,Math.round(amount*.3));c.pet.hp-=split;amount-=split;}
  if(c.form==='shadow'&&sp.School===0)amount*=.85;
  if(e.critical){
   if(r.Enrage)proc(c,'enrage',now+12000,{charges:12});
   if(r.Redoubt)proc(c,'redoubt',now+10000,{charges:5,stats:{block:.06*r.Redoubt}});
   if(r['Blood Craze']){c.hots??=[];c.hots.push({spell:16491,name:'Blood Craze',caster:c.id,amount:(api.stats?.(c)?.maxHp||c.maxHp||c.hp)*.01*r['Blood Craze']/3,next:now+2000,interval:2000,until:now+6000});}
   if(r['Blessed Recovery']){c.hots??=[];c.hots.push({spell:27813,name:'Blessed Recovery',caster:c.id,amount:amount*[0,.08,.16,.25][r['Blessed Recovery']]/3,next:now+2000,interval:2000,until:now+6000});}
   if(r['Eye for an Eye']&&sp.School>0)damage(s,c,e.target,Math.min(amount*.15*r['Eye for an Eye'],(api.stats?.(c)?.maxHp||c.hp)*.5),25997,api,1);
   if(chance('Reckoning',.2*r.Reckoning))proc(c,'reckoning',now+10000,{charges:Math.min(4,(c.talentProcs?.reckoning?.charges||0)+1)});
   if(r.Martyrdom)proc(c,'martyrdom',now+6000,{pushback:1});
   if(r['Eye of the Storm'])proc(c,'eyeOfTheStorm',now+6000,{pushback:1});
  }
  if(e.blocked&&chance('Shield Specialization',.2*r['Shield Specialization']))restore(c,'rage',10,api);
  if(e.dodged&&chance('Setup',r.Setup/3)){c.combo=Math.min(5,(c.combo||0)+1);c.comboTarget=e.target?.id;}
  if(active('naturesGrasp')&&e.melee&&random(s,api)<.35+[0,.15,.3,.45,.65][r["Improved Nature's Grasp"]||0]){if(!pvpTriggeredControl(s,c,e.target,19975,26,27000))e.target.rootUntil=now+27000;delete c.talentProcs.naturesGrasp;}
  const ward=sp.School===2?'Improved Fire Ward':sp.School===4?'Frost Warding':null;
  if(ward&&r[ward]&&(c.absorb?.until>now||c.auras?.some(a=>a.type===69&&a.until>now))&&random(s,api)<.1*r[ward]){damage(s,c,e.target,amount,sp.Id,api,sp.School);amount=0;}
  if(amount>=c.hp&&c.hp>0&&r['Spirit of Redemption']&&!c.spiritRedemptionUsed){c.spiritRedemptionUsed=true;c.hp=1;proc(c,'spiritOfRedemption',now+10000);return 0;}
 }
 if(e.type==='kill'){
  if(r['Remorseless Attacks'])proc(c,'remorseless',now+20000,{crit:.2*r['Remorseless Attacks']});
  if(name==='Drain Soul'&&chance('Improved Drain Soul',.5*r['Improved Drain Soul']))proc(c,'drainSoul',now+10000,{stats:{regenCasting:.5,manaRegenPct:1}});
 }
 if(e.type==='resist'&&r['Magic Absorption']&&(c.magicAbsorptionReady||0)<=now){c.magicAbsorptionReady=now+1000;restore(c,'mana',(api.stats?.(c)?.maxMana||0)*.01*r['Magic Absorption'],api);}
 for(const {talent,spell:source}of selectedTalentSpells(c)){const condition=eventConditions[talent.name],procChance=source.EffectApplyAuraName1===109?source.EffectBasePoints1+1:source.ProcChance||100;if(condition?.(e)&&random(s,api)<Math.min(1,procChance/100))triggerSource(s,c,e.target,source,api);}
 if(e.type==='tick'){
  for(const[key,p]of Object.entries(c.talentProcs||{}))if(p.until<=now){if(key==='lastStand')c.hp=Math.max(1,c.hp-p.health);if(key==='spiritOfRedemption'){c.hp=0;c.cast=null;}if(key==='premeditation')c.combo=Math.max(0,(c.combo||0)-p.points);delete c.talentProcs[key];}
  c.talentBuffs=(c.talentBuffs||[]).filter(b=>b.until>now);
  if(r['Anger Management']){c.nextAngerManagement??=now+3000;if(c.nextAngerManagement<=now){restore(c,'rage',10,api);c.nextAngerManagement+=3000;}}
  if((c.nextTalentTick||0)<=now){c.nextTalentTick=now+2000;

   if(c.pet?.hp>0&&r['Spirit Bond']){c.nextSpiritBond??=now+10000;if(c.nextSpiritBond<=now){c.nextSpiritBond+=10000;heal(s,c,c,(api.stats?.(c)?.maxHp||0)*.01*r['Spirit Bond'],19578,api);heal(s,c,c.pet,c.pet.maxHp*.01*r['Spirit Bond'],19578,api);}}
   const sacrifice=c.talentProcs?.demonicSacrifice;if(sacrifice?.until>now&&(c.nextSacrificeTick||0)<=now){c.nextSacrificeTick=now+4000;if(sacrifice.kind==='voidwalker')heal(s,c,c,(api.stats?.(c)?.maxHp||0)*.03,18790,api);if(sacrifice.kind==='felhunter')restore(c,'mana',(api.stats?.(c)?.maxMana||0)*.02,api);}
   if(r['Leader of the Pack']&&['cat','bear','direbear'].includes(c.form)||c.form==='moonkin')for(const ally of api.actors||[c])if(ally.id!==c.id&&Math.hypot((ally.position||0)-(c.position||0),(ally.positionY||0)-(c.positionY||0))<=45)proc(ally,c.form==='moonkin'?'moonkinAura':'leaderOfThePack',now+2500,{stats:c.form==='moonkin'?{spellCrit:.03}:{crit:.03,rangedCrit:.03}});
   if(c.lightwell?.until>now&&c.lightwell.charges>0){const ally=(api.actors||[c]).find(t=>t.hp>0&&t.hp<(api.stats?.(t)?.maxHp||t.maxHp||0)*.7&&!t.hots?.some(h=>h.name==='Lightwell Renew'&&h.until>now));if(ally){const renew=Object.values(spells).find(a=>a.SpellName==='Lightwell Renew'&&a.Rank1===spells[c.lightwell.spell]?.Rank1)||spells[7001];if(renew){ally.hots??=[];ally.hots.push({name:'Lightwell Renew',spell:renew.Id,caster:c.id,amount:renew.EffectBasePoints1+1,interval:renew.EffectAmplitude1||2000,next:now+(renew.EffectAmplitude1||2000),until:now+(duration(renew)||6000)});c.lightwell.charges--;}}}
  }
 }
 return Math.max(0,amount);
}

export function onPetTalentEvent(s,owner,pet,event,api={}){
 const r=ranks(owner),now=s.clock;if(event.type!=='damage')return;
 if(event.critical&&r.Frenzy&&random(s,api)<.2*r.Frenzy)proc(pet,'frenzy',now+8000,{stats:{meleeHastePct:.3}});
 if(pet.talentProcs?.intimidation?.until>now&&event.target){if(!pvpTriggeredControl(s,pet,event.target,24394,12,3000)){event.target.stunUntil=now+3000;event.target.cast=null;}event.target.threat??={};event.target.threat[pet.id]=(event.target.threat[pet.id]||0)+(event.amount||0)*2;delete pet.talentProcs.intimidation;}
}
function consumableProcs(sp){const name=sp.SpellName||'',baseCast=lookup.SpellCastTimes[sp.CastingTimeIndex]?.baseMs||sp.castMs||0,cost=(sp.ManaCost||0)+(sp.ManaCostPercentage||0);return{clearcasting:cost>0,nightfall:name==='Shadow Bolt',naturesGrace:baseCast>0,presenceOfMind:baseCast>0&&baseCast<=10000,naturesSwiftness:sp.School===3&&baseCast>0,elementalMastery:[2,3,4].includes(sp.School)&&cost>0,innerFocus:cost>0,coldBlood:sp.School===0&&sp.DmgClass===2,divineFavor:['Holy Light','Flash of Light','Holy Shock'].includes(name),felDomination:name.startsWith('Summon '),amplifyCurse:name.startsWith('Curse of'),remorseless:['Sinister Strike','Backstab','Ambush','Ghostly Strike'].includes(name)};}
export function beginTalentCast(s,c,sp){const conditions=consumableProcs(sp);return{startedAt:s.clock,spellId:sp.Id,procs:Object.fromEntries(Object.entries(c.talentProcs||{}).filter(([key,p])=>conditions[key]&&p.until>s.clock).map(([key,p])=>[key,{...p}]))};}
export function endTalentCast(s,c,sp,snapshot,api={},event={}){
 for(const[key,p]of Object.entries(snapshot?.procs||{})){const current=c.talentProcs?.[key];if(current&&current.token===p.token&&current.until===p.until)delete c.talentProcs[key];}
 return onTalentEvent(s,c,{...event,type:'cast',spell:sp,preserveProcs:true},api);
}





