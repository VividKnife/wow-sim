import {setCombatPosition} from './combat-area.js';
import {weaponAttack} from './weapon-attacks.js';
import {weaponDamage,effectiveArmor} from './companion-combat.js';
import {spellPowerBonus} from './spell-scaling.js';
import {mayApproachForSpell} from './combat-positioning.js';
import {beginSpellTiming,spellReady,cooldownUntil,resetSpellCooldowns} from './spell-timing.js';
import {petHappinessMultiplier} from './pet-progression.js';
import {usableCount,consume} from './inventory.js';
import {activateRacial,racialActiveNames,racialAbilityBlocked,tickRacialEffects} from './racial-effects.js';
import {executeExtendedClassEffect,prepareClassAbility,tickExtendedClassEffects,extendedSpellNames,classChannelInterval,classAbilityKind,classJudgement,summonClassPet,petSpellTick,tameClassPet} from './class-spell-effects.js';
import {executeTalentActive,talentActiveNames,onTalentEvent,beginTalentCast,endTalentCast,onPetTalentEvent} from './talent-runtime.js';
import {spells,items,nameOf,creatures} from './catalog.js';
import {stats,knownRank,spellInfo,effectRange,roll,rng,log,armorReduction} from './character.js';
import {defaultClassRules,supportedSpellNames} from './class-support.js';
import {ranks,healingMultiplier,talentPetModifiers,talentSpellValue} from './talent-effects.js';
import {strategyAllows,ruleMatches,protectCombatTarget} from './combat-strategy.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {moveToward,moveAway,inSpellRange,effectiveSpeed} from './combat-space.js';
import {controlled,hasAura,addCombatAura} from '../../../sim-core/src/combat-auras.js';
import {recordMetric} from './combat-metrics.js';

const heals=new Set(['Holy Light','Flash of Light','Healing Touch','Regrowth','Healing Wave','Lesser Healing Wave','Lesser Heal','Heal','Flash Heal']);
const hots=new Set(['Renew','Rejuvenation']);
const summons=new Set(['Call Pet','Tame Beast','Summon Imp','Summon Voidwalker','Revive Pet']);
const buffs=new Set(['Battle Shout','Blessing of Might','Devotion Aura','Aspect of the Hawk','Rockbiter Weapon','Demon Skin','Mark of the Wild','Thorns','Power Word: Fortitude']);
const specials=new Set([...heals,...hots,...summons,...buffs,'Seal of Righteousness','Judgement','Power Word: Shield','Life Tap','Bear Form','Cat Form','Maul','Claw','Rip','Growl','Searing Totem','Strength of Earth Totem','Stoneskin Totem','Healing Stream Totem','Hammer of Justice','Gouge','Kick','Evasion','Sprint','Bloodrage','Battle Stance','Defensive Stance','Fear','Concussive Shot','Cold Snap','Raptor Strike','Stealth','Backstab','Ambush']);
const coreHandled=new Set(['Heroic Strike','Sunder Armor','Taunt','Cleave','Sinister Strike','Eviscerate','Smite','Auto Shot','Resurrection','Redemption','Ancestral Spirit']);

