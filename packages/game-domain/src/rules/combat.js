import {receive} from './inventory.js';
import {environmentDamage} from './class-environment.js';
import {classChannelTick,classIncoming,classMeleeProc,tameClassPet,gainHunterPetXp} from './class-spell-effects.js';
import {onTalentEvent,beginTalentCast,endTalentCast} from './talent-runtime.js';
import {point,distance} from '../../../sim-core/src/geometry.js';
import {detectsTarget,moveToward,moveAway,areaTargets,castRange,inSpellRange,groundArea,selfArea,spellRadius,aliveEnemy} from './combat-space.js';
import {initializeMetrics,recordMetric,finishCombat} from './combat-metrics.js';
import {ruleMatches,strategyAllows} from './combat-strategy.js';
import {launchProjectile,takeImpacts} from './combat-projectiles.js';
import { creatures, spells, monsterIdsAt, objectTemplates, creatureLoot, nameOf, table } from './catalog.js';
import { stats, enemy, knownRank, spellInfo, effectRange, armorReduction, talentRank, rng, roll, log, gainXp, killXp } from './character.js';
import { creditKill, lootRows } from './quests.js';
import {skinBeast} from './professions.js';
import {useStrategyPotion} from './consumables.js';
import {stanceModifiers,gainRage,effectiveArmor,weaponDamage,resolveHeal,decideCompanion,companionTarget,stanceAllows,interruptPriestForRescue,decidePriestDefense} from './companion-combat.js';
import {companionSkills} from './party.js';
import {activeAuras,controlled,rooted,hasAura,movementMultiplier,addMovementSlow,addCombatAura,attackTimeMultiplier,schoolImmune,physicalDamageBonus} from '../../../sim-core/src/combat-auras.js';
import {enemyAITick,enemyDesiredRange} from './enemy-ai.js';
import {tickEnemyAuras,tickEnemySpell,tickEnemyProjectiles} from './enemy-spells.js';
import {initializeSmite,smiteTick} from './smite.js';
import {triggerMeleeProcs} from './enemy-procs.js';
import {enemyMeleeTick} from './enemy-melee.js';
import {combatMembers} from './combat-members.js';
import {dismount} from './mounts.js';
import {canPolymorph,polymorphTarget,applyPolymorph,tickPolymorph} from './polymorph.js';
import {decideClass,classEffect,tickClassEffects,petTick,racialTick,healAmount} from './class-mechanics.js';
import {talentModifiers,abilityDamageMultiplier,spellCritBonus,ranks,talentSpellValue,talentSchoolThreat,talentOffhandMultiplier,talentArmorPenetration,talentCombatDefense} from './talent-effects.js';