export function healAmount(s,c,target,amount,spell,label){
 if(!target||target.hp<=0)return;
 for(const a of target.auras||[])if(a.until>s.clock&&a.type===118)amount*=1+a.amount/100;
 if(target.racialBuff?.kind==='bloodfury'&&target.racialBuff.until>s.clock)amount*=.5;
 const actual=Math.min(Math.max(0,stats(target).maxHp-target.hp),Math.max(0,Math.round(amount)));target.hp+=actual;
 if(!actual)return;onTalentEvent(s,c,{type:'heal',target,spell:spells[spell],amount:actual,periodic:true},{stats,rng,actors:[c,target]});const text=label||nameOf('spells',spell);
 recordMetric(s,c,target,actual,{kind:'healing',effective:true,spellId:spell,label:text});
 if(s.combat){const enemies=s.combat.enemies.filter(e=>e.hp>0&&!e.removed);for(const e of enemies)e.threat[c.id]=(e.threat[c.id]||0)+actual*.5/Math.max(1,enemies.length);const key=c.name+' · '+text;s.combat.healing[key]=(s.combat.healing[key]||0)+actual;}
 log(s,`${c.name} 的${text}为 ${target.name} 恢复 ${actual} 点生命`,'heal',{actorId:c.id,targetId:target.id,spellId:spell,amount:actual});
}
function applyHot(s,c,target,sp,effect=1){const interval=sp['EffectAmplitude'+effect]||3000;target.hots=(target.hots||[]).filter(h=>h.name!==sp.SpellName||h.caster!==c.id);target.hots.push({spell:sp.Id,name:sp.SpellName,caster:c.id,amount:(effectRange(c,sp,effect)[0]+spellPowerBonus(stats(c),sp,{healing:true,periodic:true,effect}))*healingMultiplier(c,sp),next:s.clock+interval,interval,until:s.clock+sp.durationMs});}
function putBuff(s,target,sp,values){target.classBuffs=(target.classBuffs||[]).filter(b=>b.name!==sp.SpellName);target.classBuffs.push({spell:sp.Id,name:sp.SpellName,until:s.clock+(sp.durationMs||1800000),stats:values});}
function buffValues(c,sp){const result={},r=ranks(c);for(let i=1;i<=3;i++){const aura=sp['EffectApplyAuraName'+i],misc=sp['EffectMiscValue'+i],amount=effectRange(c,sp,i)[0];if(aura===29){const key=['str','agi','sta','int','spi'][misc];if(key)result[key]=amount;else if(misc===-1)for(const key of ['str','agi','sta','int','spi'])result[key]=amount;}if(aura===22&&(misc&1))result.armor=amount;if(aura===99)result.attackPower=amount;if(aura===124)result.rangedAttackPower=amount;}
 if(sp.SpellName==='Battle Shout'||sp.SpellName==='Blessing of Might')result.attackPower=effectRange(c,sp)[0]*(1+(sp.SpellName==='Battle Shout'?.05*(r['Improved Battle Shout']||0):.04*(r['Improved Blessing of Might']||0)));
 if(sp.SpellName==='Rockbiter Weapon')result.attackPower=effectRange(c,spells[{8017:10400,8018:15567,8019:15568}[sp.Id]])[0];
 if(sp.SpellName==='Devotion Aura')result.armor=effectRange(c,sp)[0]*(1+.05*(r['Improved Devotion Aura']||0));
 if(sp.SpellName==='Mark of the Wild')for(const key of Object.keys(result))result[key]*=1+.07*(r['Improved Mark of the Wild']||0);
 if(sp.SpellName==='Power Word: Fortitude')result.sta=effectRange(c,sp)[0]*(1+.15*(r['Improved Power Word: Fortitude']||0));
 return result;
}
function petProfile(s,c,sp){summonClassPet(s,c,sp);}