export const defaultRules = [
 {spell:122,condition:'enemyNear',value:8,enabled:true},
 {spell:2136,condition:'targetHealthBelow',value:25,enabled:true},
 {spell:116,condition:'always',value:0,enabled:true},
 {spell:133,condition:'always',value:0,enabled:true},
];
export function startCombat(s, ids, dungeon=false,prepared=null) {
 dismount(s);if(s.activity.type==='mount')s.activity={type:'idle'};
 s.groundEffects=[]; // A new encounter establishes a new local coordinate frame.
 s.combat={id:'encounter-'+(s.encounterSequence=(s.encounterSequence||0)+1),startedAt:s.clock,dungeon,participantIds:combatMembers(s,null).map(c=>c.id),projectiles:[],enemies:prepared||ids.map((id,i)=>enemy(s,id,'enemy-'+i)),damage:{},healing:{},casts:0,pendingSpawns:[]};
 for(const c of combatMembers(s)){c.rest=null;c.cast=null;c.nextAction=s.clock;c.nextSwing=s.clock;c.position=c.classId===1?20:c.classId===4?18:0;c.positionY=c.id===s.id||c.classId===1?0:c.classId===4?2:c.classId===5?-4:4;c.time=s.clock;c.nextPowerRegen=s.clock+2000;c.combo=0;c.comboTarget=null;c.queuedStrike=null;}
 for(const [i,e] of s.combat.enemies.entries()){e.position=30+Math.floor(i/3)*2;e.positionY=i===0?0:(i%2?1:-1)*Math.ceil(i/2)*2;e.nextAttack=s.clock;e.nextSpell=s.clock+6000;}
 initializeMetrics(s);
 for(const e of s.combat.enemies)initializeSmite(s,e,combatMembers(s),hurtPlayer);
 log(s,'遭遇：'+s.combat.enemies.map(e=>e.name).join('、'),'combat');
}
function recordDamage(s,c,target,amount,label,threatMultiplier=1,detail={}){
 c.stealthed=false;
 const sp=spells[detail.spellId],school=detail.school??sp?.School??0;if(school===0&&!detail.periodic)amount+=physicalDamageBonus(c,s.clock);for(const a of activeAuras(target,s.clock))if(a.type===14&&(a.misc&(1<<school))&&(a.charges==null||a.charges>0)){amount+=a.amount;if(a.charges>0)a.charges--;}if(!detail.talentProc)amount*=abilityDamageMultiplier(c,sp,{...target,creatureType:creatures[target.entry]?.CreatureType},!!detail.periodic);
 threatMultiplier*=talentSchoolThreat(c,sp?.School||0);if(sp)threatMultiplier*=talentSpellValue(c,sp,2,1);
 if(c.form==='bear')threatMultiplier*=1+.03*(ranks(c)['Feral Instinct']||0);
 for(const a of activeAuras(c,s.clock))if(a.type===79&&(a.misc&(1<<(detail.school??sp?.School??0))))amount*=1+a.amount/100;
 const stance=stanceModifiers(c);amount*=stance.damage;threatMultiplier*=stance.threat;
 if(schoolImmune(target,detail.school??sp?.School??0,s.clock))return;
 if(target.hp<=0||target.removed||['weakened','captured'].includes(target.capturePhase))return;const dealt=Math.min(target.capturePhase?Math.max(0,target.hp-1):target.hp,Math.max(0,Math.round(amount)));target.hp-=dealt;target.polyUntil=0;if(dealt>0)target.auras=(target.auras||[]).filter(a=>!((spells[a.spell]?.AuraInterruptFlags||0)&2));recordMetric(s,c,target,dealt,{...detail,label,effective:true});
 for(const a of activeAuras(c,s.clock))if(a.type===10&&(a.misc&(1<<(detail.school??sp?.School??0))))threatMultiplier*=1+a.amount/100;
 target.threat[c.id]=(target.threat[c.id]||0)+dealt*threatMultiplier;
 const key=c.name+' · '+label;s.combat.damage[key]=(s.combat.damage[key]||0)+dealt;
 log(s,`${c.name} 的${label}对 ${target.name} 造成 ${dealt} 点伤害`,'damage',{actorId:c.id,targetId:target.id,amount:dealt,action:label,...detail});
 if(label==='近战攻击'){gainRage(c,dealt,true);const wrath=ranks(c)['Unbridled Wrath']||0;if(wrath&&rng(s)<.08*wrath)c.rage=Math.min(1000,(c.rage||0)+10);}
 const melee=label==='近战攻击'||detail.hand==='off'||detail.spellId&&spells[detail.spellId]?.DmgClass===2;
 if(dealt>0&&melee)triggerMeleeProcs(s,target,c,label==='近战攻击'?8:32,combatMembers(s),hurtPlayer);
 if(target.capturePhase==='fighting'&&target.hp/target.maxHp<.01){target.capturePhase='weakened';target.captureUntil=s.clock+29500;target.stunUntil=s.clock+30000;target.cast=null;target.dots=[];log(s,'裂隙怒灵已经虚弱，使用收容箱进行捕获！','quest');}
 onTalentEvent(s,c,{type:'damage',target,spell:sp,amount:dealt,critical:detail.critical,periodic:detail.periodic,melee,comboBuilder:['Sinister Strike','Backstab','Ambush','Ghostly Strike','Hemorrhage'].includes(sp?.SpellName),talentProc:detail.talentProc},{damage:recordDamage,healAmount,stats,rng,actors:combatMembers(s)});
 if(target.hp===0){for(const claim of target.soulShardClaims||[]){const claimant=combatMembers(s).find(a=>a.id===claim.caster);if(claimant===s&&claim.until>=s.clock&&(!claim.channel||claimant.cast?.spell===claim.spell)&&killXp(s.level,target.level)>0){try{receive(s,claim.item,1);}catch{log(s,'背包已满，无法保存灵魂碎片','bag');}}}target.soulShardClaims=[];onTalentEvent(s,c,{type:'kill',target,spell:sp},{damage:recordDamage,healAmount,stats,rng,actors:combatMembers(s)});target.dead=true;target.cast=null;const tap=ranks(c)['Spirit Tap']||0;if(tap&&rng(s)<.2*tap)c.spiritTapUntil=s.clock+15000;log(s,target.name+' 被击败','kill');}
}
function spellLands(s,c,e,sp){
 if(schoolImmune(e,sp.School,s.clock)){log(s,`${e.name} 免疫了 ${nameOf('spells',sp.Id)}`,'miss',{actorId:c.id,targetId:e.id,spellId:sp.Id});return false;}
 const difference=e.level-c.level;
 let miss=difference<=2?.04+difference*.01:.17+(difference-3)*.11;
 miss-=talentSpellValue(c,sp,16,0)/100+(stats(c).spellHit||0);
 if(rng(s)<Math.max(.01,Math.min(.99,miss))){log(s,`${e.name} 抵抗了 ${nameOf('spells',sp.Id)}`,'miss',{actorId:c.id,targetId:e.id,spellId:sp.Id});return false;}return true;
}
function magicHit(s,c,e,sp,n,periodic=false){
 const [low,high]=effectRange(c,sp,n);let amount=roll(s,low,high);
 const coefficient=table('spell_bonus_data').find(r=>r.entry===(spells[sp.Id]?.SpellName==='Frostbolt'?116:sp.Id));
 const bonus=periodic?(coefficient?.dot_bonus||0):(coefficient?.direct_bonus??Math.min(1,sp.castMs/3500));
 amount+=(stats(c).spellPower+(stats(c)['schoolPower'+(1<<sp.School)]||0))*bonus*Math.max(0,1-Math.max(0,20-sp.SpellLevel)*.0375);
 
 const critical=!periodic&&rng(s)<stats(c).spellCrit+spellCritBonus(c,sp,e);
 if(critical)amount*=1+.5*talentSpellValue(c,sp,15,100)/100;
 recordDamage(s,c,e,amount,nameOf('spells',sp.Id)+(critical?'（暴击）':''),1,{spellId:sp.Id,school:sp.School,critical,periodic});
 if(sp.School===2&&talentRank(c,'Impact')&&rng(s)<.02*talentRank(c,'Impact'))e.stunUntil=s.clock+2000;
 // 12654 is the pinned fire-school periodic Ignite effect, not a talent rank.
 if(critical&&sp.School===2&&talentRank(c,'Ignite'))e.dots.push({caster:c.id,spellId:12654,school:2,amount:Math.round(amount*.04*talentRank(c,'Ignite')),next:s.clock+2000,interval:2000,remaining:2,label:'点燃'});
 if(!periodic&&talentRank(c,'Arcane Concentration')&&rng(s)<.02*talentRank(c,'Arcane Concentration'))c.clearcasting=true;
}
function resolveSpell(s,c,e,sp,center){
 if((!e||e.hp<=0)&&!groundArea(sp))return;
 if(sp.SpellName==='Counterspell'){if(e.cast){const school=spells[e.cast.spell]?.School;e.cast=null;e.schoolLockouts??={};e.schoolLockouts[school]=s.clock+10000;log(s,`${c.name} 打断了 ${e.name}`,'interrupt',{actorId:c.id,targetId:e.id,spellId:sp.Id});}return;}
 if(sp.SpellName==='Polymorph'){if(canPolymorph(e,sp)&&spellLands(s,c,e,sp))applyPolymorph(s,c,e,sp);return;}
 const targets=areaTargets(s,c,e,sp,center);
 if(sp.SpellName==='Flamestrike'){const n=2,interval=sp['EffectAmplitude'+n]||2000,origin=center||point(e);s.groundEffects??=[];s.groundEffects=s.groundEffects.filter(a=>!(a.side==='friendly'&&a.caster===c.id&&a.spell===sp.Id));s.groundEffects.push({side:'friendly',caster:c.id,spell:sp.Id,spellId:sp.Id,school:sp.School,position:origin.x,positionY:origin.y,center:origin,radius:spellRadius(sp),effect:n,interval,next:s.clock+interval,until:s.clock+sp.durationMs});}
 if(selfArea(sp)||groundArea(sp))log(s,nameOf('spells',sp.Id)+' 生效','impact',{actorId:c.id,targetId:e?.id,spellId:sp.Id,school:sp.School,center:selfArea(sp)?point(c):center||point(e),radius:spellRadius(sp)});
 for(const target of targets){if(!spellLands(s,c,target,sp))continue;for(let n=1;n<=3;n++){
  const effect=sp['Effect'+n],aura=sp['EffectApplyAuraName'+n];
  if(effect===2)magicHit(s,c,target,sp,n);
  if(effect===6&&aura===3&&sp.durationMs){
   target.dots=target.dots.filter(dot=>!(dot.caster===c.id&&dot.effect===n&&spells[dot.spell]?.SpellName===sp.SpellName));
   const duration=sp.durationMs;
   target.dots.push({caster:c.id,spell:sp.Id,effect:n,next:s.clock+(sp['EffectAmplitude'+n]||2000),interval:sp['EffectAmplitude'+n]||2000,remaining:Math.floor(duration/(sp['EffectAmplitude'+n]||2000))});
  }
  if(effect===6&&aura===33){addMovementSlow(target,{caster:c.id,spell:sp.Id,until:s.clock+sp.durationMs,amount:Math.min(.9,Math.abs(sp['EffectBasePoints'+n]+1)/100+(talentRank(c,'Permafrost')?[0,.04,.07,.1][talentRank(c,'Permafrost')]:0))},s.clock);if(rng(s)<.05*talentRank(c,'Frostbite')){target.rootUntil=s.clock+5000;target.frozenUntil=target.rootUntil;}}
  if(effect===6&&aura===26){target.rootUntil=s.clock+sp.durationMs;if(sp.School===4)target.frozenUntil=target.rootUntil;}
  if(effect===6&&[9,138].includes(aura))addCombatAura(target,{spell:sp.Id,effect:n,type:aura,amount:sp['EffectBasePoints'+n]+1,until:s.clock+sp.durationMs,caster:c.id},s.clock);
 }}
}
function releaseSpell(s,c,e,sp,center){
 const aim=groundArea(sp)?center||e:e;
 if(!strategyAllows(s,c,e,sp,undefined,center)){log(s,'施法取消：保护控场或等待坦克','cancel',{actorId:c.id,targetId:e?.id??null,spellId:sp.Id});return;}
 if(!aim||!groundArea(sp)&&!aliveEnemy(e)||!inSpellRange(c,aim,sp)){log(s,'施法取消：目标失效或超出距离','cancel',{actorId:c.id,targetId:e?.id,spellId:sp.Id});return;}
 if(!launchProjectile(s,c,e,sp)){resolveSpell(s,c,e,sp,center);endTalentCast(s,c,sp,sp.talentCast,{damage:recordDamage,healAmount,rng,stats,actors:combatMembers(s)},{target:e});}
}
function tickPlayerEffects(s,actors){
 for(const p of takeImpacts(s,'friendly')){const c=actors.find(c=>c.id===p.actorId),e=s.combat.enemies.find(e=>e.id===p.targetId);if(c&&e&&aliveEnemy(e)){const sp={...spellInfo(c,p.spellId),talentCast:p.talentCast};resolveSpell(s,c,e,sp);endTalentCast(s,c,sp,p.talentCast,{damage:recordDamage,healAmount,rng,stats,actors},{target:e});}}
 for(const area of s.groundEffects||[])if(area.side==='friendly'&&!area.extended){
  const c=actors.find(c=>c.id===area.caster);if(!c)continue;
  while(area.next<=s.clock&&area.next<=area.until){for(const victim of s.combat.enemies.filter(e=>aliveEnemy(e)&&distance(e,area)<=area.radius))magicHit(s,c,victim,spellInfo(c,area.spell),area.effect,true);area.next+=area.interval;}
 }
}
const manualMageSpells=new Set(['Fireball','Frostbolt','Arcane Missiles','Polymorph','Fire Blast','Frost Nova','Arcane Explosion','Flamestrike','Blizzard','Counterspell','Scorch']);
export function commandCombatCast(s,c,id,targetId){
 if(!s.combat||!combatMembers(s).includes(c))throw new Error('需要角色正在参与战斗');
 const sp=spellInfo(c,id);if(c.classId!==8||!sp||!manualMageSpells.has(sp.SpellName))throw new Error('当前手动战斗施法支持法师伤害与控场法术；其他技能请使用自己的战斗策略');
 if(!c.learned.includes(id))throw new Error('角色尚未学习这个法术');
 if(c.hp<=0||c.cast||(c.nextAction||0)>s.clock||(c.globalCooldown||0)>s.clock)throw new Error('角色当前不能开始新的施法');
 const enemy=s.combat.enemies.find(e=>e.id===targetId&&aliveEnemy(e)&&!e.controlledBy);if(!enemy)throw new Error('请选择当前战斗中的存活敌人');
 if(!decideMage(s,c,enemy,[{spell:id,condition:'always',value:0,enabled:true}]))throw new Error('法术资源、冷却、距离或控场策略不满足要求');
}
function decideMage(s,c,focus,rules=c.rules||defaultRules){
 for(const rule of rules){if(!rule.enabled)continue;const id=knownRank(c,rule.spell);if(!id)continue;const sp=spellInfo(c,id),e=sp.SpellName==='Polymorph'?polymorphTarget(s,c,focus,sp,rule):focus;if(!e||!ruleMatches(s,c,e,rule,sp)||!strategyAllows(s,c,e,sp,rule))continue;
  if(c.silenceUntil>s.clock||hasAura(c,27,s.clock)||(c.schoolLockouts?.[sp.School]||0)>s.clock||(c.cooldowns[id]||0)>s.clock||c.mana<(c.clearcasting?0:sp.mana))continue;
  if(sp.range>10&&!groundArea(sp)&&rooted(e,s.clock)&&distance(c,e)<=8&&!rooted(c,s.clock)){moveAway(c,e,s.clock);return true;}
  if(!inSpellRange(c,e,sp)){moveToward(c,e,castRange(sp),s.clock);return true;}
  const talentCast=beginTalentCast(s,c,sp);c.mana-=c.clearcasting?0:sp.mana;c.clearcasting=false;c.lastManaUse=s.clock;c.cooldowns[id]=s.clock+sp.cooldownMs;c.nextAction=s.clock+Math.max(1500,sp.castMs);s.combat.casts++;
  log(s,`${c.name} 施放 ${nameOf('spells',id)}`,'cast',{actorId:c.id,targetId:e.id,spellId:id,school:sp.School,duration:sp.castMs||sp.durationMs,center:selfArea(sp)?point(c):point(e),radius:spellRadius(sp)});
  if(sp.ChannelInterruptFlags&&sp.durationMs){c.cast={spell:id,target:e.id,talentCast,startedAt:s.clock,until:s.clock+sp.durationMs,next:s.clock+1000,channel:true,center:point(e)};c.nextAction=c.cast.until;}
  else if(sp.castMs)c.cast={spell:id,target:e.id,talentCast,startedAt:s.clock,until:s.clock+sp.castMs,channel:false,polymorph:sp.SpellName==='Polymorph',center:groundArea(sp)?point(e):null};else releaseSpell(s,c,e,{...sp,talentCast});
  return true;
 }
 return false;
}
function melee(s,c,e){if(c.talentProcs?.spiritOfRedemption?.until>s.clock)return;if(!strategyAllows(s,c,e,{SpellName:'Melee'}))return;const weapon=!hasAura(c,67,s.clock)&&c.equipment[16];const data=weapon&&itemsForWeapon(weapon.id);const swing=(c.escortNpc?c.swing:(data?.delay||2000))*attackTimeMultiplier(c,s.clock)/(1+talentModifiers(c).meleeHastePct);if(distance(e,c)>5){moveToward(c,e,5,s.clock);return;}if(s.clock<c.nextSwing)return;
 c.nextSwing=s.clock+swing;c.swingStartedAt=s.clock;
 const queued=!hasAura(c,67,s.clock)&&c.queuedStrike&&spellInfo(c,c.queuedStrike),strike=queued&&c.rage>=queued.mana&&stanceAllows(c,queued)&&strategyAllows(s,c,e,queued)?queued:null;c.queuedStrike=null;
 if(strike){c.rage-=strike.mana;log(s,`${c.name} 施放 ${nameOf('spells',strike.Id)}`,'cast',{actorId:c.id,targetId:e.id,spellId:strike.Id});}
 const dodge=activeAuras(e,s.clock).filter(a=>a.type===47).reduce((n,a)=>n+a.amount/100,0);
 if(rng(s)<Math.max(0,Math.min(1,.05+dodge+(e.level*5-(stats(c).weaponSkill||c.level*5))*.0004-talentModifiers(c).hit))){log(s,c.name+' 的攻击未命中','miss',{actorId:c.id,targetId:e.id,action:'近战攻击'});return;}
 const extra=strike?effectRange(c,strike)[0]*(strike.SpellName==='Cleave'?1+.4*(ranks(c)['Improved Cleave']||0):1):0;
 const critical=rng(s)<stats(c).crit;
 const raw=c.escortNpc?roll(s,Math.floor(c.low),Math.ceil(c.high)):(weaponDamage(s,c)+extra)*(critical?2:1);const victims=strike?.SpellName==='Cleave'&&strategyAllows(s,c,e,strike)?areaTargets(s,c,e,strike):[e];for(const victim of victims){const damage=raw*(1-armorReduction(effectiveArmor(victim,s.clock)-talentArmorPenetration(c),c.level));recordDamage(s,c,victim,damage,strike?nameOf('spells',strike.Id):'近战攻击',1,strike?{spellId:strike.Id,school:0,critical}:{critical});}
 if(strike)e.threat[c.id]=(e.threat[c.id]||0)+(table('spell_threat').find(r=>r.entry===strike.Id)?.Threat||0)*stanceModifiers(c).threat;
 classMeleeProc(s,c,e,{damage:recordDamage,healAmount,stats,rng,actors:combatMembers(s)});
 if(c.seal?.until>s.clock&&spells[c.seal.spell]?.SpellName==='Seal of Righteousness'){
  const seal=spellInfo(c,c.seal.spell),speed=(data?.delay||2000)/1000,trigger=effectRange(c,seal)[0],twoHanded=data?.InventoryType===17;
  // Pinned UnitAuraProcHandler.cpp Seal of Righteousness dummy proc formula.
  const base=twoHanded?1.2*trigger*1.2*1.03*speed/100+1:.85*Math.ceil(trigger*1.2*1.03*speed/100)-1;
  const holy=Math.max(0,Math.trunc(base+.03*((data?.dmg_min1||1)+(data?.dmg_max1||2))/2)+1+stats(c).spellPower*(twoHanded?.108:.092)*speed);
  recordDamage(s,c,e,holy,'正义圣印',1,{spellId:seal.Id,school:1});
 }
 const rockbiter=c.classBuffs?.find(b=>b.name==='Rockbiter Weapon'&&b.until>s.clock);if(rockbiter)e.threat[c.id]=(e.threat[c.id]||0)+({8017:6,8018:10,8019:16}[rockbiter.spell]||0);
}
function offhand(s,c,e){if(c.talentProcs?.spiritOfRedemption?.until>s.clock)return;
 const weapon=itemsForWeapon(c.equipment?.[17]?.id);if(!weapon||weapon.class!==2||!c.learned.includes(674)||hasAura(c,67,s.clock)||distance(c,e)>5||(c.nextOffhand||0)>s.clock||!strategyAllows(s,c,e,{SpellName:'Melee'}))return;
 c.offhandStartedAt=s.clock;c.nextOffhand=s.clock+(weapon.delay||2000)*attackTimeMultiplier(c,s.clock);if(rng(s)<Math.max(.01,.24-talentModifiers(c).hit))return;
 const raw=(roll(s,weapon.dmg_min1||1,weapon.dmg_max1||2)+stats(c).attackPower/14*(weapon.delay||2000)/1000)*.5*talentOffhandMultiplier(c);
 recordDamage(s,c,e,raw*(1-armorReduction(effectiveArmor(e,s.clock)-talentArmorPenetration(c),c.level)),'副手攻击',1,{school:0,hand:'off'});classMeleeProc(s,c,e,{damage:recordDamage,healAmount,stats,rng,actors:combatMembers(s)},17);
}
let itemLookup;
function itemsForWeapon(id){itemLookup??=Object.fromEntries(table('item_template').map(i=>[i.entry,i]));return itemLookup[id];}
function hunterShot(s,c,e){
 if(!c.learned.includes(75)||!strategyAllows(s,c,e,{SpellName:'Auto Shot'}))return;
 const weapon=itemsForWeapon(c.equipment[18]?.id);if(!weapon||c.equipment[18]?.durability===0){melee(s,c,e);return;}
 if(distance(c,e)<8){melee(s,c,e);return;}if(distance(c,e)>35){moveToward(c,e,35,s.clock);return;}if(s.clock<(c.nextRanged||0))return;
 const hawk=ranks(c)['Improved Aspect of the Hawk']||0,aspect=c.classBuffs?.find(b=>b.name==='Aspect of the Hawk'&&b.until>s.clock),aspectSpell=spells[aspect?.spell];if(hawk&&aspectSpell&&rng(s)<talentSpellValue(c,aspectSpell,18,aspectSpell.ProcChance)/100)c.hawkHasteUntil=s.clock+spellInfo(c,6150).durationMs;
 c.rangedStartedAt=s.clock;c.nextRanged=s.clock+Math.max(500,weapon.delay||2000)/(c.hawkHasteUntil>s.clock?1+(spells[6150].EffectBasePoints1+1)/100:1)/(1+activeAuras(c,s.clock).filter(a=>a.type===140).reduce((n,a)=>n+a.amount/100,0));const raw=roll(s,weapon.dmg_min1||1,weapon.dmg_max1||2)+((stats(c).rangedAttackPower||0)+activeAuras(e,s.clock).filter(a=>a.type===127).reduce((n,a)=>n+a.amount,0))/14*(weapon.delay||2000)/1000;
 if(rng(s)<Math.max(0,.05+(e.level-c.level)*.002-Math.max(0,(stats(c).rangedWeaponSkill||c.level*5)-c.level*5)*.0004-(stats(c).hit||0))){log(s,c.name+' 的自动射击未命中','miss',{actorId:c.id,targetId:e.id,spellId:75});return;}const critical=rng(s)<stats(c).crit+.01*(ranks(c)['Lethal Shots']||0);recordDamage(s,c,e,raw*(critical?2:1)*(1-armorReduction(e.armor,c.level)),'自动射击',1,{spellId:75,school:0,critical});
}
function countLeaderDeath(s){if(s.combat&&s.hp<=0&&!s.combat.leaderDeathCounted){s.totals.deaths++;s.combat.leaderDeathCounted=true;}}
export function hurtPlayer(s,e,c,amount,label='攻击',detail={}){
 if(c===s&&s.activity.type==='mount'&&amount>0){s.activity={type:'idle',reason:'受到伤害，骑乘中断。'};}
 c.rest=null;c.stealthed=false;if(amount>0){c.cannibalize=null;c.shadowmeld=null;}
 if(!detail.environmental){amount=classIncoming(s,e,c,amount,detail,{damage:recordDamage,healAmount,stats,rng,actors:combatMembers(s)});amount=onTalentEvent(s,c,{type:'incoming',target:e,spell:spells[detail.spellId],amount,periodic:detail.periodic,melee:!detail.periodic&&!detail.spellId,critical:detail.critical},{damage:recordDamage,healAmount,stats,rng,actors:combatMembers(s)});if(amount<=0)return;
 if((detail.school??spells[detail.spellId]?.School??0)===0&&c.stoneskin?.until>s.clock){amount=Math.max(0,amount-c.stoneskin.amount);if(!amount)return;}
 
 if(c.absorb?.until>s.clock&&c.absorb.amount>0&&(!c.absorb.schoolMask||(c.absorb.schoolMask&(1<<(detail.school??spells[detail.spellId]?.School??0))))){const absorbed=Math.min(c.absorb.amount,amount);c.absorb.amount-=absorbed;amount-=absorbed;log(s,c.name+' 的护盾吸收了 '+Math.round(absorbed)+' 点伤害','absorb',{actorId:c.id,targetId:c.id,amount:absorbed,spellId:c.absorb.spell});if(amount<=0)return;}
 if(detail.school>0){const resist=stats(c).resistances?.[detail.school]??talentCombatDefense(c).resistances[detail.school]??0;amount*=1-Math.min(.75,resist/Math.max(1,e.level*5)*.75);}
 }const damage=Math.min(c.hp,Math.max(1,Math.round(amount*(detail.environmental?1:stanceModifiers(c).incoming))));c.hp-=damage;gainRage(c,damage,false);log(s,`${e.name} 的${label}对 ${c.name} 造成 ${damage} 点伤害`,'incoming',{actorId:e.id,targetId:c.id,amount:damage,action:label,...detail});
 if(damage>0)environmentDamage(c);
 const protection=c.cast?Math.min(1,(talentSpellValue(c,spells[c.cast.spell],9,0)+activeAuras(c,s.clock).filter(a=>[149,117].includes(a.type)).reduce((n,a)=>n+a.amount,0))/100):0;
 if(!detail.periodic&&c.cast&&rng(s)>=protection){if(c.cast.channel){c.cast.until-=Math.max(0,(spellInfo(c,c.cast.spell).durationMs||0)*.25);}else{c.cast.until+=Math.max(200,1000-(c.cast.pushbacks||0)*200);c.cast.pushbacks=(c.cast.pushbacks||0)+1;c.nextAction=Math.max(c.nextAction,c.cast.until);}}
 if(c.hp===0){c.cast=null;if(c===s){dismount(s);countLeaderDeath(s);}log(s,c.name+' 倒下了','death',{actorId:c.id});}
 const melee=!detail.periodic&&(!detail.spellId||spells[detail.spellId]?.DmgClass===2);
 if(damage>0&&melee){const actors=combatMembers(s);triggerMeleeProcs(s,e,c,detail.spellId?16:4,actors,hurtPlayer,!!detail.extraAttack);triggerMeleeProcs(s,c,e,detail.spellId?32:8,actors,hurtPlayer,!!detail.extraAttack);}
 if(damage>0&&melee&&c.thorns?.until>s.clock&&e.hp>0)recordDamage(s,c,e,c.thorns.amount,'荆棘术',1,{spellId:c.thorns.spell,school:3});
}
export function expireCapture(s){
 const battle=s.combat;if(!battle)return;
 for(const e of battle.enemies)if(['weakened','captured'].includes(e.capturePhase)&&s.clock>=e.captureUntil&&!e.removed){e.removed=true;log(s,e.capturePhase==='captured'?'封灵箱可以拾取了。':'裂隙怒灵消散了，需要重新显形。','quest');}
 if(battle.enemies.every(e=>e.removed)){finishCombat(s);s.nextPull=s.clock+3000;s.cast=null;}
}
export function combatTick(s){
 const battle=s.combat;if(!battle)return;initializeMetrics(s);const actors=combatMembers(s);for(const c of actors){c.time=s.clock;const st=stats(c);c.currentMaxHp=st.maxHp;c.currentMaxMana=st.maxMana;}
 for(const e of battle.enemies){const template=creatures[e.entry];e.moveSpeed??=7*(template?.SpeedRun||1);e.walkSpeed??=2.5*(template?.SpeedWalk||1);}
 tickPolymorph(s);tickPlayerEffects(s,actors);tickEnemyProjectiles(s,actors,hurtPlayer);tickEnemyAuras(s,actors,hurtPlayer);
 tickInfernalFire(s,actors);const classApi={damage:recordDamage,cast:releaseSpell,heal:resolveHeal,healAmount,lands:spellLands,summonInfernal,doomRitual:beginDoomRitual,rng,stats,actors};tickClassEffects(s,actors,classApi);
 for(const summon of battle.pendingSpawns||[])if(summon.at<=s.clock){const e=summon.profile;e.position=30;e.positionY=0;e.nextAttack=s.clock;e.nextSpell=s.clock+6000;battle.enemies.push(e);log(s,e.name+' 加入了战斗！','combat');}
 battle.pendingSpawns=(battle.pendingSpawns||[]).filter(p=>p.at>s.clock);
 for(const c of actors.filter(c=>c.hp>0)){
  racialTick(s,c,battle.enemies);onTalentEvent(s,c,{type:'tick'},{...classApi});
  if(c.totemUnit)continue;
  if(c.petUnit){petTick(s,c,actors,recordDamage);continue;}
  if(controlled(c,s.clock)){c.cast=null;const fear=activeAuras(c,s.clock).find(a=>a.type===7),caster=fear&&battle.enemies.find(e=>e.id===fear.caster);if(caster&&!hasAura(c,12,s.clock))moveAway(c,caster,s.clock);continue;}
  useStrategyPotion(s,c);
  if(c.nextPowerRegen<=s.clock){c.nextPowerRegen+=2000;if(c.classId===4||c.form==='cat')c.energy=Math.min(stats(c).maxEnergy||100,(c.energy||0)+20);}
  interruptPriestForRescue(s,c,actors);
  if(c.cast){const cast=c.cast,sp={...spellInfo(c,cast.spell),talentCast:cast.talentCast},target=battle.enemies.find(e=>e.id===cast.target)||(cast.friendly?actors.find(a=>a.id===cast.target):null);
   const channelAim=groundArea(sp)?cast.center||target:target;
   if(cast.channel&&(!channelAim||!groundArea(sp)&&!aliveEnemy(target)||!inSpellRange(c,channelAim,sp)||!cast.friendly&&!strategyAllows(s,c,target,sp,undefined,groundArea(sp)?cast.center:undefined))){c.cast=null;c.nextAction=s.clock;log(s,'引导中止：目标、距离或控场保护','cancel',{actorId:c.id,spellId:sp.Id});continue;}
   if(cast.channel&&s.clock>=cast.next){if((target&&target.hp>0)||groundArea(sp)){
    if(cast.taming||cast.controlChannel){}else if(cast.extendedChannel)classChannelTick(s,c,target,sp,cast,actors,classApi);
    else if(sp.SpellName==='Blizzard'){for(const victim of areaTargets(s,c,target,sp,cast.center))magicHit(s,c,victim,sp,1,true);}
    else{const triggered=sp.EffectTriggerSpell1;if(triggered)releaseSpell(s,c,target,spellInfo(c,triggered));}
   }cast.next+=cast.interval||1000;}
   if(s.clock>=cast.until){if(cast.taming){if(target?.hp>0&&inSpellRange(c,target,sp))tameClassPet(s,c,target,sp);}else if(cast.classSpecial){const recipient=actors.find(a=>a.id===cast.target)||target;if(recipient?.hp>0&&(recipient===c||inSpellRange(c,recipient,sp)))classEffect(s,c,recipient,sp,actors,classApi);}else if(cast.friendly)resolveHeal(s,c,actors.find(a=>a.id===cast.target),sp);else if(!cast.channel)releaseSpell(s,c,target,sp,cast.center);else endTalentCast(s,c,sp,cast.talentCast,classApi,{target});if(c.cast===cast)c.cast=null;}else continue;
  }
  const targets=battle.enemies.filter(aliveEnemy);const e=companionTarget(s,c,targets);if(!e)break;
  if(s.clock>=c.nextAction){if(decidePriestDefense(s,c,actors,classApi))continue;if(decideClass(s,c,e,actors,classApi))continue;if(c.classId===8&&decideMage(s,c,e))continue;if([1,4,5].includes(c.classId))decideCompanion(s,c,targets,actors,recordDamage,spellLands,classApi);}
  if(!c.cast&&!c.stealthed)offhand(s,c,e);
  if(c.classId===3&&!c.cast)hunterShot(s,c,e);
  else if(!c.cast&&!c.stealthed&&(c.classId!==5||c===s)&&!(c.classId===8&&s.clock<c.nextAction)&&(![7,9,11].includes(c.classId)||c.form||s.clock>=c.nextAction))melee(s,c,e);
 }
 for(const e of battle.enemies){
  if(e.despawnAt&&s.clock>=e.despawnAt){e.removed=true;e.cast=null;delete e.controlledBy;continue;}
  if(e.hp<=0||e.removed||e.controlledBy||['weakened','captured'].includes(e.capturePhase))continue;
  for(const dot of e.dots){if(dot.remaining>0&&s.clock>=dot.next){const caster=actors.find(c=>c.id===dot.caster);if(caster){if(dot.manaDrain){const drain=Math.min(e.mana||0,dot.amount);e.mana-=drain;caster.mana=Math.min(stats(caster).maxMana,caster.mana+drain*(dot.manaReturn||0));}else if(dot.spell)magicHit(s,caster,e,spellInfo(caster,dot.spell),dot.effect,true);else {const before=e.hp;recordDamage(s,caster,e,dot.amount,dot.label,1,{spellId:dot.spellId??(dot.label==='点燃'?12654:undefined),school:dot.school??(dot.label==='点燃'?2:undefined),periodic:true});if(dot.leech)healAmount(s,caster,caster,(before-e.hp)*dot.leech,dot.spellId);}}dot.remaining--;dot.next+=dot.interval;}}
  e.dots=e.dots.filter(d=>d.remaining>0);tickEnemySpell(s,e,actors,hurtPlayer);if(e.hp<=0||e.stunUntil>s.clock||e.polyUntil>s.clock)continue;
  const alive=actors.filter(c=>c.hp>0&&(!c.stealthed||c.feignResisted?.includes(e.id)||!c.feignUntil&&detectsTarget(e,c,s.clock)));if(!alive.length)continue;
  const threat=c=>Math.max(0,(e.threat[c.id]||0)-(c.fade?.until>s.clock?c.fade.amount:0)),current=alive.find(c=>c.id===e.target),ordered=[...alive].sort((a,b)=>threat(b)-threat(a)),forced=e.tauntUntil>s.clock&&alive.find(c=>c.id===e.tauntedBy);
  const challenger=current&&ordered.find(c=>c.id!==current.id&&threat(c)>threat(current)*(distance(c,e)<=5?1.1:1.3));
  const target=forced||challenger||current||ordered[0];e.target=target.id;
  if(smiteTick(s,e,actors,hurtPlayer))continue;
  enemyAITick(s,e,actors,hurtPlayer);
  if(e.despawnAt&&s.clock>=e.despawnAt){e.removed=true;e.cast=null;continue;}
  if(e.cast||controlled(e,s.clock))continue;
  const separation=distance(e,target);
  if(e.fleeing){moveAway(e,target,s.clock);continue;}
  if(separation>enemyDesiredRange(s,e))moveToward(e,target,enemyDesiredRange(s,e),s.clock);
  enemyMeleeTick(s,e,target,actors,hurtPlayer,classApi);
 }
 for(const e of battle.enemies.filter(e=>e.hp<=0&&!e.rewarded)){
  if(e.deathSummon)battle.pendingSpawns.push({at:s.clock+e.deathSummon.delay,profile:e.deathSummon.profile});
  e.rewarded=true;const raw=creatures[e.entry];s.totals.kills++;creditKill(s,e.entry);const gold=roll(s,raw.MinLootGold,raw.MaxLootGold);s.money+=gold;s.totals.money+=gold;
  const members=actors.filter(c=>c.hp>0&&!c.escortNpc&&!c.petUnit),totalLevel=members.reduce((n,c)=>n+c.level,0),rate=[0,1,1,1.166,1.3,1.4][members.length]||1;
  for(const c of members){gainHunterPetXp(s,c,killXp(c.pet?.level||c.level,e.level,!!e.rank,battle.dungeon));const level=c.level;gainXp(s,c,Math.floor(killXp(c.level,e.level,!!e.rank,battle.dungeon)*rate*c.level/totalLevel));if(c.level!==level){const st=stats(c);c.currentMaxHp=st.maxHp;c.currentMaxMana=st.maxMana;}if(c.growthPolicy==='companion')c.learned=companionSkills(c);}
  lootRows(s,creatureLoot[raw.LootId]);
  skinBeast(s,e);
 }
 countLeaderDeath(s);
 if(actors.filter(c=>!c.petUnit).every(c=>c.hp<=0)){s.activity={type:'dead',reason:'角色已死亡，请选择复活。'};finishCombat(s);return;}
 if(battle.enemies.every(e=>e.hp<=0||e.removed)&&!battle.pendingSpawns.length){finishCombat(s);s.nextPull=s.clock+3000;for(const c of actors)c.cast=null;}
}