export function classEffect(s,c,target,sp,actors,api){const snapshot=sp.talentCast||beginTalentCast(s,c,sp),combo=c.combo||0;applyClassEffect(s,c,target,sp,actors,api);endTalentCast(s,c,sp,snapshot,{...api,actors,rng,stats,healAmount},{target,comboSpent:Math.max(0,combo-(c.combo||0))});}
function applyClassEffect(s,c,target,sp,actors,api){
 const name=sp.SpellName,r=ranks(c);
 if(racialActiveNames.has(name)){activateRacial(s,c,sp,{...api,actors,enemies:s.combat?.enemies||[],stats,healAmount});return;}
 if(executeTalentActive(s,c,target,sp,{...api,rng,stats,actors,healAmount}))return;
 if(executeExtendedClassEffect(s,c,target,sp,actors,{...api,healAmount}))return;
 if(heals.has(name)){api.heal(s,c,target,sp);if(name==='Regrowth')applyHot(s,c,target,sp,2);return;}
 if(hots.has(name)){applyHot(s,c,target,sp);return;}
 if(name==='Tame Beast'){tameClassPet(s,c,target,sp);return;}
 if(name==='Revive Pet'){if(c.pet&&c.pet.hp<=0){c.pet.hp=Math.max(1,Math.round(c.pet.maxHp*(sp.EffectBasePoints1+1)/100));setCombatPosition(s,c.pet,c);c.pet.nextSwing=s.clock+1000;}return;}
 if(summons.has(name)){if(c.classId!==3||!c.pet)petProfile(s,c,sp);return;}
 if(buffs.has(name)){const recipients=['Devotion Aura','Battle Shout'].includes(name)?actors.filter(a=>a.hp>0&&distance(c,a)<=30*(name==='Battle Shout'?1+.1*(r['Booming Voice']||0):1)):[target];for(const a of recipients){putBuff(s,a,sp,buffValues(c,sp));for(let n=1;n<=3;n++)if(sp['EffectApplyAuraName'+n]===143)addCombatAura(a,{spell:sp.Id,effect:n,type:143,misc:sp['EffectMiscValue'+n],amount:talentSpellValue(c,sp,8,effectRange(c,sp,n)[0]),until:s.clock+sp.durationMs,caster:c.id},s.clock);}if(name==='Thorns')target.thorns={spell:sp.Id,amount:effectRange(c,sp)[0],until:s.clock+sp.durationMs};return;}
 if(name==='Power Word: Shield'){target.absorb={spell:sp.Id,amount:Math.round((effectRange(c,sp)[0]+spellPowerBonus(stats(c),sp,{healing:true}))*(1+.05*(r['Improved Power Word: Shield']||0))),until:s.clock+sp.durationMs};target.weakenedSoulUntil=s.clock+15000;return;}
 if(name==='Life Tap'){const hp=Math.min(c.hp-1,effectRange(c,sp)[0]);c.hp-=hp;c.mana=Math.min(stats(c).maxMana,c.mana+Math.round(hp*(1+.1*(r['Improved Life Tap']||0))));return;}
 if(name==='Seal of Righteousness'){c.seal={spell:sp.Id,until:s.clock+sp.durationMs};return;}
 if(name==='Judgement'&&classJudgement(s,c,target,sp,actors,{...api,healAmount}))return;
 if(name==='Judgement'){const seal=spells[c.seal?.spell],judgement=seal&&spells[seal.EffectBasePoints3>0?seal.EffectBasePoints3+1:20187];c.seal=null;if(judgement&&api.lands(s,c,target,sp))api.damage(s,c,target,roll(s,...effectRange(c,judgement)),nameOf('spells',sp.Id),1,{spellId:sp.Id,school:1});return;}
 if(name==='Bear Form'||name==='Cat Form'){c.form=name==='Bear Form'?'bear':'cat';c.rage=0;c.energy=0;if(rng(s)<.2*(r.Furor||0)){if(c.form==='bear')c.rage=100;else c.energy=40;}return;}
 if(name==='Battle Stance'||name==='Defensive Stance'){c.stance=name==='Battle Stance'?'battle':'defensive';c.rage=Math.min(c.rage||0,50*(r['Tactical Mastery']||0));return;}
 if(name==='Stealth'){c.stealthed=true;return;}
 if(['Backstab','Ambush','Claw'].includes(name)){
  if(name!=='Claw')c.stealthed=false;
  const attack=weaponAttack(s,c,target,{special:true,spell:sp});if(!attack.landed)return;
  const multiplier=name==='Ambush'?2.5:name==='Backstab'?1.5:1;
  const raw=weaponDamage(s,c,true)*multiplier+effectRange(c,sp)[0];
  api.damage(s,c,target,raw*attack.multiplier*(1-armorReduction(effectiveArmor(target,s.clock),c.level)),nameOf('spells',sp.Id),1,{spellId:sp.Id,school:0,critical:attack.critical});
  c.combo=Math.min(5,(c.comboTarget===target.id?c.combo||0:0)+1+(name==='Ambush'&&r.Initiative&&rng(s)<.25*r.Initiative?1:0));c.comboTarget=target.id;return;
 }
 if(name==='Rip'){target.dots.push({caster:c.id,spellId:sp.Id,school:0,amount:effectRange(c,sp)[0]+sp.EffectPointsPerComboPoint1*c.combo,next:s.clock+2000,interval:2000,remaining:Math.floor(sp.durationMs/2000),label:nameOf('spells',sp.Id)});c.combo=0;return;}
 if(name==='Growl'){target.threat[c.id]=Math.max(0,...Object.values(target.threat));target.tauntedBy=c.id;target.tauntUntil=s.clock+sp.durationMs;target.target=c.id;return;}
 if(name.endsWith('Totem')){const element=name==='Searing Totem'?'fire':name==='Healing Stream Totem'?'water':'earth';c.totems??={};c.totems[element]={spell:sp.Id,name,until:s.clock+sp.durationMs,next:s.clock+2000,position:c.position,positionY:c.positionY||0};return;}
 if(name==='Hammer of Justice'||name==='Gouge'){if(api.lands(s,c,target,sp)){target.stunUntil=s.clock+sp.durationMs+(name==='Gouge'?500*(r['Improved Gouge']||0):0);target.cast=null;}return;}
 if(name==='Kick'){if(target.cast){target.schoolLockouts??={};target.schoolLockouts[spells[target.cast.spell]?.School]=s.clock+5000;target.cast=null;target.nextAction=s.clock;log(s,c.name+' 打断了 '+target.name,'interrupt',{actorId:c.id,targetId:target.id,spellId:sp.Id});}return;}
 if(name==='Fear'){if(api.lands(s,c,target,sp))addCombatAura(target,{spell:sp.Id,effect:1,type:7,until:s.clock+sp.durationMs,caster:c.id},s.clock);return;}
 if(name==='Concussive Shot'){if(api.lands(s,c,target,sp))addCombatAura(target,{spell:sp.Id,effect:1,type:33,amount:-50,until:s.clock+sp.durationMs},s.clock);return;}
 if(name==='Evasion'){addCombatAura(c,{spell:sp.Id,effect:1,type:49,amount:50,until:s.clock+sp.durationMs},s.clock);return;}
 if(name==='Sprint'){c.sprintUntil=s.clock+sp.durationMs;return;}
 if(name==='Bloodrage'){c.hp=Math.max(1,c.hp-Math.ceil(stats(c).maxHp*.07));c.rage=Math.min(1000,(c.rage||0)+100);c.bloodrage={next:s.clock+1000,until:s.clock+10000};return;}
 if(name==='Cold Snap')resetSpellCooldowns(c,spell=>spell?.School===4&&spell.Id!==sp.Id);
}

export function decideClass(s,c,e,actors,api,rules=c.rules||defaultClassRules(c.classId)){
 const r=ranks(c);
 for(const rule of rules){
  const id=rule.enabled&&knownRank(c,rule.spell),sp=id&&spellInfo(c,id);if(!sp||!supportedSpellNames.has(sp.SpellName)||coreHandled.has(sp.SpellName))continue;
  const name=sp.SpellName;if(sp.School>0&&(c.silenceUntil>s.clock||hasAura(c,27,s.clock))||(c.schoolLockouts?.[sp.School]||0)>s.clock)continue;if(!ruleMatches(s,c,e,rule,sp)||!spellReady(c,sp,s.clock))continue;
  if(c.talentProcs?.spiritOfRedemption?.until>s.clock&&!['heal','dispel'].includes(classAbilityKind(sp)))continue;
  if(c.classId===8&&!['Cold Snap'].includes(name)&&!extendedSpellNames.has(name)&&!talentActiveNames.has(name)&&!racialActiveNames.has(name))continue;
  const prepared=prepareClassAbility(s,c,e,sp,actors);if(prepared===null)continue;
  let target=prepared?.target||e;if(racialActiveNames.has(name)){if(racialAbilityBlocked(s,c,sp))continue;target=c;}if(talentActiveNames.has(name)&&!prepared)target=c;const healing=heals.has(name)||hots.has(name)||name==='Power Word: Shield';
  if(healing){target=actors.filter(a=>a.hp>0&&a.hp<stats(a).maxHp*.85).sort((a,b)=>a.hp/stats(a).maxHp-b.hp/stats(b).maxHp)[0];if(!target)continue;}
  if(hots.has(name)&&target.hots?.some(h=>h.name===name&&h.until>s.clock+1500))continue;
  if(name==='Power Word: Shield'&&(target.weakenedSoulUntil||0)>s.clock)continue;
  if(buffs.has(name)){target=c;if(c.classBuffs?.some(b=>b.name===name&&b.until>s.clock+3000))continue;}
  if(name==='Tame Beast'&&(c.pet||c.hunterPet||creatures[e.entry]?.CreatureType!==1||e.level>c.level))continue;
  if(summons.has(name)&&name!=='Tame Beast'){target=c;if(c.pet?.hp>0)continue;if(name==='Revive Pet'&&!c.pet)continue;if(c.classId===3&&c.pet&&name!=='Revive Pet')continue;}
  if(name==='Seal of Righteousness'){target=c;if(c.seal?.until>s.clock)continue;}
  if(name==='Judgement'&&!(c.seal?.until>s.clock))continue;
  if(name==='Life Tap'){target=c;if(c.hp<stats(c).maxHp*.4||c.mana>=stats(c).maxMana*.5)continue;}
  if(name==='Bloodrage'){target=c;if(c.rage>700||c.hp<stats(c).maxHp*.3)continue;}
  if(name==='Evasion'||name==='Sprint'){target=c;if(name==='Evasion'&&c.hp>stats(c).maxHp*.6)continue;}
  if(name==='Cold Snap'){target=c;if(!c.learned.some(sid=>sid!==id&&spells[sid]?.School===4&&cooldownUntil(c,spells[sid])>s.clock))continue;}
  if(name==='Bear Form'||name==='Cat Form'){target=c;if(c.form===(name==='Bear Form'?'bear':'cat'))continue;}
  if(['Battle Stance','Defensive Stance'].includes(name)){target=c;if(c.stance===(name==='Battle Stance'?'battle':'defensive'))continue;}
  if(name==='Maul'||name==='Growl'){if(c.form!=='bear'||name==='Growl'&&e.target===c.id)continue;}
  if(name==='Claw'||name==='Rip'){if(c.form!=='cat'||name==='Rip'&&(!c.combo||c.comboTarget!==e.id))continue;}
  if(name==='Kick'&&!e.cast)continue;
  if(name==='Stealth'){target=c;if(c.stealthed||s.clock>s.combat.startedAt+100)continue;}
  if(name==='Backstab'||name==='Ambush'){if(items[c.equipment[16]?.id]?.subclass!==15||name==='Ambush'&&!c.stealthed||name==='Backstab'&&e.target===c.id&&!c.stealthed)continue;}
  if(name==='Fear'&&e.auras?.some(a=>a.type===7&&a.until>s.clock))continue;
  if(name==='Gouge'&&e.stunUntil>s.clock)continue;
  if(name.endsWith('Totem')){target=c;if(Object.values(c.totems||{}).some(t=>t.name===name&&t.until>s.clock))continue;}
  if(!sp.ChannelInterruptFlags&&[1,2,3].some(n=>sp['EffectApplyAuraName'+n]===3)&&e.dots.some(d=>d.caster===c.id&&spells[d.spell??d.spellId]?.SpellName===name&&d.remaining>0))continue;
  if(['Demoralizing Shout','Demoralizing Roar','Thunder Clap','Wing Clip','Insect Swarm'].includes(name)&&e.auras?.some(a=>a.caster===c.id&&spells[a.spell]?.SpellName===name&&a.until>s.clock+1500))continue;
  if(name==='Consecration'&&(s.groundEffects||[]).some(a=>a.caster===c.id&&a.spell===id&&a.until>s.clock+1500))continue;
  const pool=sp.PowerType===1?'rage':sp.PowerType===3?'energy':[4294967294,-2].includes(sp.PowerType)?'hp':'mana';if((c[pool]||0)<sp.mana||pool==='hp'&&c.hp<=sp.mana)continue;const reagents=Array.from({length:8},(_,i)=>({id:sp['Reagent'+(i+1)],count:sp['ReagentCount'+(i+1)]})).filter(r=>r.id>0&&r.count>0);if(c===s&&reagents.some(r=>usableCount(s,r.id)<r.count))continue;
  if(target===e&&!strategyAllows(s,c,e,sp,rule))continue;
  if(target!==c&&!inSpellRange(c,target,sp)){if(target===e&&!mayApproachForSpell(s,c,target,sp))continue;if(distance(c,target)<sp.minRange){if(effectiveSpeed(c,s.clock)<=effectiveSpeed(target,s.clock))continue;moveAway(s,c,target,s.clock);}else moveToward(s,c,target,sp.range||5,s.clock);return true;}
  if(['Maul','Raptor Strike'].includes(name)){c.queuedStrike=id;return false;}
  if(c.form&&sp.PowerType===0&&!['Bear Form','Cat Form'].includes(name))c.form=null;
  const talentCast=beginTalentCast(s,c,sp),timing=beginSpellTiming(c,sp,s.clock,{channel:name==='Tame Beast'||!!prepared?.channel,pool});if(c===s)for(const r of reagents)consume(s,r.id,r.count);
  s.combat.casts++;log(s,`${c.name} 施放 ${nameOf('spells',id)}`,'cast',{actorId:c.id,targetId:target.id,spellId:id,school:sp.School,duration:sp.castMs});
  if(name==='Tame Beast'){c.cast={spell:id,target:e.id,talentCast,timing,startedAt:s.clock,until:s.clock+sp.durationMs,next:s.clock+1000,interval:1000,channel:true,taming:true};c.nextAction=c.cast.until;}else if(prepared?.channel){const interval=classChannelInterval(sp);c.cast={spell:id,target:target.id,talentCast,timing,startedAt:s.clock,until:s.clock+sp.durationMs,next:s.clock+interval,interval,channel:true,extendedChannel:true,center:{x:e.position,y:e.positionY||0},friendly:target===c||actors.includes(target)};c.nextAction=c.cast.until;endTalentCast(s,c,sp,talentCast,{...api,actors,stats,rng,healAmount},{target});}
  else if(sp.castMs)c.cast={spell:id,target:target.id,talentCast,timing,startedAt:s.clock,until:s.clock+sp.castMs,classSpecial:specials.has(name)||extendedSpellNames.has(name)||talentActiveNames.has(name)||racialActiveNames.has(name)};
  else if(specials.has(name)||extendedSpellNames.has(name)||talentActiveNames.has(name)||racialActiveNames.has(name))classEffect(s,c,target,{...sp,talentCast},actors,api);else api.cast(s,c,e,{...sp,talentCast});
  return true;
 }
 return false;
}