export function beginHunterTaming(s,targetId){
 if(s.classId!==3||!s.learned.includes(1515))throw new Error('Learn Tame Beast first');if(s.hp<=0||s.pet||s.hunterPet)throw new Error('Dismiss the current pet before taming');
 let target=s.combat?.enemies.find(e=>e.id===targetId&&aliveEnemy(e));const entry=target?.entry||(String(targetId).startsWith('npc:')?Number(String(targetId).slice(4)):Number(targetId));const raw=creatures[entry];
 if(!raw||!(raw.CreatureTypeFlags&1)||raw.CreatureType!==1||!target&&!monsterIdsAt(s.location).includes(entry))throw new Error('Choose a local living beast');if((target?.level||raw.LevelMin||raw.MinLevel||1)>s.level)throw new Error('The beast is above your level');
 const sp=spellInfo(s,1515);if(s.mana<sp.mana)throw new Error('Not enough mana');if(!target){if(s.combat)throw new Error('Choose a beast in the current fight');startCombat(s,[entry]);target=s.combat.enemies[0];}
 s.mana-=sp.mana;s.lastManaUse=s.clock;s.cast={spell:sp.Id,target:target.id,startedAt:s.clock,until:s.clock+sp.durationMs,next:s.clock+1000,interval:1000,channel:true,taming:true};s.nextAction=s.cast.until;s.target=target.id;target.threat[s.id]=(target.threat[s.id]||0)+10;target.target=s.id;log(s,s.name+' 开始驯服 '+target.name,'cast',{actorId:s.id,targetId:target.id,spellId:1515,duration:sp.durationMs});return true;
}