export function tickClassEffects(s,actors,api){
 tickExtendedClassEffects(s,actors,{...api,healAmount});
 for(const c of actors.filter(a=>a.hp>0)){tickRacialEffects(s,c,{...api,actors,stats,healAmount});
  for(const hot of c.hots||[]){const source=actors.find(a=>a.id===hot.caster);while(source&&hot.next<=s.clock&&hot.next<=hot.until){healAmount(s,source,c,hot.amount,hot.spell);hot.next+=hot.interval;}}c.hots=(c.hots||[]).filter(h=>h.until>s.clock);
  if(c.bloodrage&&c.bloodrage.next<=s.clock&&c.bloodrage.next<=c.bloodrage.until){c.rage=Math.min(1000,(c.rage||0)+10);c.bloodrage.next+=1000;}
  for(const [element,t]of Object.entries(c.totems||{})){if(extendedSpellNames.has(t.name))continue;if(t.until<=s.clock){delete c.totems[element];continue;}if(t.next>s.clock)continue;t.next+=2000;const sp=spellInfo(c,t.spell),r=ranks(c);
   if(t.name==='Searing Totem'){const target=s.combat?.enemies.find(e=>e.hp>0&&!e.removed&&!protectCombatTarget(s,e)&&distance(t,e)<=20);if(target)api.damage(s,c,target,roll(s,...effectRange(c,spells[sp.Id===3599?3606:6350])),nameOf('spells',sp.Id),1,{spellId:sp.Id,school:2});}
   else for(const a of actors.filter(a=>a.hp>0&&distance(t,a)<=20)){if(t.name==='Healing Stream Totem')healAmount(s,c,a,effectRange(c,spells[5672])[0],sp.Id);else if(t.name==='Strength of Earth Totem')putBuff(s,a,{...sp,durationMs:2500},{str:effectRange(c,spells[sp.Id===8160?8162:8076])[0]});else a.stoneskin={amount:Math.abs(effectRange(c,spells[sp.Id===8071?8072:8156])[0]),until:s.clock+2500};}
  }
 }
}