export function doomRitualUse(s){const participants=[s,...(s.party||[])].filter(c=>c.hp>0&&!c.petUnit&&!c.escortNpc&&(!c.location||c.location===s.location)&&distance(s,c)<=30);let reason=s.classId!==9||!s.learned.includes(18540)?'需要学会末日仪式':s.hp<=0?'施法者已死亡':s.combat?'需要脱离战斗':participants.length<(objectTemplates[177193]?.data0||5)?'需要施法者与4名附近存活队友共同参与':'';return{canUse:!reason,reason,participants:participants.slice(0,objectTemplates[177193]?.data0||5).map(c=>c.id)};}
export function beginDoomRitual(s){const use=doomRitualUse(s);if(!use.canUse)throw new Error(use.reason);const participants=use.participants.map(id=>[s,...s.party].find(c=>c.id===id)),victim=participants[Math.floor(rng(s)*participants.length)];victim.hp=0;victim.cast=null;log(s,victim.name+' 被末日仪式献祭','death',{actorId:victim.id,spellId:objectTemplates[177193]?.data4||20625});startCombat(s,[spells[objectTemplates[177193]?.data1||18541].EffectMiscValue1]);const demon=s.combat.enemies[0];demon.level=s.level;demon.summonedBy=s.id;demon.rewarded=true;demon.despawnAt=s.clock+3600000;demon.threat[s.id]=1;demon.target=s.id;s.lastDoomRitual={at:s.clock,participants:use.participants,sacrifice:victim.id,demon:demon.id};countLeaderDeath(s);return demon;}