export function petTick(s,pet,actors,damage){
 const owner=actors.find(c=>c.id===pet.ownerId);if(pet.mode==='passive'||pet.mode==='stay'||pet.mode==='follow'){if(pet.mode!=='stay'&&owner)moveToward(s,pet,owner,3,s.clock);return;}if(!owner||owner.hp<=0||pet.hp<=0||controlled(pet,s.clock))return;
 const e=s.combat.enemies.find(e=>e.id===pet.targetId&&e.hp>0)||s.combat.enemies.find(e=>e.hp>0&&!e.removed&&!protectCombatTarget(s,e));if(!e)return;
 if(!strategyAllows(s,owner,e,{SpellName:'Pet Attack'})){pet.cast=null;return;}
 pet.ownerMasterDemonologist=ranks(owner)['Master Demonologist']||0;
 if(petSpellTick(s,pet,owner,e,actors,{damage:(s,p,t,v,l,m,d)=>damage(s,p,t,v,'宠物 · '+l,m,{...d,ownerId:owner.id}),healAmount,stats,rng}))return;
 pet.ownerMasterDemonologist=ranks(owner)['Master Demonologist']||0;const range=pet.kind==='imp'?25:5;if(distance(pet,e)>range){moveToward(s,pet,e,range,s.clock);return;}if(pet.nextSwing>s.clock)return;pet.nextSwing=s.clock+pet.swing;
 const r=ranks(owner),mod=talentPetModifiers(owner,pet),mult=mod.damage*petHappinessMultiplier(pet)*(owner.raceId===2?1.05:1),critical=rng(s)<.05+mod.crit;pet.nextSwing=s.clock+pet.swing/(1+mod.haste);const before=e.hp;
 damage(s,pet,e,roll(s,Math.floor(pet.low),Math.ceil(pet.high))*mult*(critical?2:1)*(pet.kind==='imp'?1:1-armorReduction(e.armor,pet.level)),'宠物 · '+pet.name,pet.kind==='voidwalker'?2*(1+.1*(r['Improved Voidwalker']||0)):1,{spellId:pet.spell,school:pet.kind==='imp'?2:0,ownerId:owner.id,critical});onPetTalentEvent(s,owner,pet,{type:'damage',target:e,amount:before-e.hp,critical},{damage,healAmount,rng,stats,actors});
}