export function summonInfernal(s,c,target=c){const impact=spellInfo(c,22703),origin={position:target.position,positionY:target.positionY||0};for(const victim of (s.combat?.enemies||[]).filter(e=>aliveEnemy(e)&&!e.controlledBy&&distance(origin,e)<=impact.radius)){recordDamage(s,c,victim,roll(s,...effectRange(c,impact)),impact.SpellName,1,{spellId:impact.Id,school:impact.School});addCombatAura(victim,{spell:impact.Id,effect:2,type:12,amount:0,caster:c.id,until:s.clock+impact.durationMs},s.clock);}const demon=enemy(s,89,'infernal-'+(s.demonSequence=(s.demonSequence||0)+1));demon.level=c.level;demon.summonedBy=c.id;demon.rewarded=true;demon.despawnAt=s.clock+3600000;demon.position=origin.position;demon.positionY=origin.positionY;demon.controlledBy=c.id;demon.controlUntil=s.clock+spellInfo(c,1122).durationMs;demon.controlSpell=1122;demon.rootUntil=s.clock+spellInfo(c,22707).durationMs;demon.nextInfernalFire=s.clock+spells[19483].EffectAmplitude1;if(s.combat)s.combat.enemies.push(demon);else startCombat(s,[89],false,[demon]);return demon;}
function tickInfernalFire(s,actors){for(const demon of s.combat.enemies.filter(e=>e.entry===89&&e.summonedBy&&aliveEnemy(e))){const owner=actors.find(c=>c.id===demon.controlledBy),spell=spells[20153],interval=spells[19483].EffectAmplitude1;while(demon.nextInfernalFire<=s.clock){const targets=owner?s.combat.enemies.filter(e=>e!==demon&&aliveEnemy(e)&&!e.controlledBy):actors.filter(a=>a.hp>0);for(const target of targets.filter(a=>distance(demon,a)<=10)){const amount=roll(s,...effectRange(demon,spell));if(owner)recordDamage(s,owner,target,amount,spell.SpellName,1,{spellId:spell.Id,school:spell.School,periodic:true});else hurtPlayer(s,demon,target,amount,spell.SpellName,{spellId:spell.Id,school:spell.School,periodic:true});}demon.nextInfernalFire+=interval;}}}