export function racialTick(s,c,enemies){
 if(c.petUnit||c.escortNpc||(c.racialReady||0)>s.clock)return;const max=stats(c).maxHp;
 if(c.raceId===5&&hasAura(c,7,s.clock)){c.auras=c.auras.filter(a=>a.type!==7);c.racialImmuneFearUntil=s.clock+5000;c.racialReady=s.clock+120000;log(s,c.name+' 使用亡灵意志','buff');}
 if(c.raceId===7&&(c.rootUntil>s.clock||hasAura(c,26,s.clock)||hasAura(c,33,s.clock)||c.slowUntil>s.clock)){c.rootUntil=0;c.slowUntil=0;c.movementSlows=[];c.auras=(c.auras||[]).filter(a=>![26,33].includes(a.type));c.racialReady=s.clock+60000;log(s,c.name+' 使用逃命专家','buff');}
 if(c.raceId===3&&c.hp<max*.5){c.racialBuff={kind:'stoneform',until:s.clock+8000};c.auras=(c.auras||[]).filter(a=>a.dispel!==4&&a.mechanic!==15);c.racialReady=s.clock+180000;log(s,c.name+' 使用石像形态','buff');}
 if(c.raceId===6&&c.hp<max*.5&&enemies.some(e=>e.hp>0&&distance(c,e)<=8)){for(const e of enemies.filter(e=>e.hp>0&&distance(c,e)<=8)){e.stunUntil=s.clock+2000;e.cast=null;}c.racialReady=s.clock+120000;log(s,c.name+' 使用战争践踏','buff');}
 if(c.raceId===2&&c.hp>max*.5&&[1,4,3,7].includes(c.classId)){c.racialBuff={kind:'bloodfury',until:s.clock+15000};c.racialReady=s.clock+120000;log(s,c.name+' 使用血性狂怒','buff');}
}
