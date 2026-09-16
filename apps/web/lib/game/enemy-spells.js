import {onTalentEvent} from './talent-runtime.js';
import {talentControlResistance,talentCombatDefense} from './talent-effects.js';
import {launchProjectile,takeImpacts} from './combat-projectiles.js';
import {distance,point} from './combat-space.js';
import {spells,lookup,nameOf} from './catalog.js';
import {effectRange,roll,rng,log,stats,armorReduction,enemy} from './character.js';
import {addCombatAura,controlled,castTimeMultiplier,schoolImmune,physicalDamageBonus} from './combat-auras.js';
import {ranks} from './talent-effects.js';

export function enemySpellInfo(e,id){
 const sp=spells[id];if(!sp)return null;
 const cast=lookup.SpellCastTimes[sp.CastingTimeIndex],duration=lookup.SpellDuration[sp.DurationIndex],range=lookup.SpellRange[sp.RangeIndex];
 const durationMs=duration?.baseMs===-1?Number.MAX_SAFE_INTEGER:Math.max(0,(duration?.baseMs||0)+(duration?.perLevelMs||0)*e.level);
 return {...sp,castMs:Math.max(cast?.minimumMs||0,(cast?.baseMs||0)+(cast?.perLevelMs||0)*e.level)*castTimeMultiplier(e,e.time||0),durationMs,
  range:range?.maximumYards||0,minRange:range?.minimumYards||0,
  mana:Math.floor(sp.ManaCost+sp.ManaCostPerlevel*Math.max(0,e.level-sp.SpellLevel)+(e.maxMana??e.mana)*sp.ManaCostPercentage/100)};
}
const living=units=>units.filter(u=>u.hp>0&&!u.removed);
export function enemySpellMissChance(e,target,sp){
 const difference=target.level-e.level,defense=talentCombatDefense(target);
 if(sp.DmgClass===1)return Math.min(1,Math.max(.01,(4+(difference>2?2+(difference-2)*7:difference))/100+defense.spellAvoidance));
 if(sp.DmgClass===2||sp.DmgClass===3)return Math.min(1,Math.max(0,(5+difference*.2)/100+(sp.DmgClass===3?defense.rangedAvoidance:0)));
 return 0;
}
function effectTargets(s,e,target,sp,n,actors){
 const a=sp['EffectImplicitTargetA'+n],b=sp['EffectImplicitTargetB'+n];
 const radius=lookup.SpellRadius[sp['EffectRadiusIndex'+n]]?.radiusYards||0;
 if(a===1)return[e];
 if(a===5)return living(s.combat.enemies).filter(u=>u.summonedBy===e.id&&u.pet);
 if(a===22&&b===30)return living(s.combat.enemies).filter(u=>distance(u,e)<=radius);
 if(a===22&&b===15)return living(actors).filter(u=>distance(u,e)<=radius);
 if(a===16||a===28)return living(actors).filter(u=>distance(u,target)<=radius);
 return target?.hp>0?[target]:[];
}
function summon(s,e,sp,n){
 const entry=sp['EffectMiscValue'+n],count=effectRange(e,sp,n)[0];
 for(let i=0;i<count;i++){
  const sequence=s.combat.summonSequence=(s.combat.summonSequence||0)+1;
  const child=enemy(s,entry,`summon-${sequence}`);child.position=e.position;child.positionY=e.positionY||0;child.target=e.target;child.summonedBy=e.id;child.pet=sp['Effect'+n]===56;
  child.nextAttack=s.clock+child.swing;child.despawnAt=sp.durationMs<Number.MAX_SAFE_INTEGER?s.clock+sp.durationMs:null;
  // Summoned units are additional enemies, never a replacement for a static GUID.
  s.combat.enemies.push(child);log(s,`${e.name} 召唤了 ${child.name}`,'combat',{actorId:e.id,targetId:child.id,spellId:sp.Id});
 }
}
function applySpell(s,e,target,sp,actors,hurt){
 const name=nameOf('spells',sp.Id),hits=new Map();
 for(let n=1;n<=3;n++){
  const effect=sp['Effect'+n];if(!effect)continue;
  if([42,56].includes(effect)){summon(s,e,sp,n);continue;}
  if(effect===27){
   const interval=sp['EffectAmplitude'+n],radius=lookup.SpellRadius[sp['EffectRadiusIndex'+n]]?.radiusYards||0;
   s.groundEffects??=[];s.groundEffects.push({spell:sp.Id,caster:e.id,casterName:e.name,position:target.position,positionY:target.positionY||0,center:point(target),radius,school:sp.School,amount:roll(s,...effectRange(e,sp,n)),interval,next:s.clock+interval,until:s.clock+sp.durationMs});continue;
  }
  if(effect===40){e.dualWield=true;continue;}
  if(effect===19){e.extraAttacks=(e.extraAttacks||0)+effectRange(e,sp,n)[0];continue;}
  for(const unit of effectTargets(s,e,target,sp,n,actors)){
   if(actors.includes(unit)){
    if(!hits.has(unit.id)){const miss=rng(s)<enemySpellMissChance(e,unit,sp);hits.set(unit.id,!miss);if(miss&&sp.DmgClass===1&&sp.School>0)onTalentEvent(s,unit,{type:'resist',spell:sp,target:e},{stats,rng,actors});if(miss)log(s,`${unit.name} 避开了 ${name}`,'miss',{actorId:e.id,targetId:unit.id,spellId:sp.Id});}
    if(!hits.get(unit.id))continue;
   }
   if(schoolImmune(unit,sp.School,s.clock)){log(s,`${unit.name} 免疫了 ${name}`,'miss',{actorId:e.id,targetId:unit.id,spellId:sp.Id});continue;}
   const amount=roll(s,...effectRange(e,sp,n));
   if(effect===2||effect===58){
    let damage=amount;if(effect===58)damage+=roll(s,Math.floor(e.low),Math.ceil(e.high))+physicalDamageBonus(e,s.clock);
    if(sp.School===0)damage*=1-armorReduction(stats(unit).armor,e.level);
    hurt(s,e,unit,damage,name,{spellId:sp.Id,school:sp.School});
   }else if(effect===10){const healed=Math.min(unit.maxHp-unit.hp,amount);unit.hp+=healed;log(s,`${unit.name} 的${name}恢复了 ${healed} 点生命`,'heal',{actorId:e.id,targetId:unit.id,spellId:sp.Id,amount:healed});}
   else if(effect===6||effect===27){
    const auraType=sp['EffectApplyAuraName'+n],resist=talentControlResistance(unit,sp.Mechanic||sp['EffectMechanic'+n]||({7:5,12:12,27:9,26:7}[auraType]))+(unit.raceId===2&&auraType===12?.25:0);
    if(auraType===7&&unit.racialImmuneFearUntil>s.clock||resist>0&&rng(s)<resist)continue;
    const interval=sp['EffectAmplitude'+n]||0;
    addCombatAura(unit,{spell:sp.Id,effect:n,type:sp['EffectApplyAuraName'+n],amount,misc:sp['EffectMiscValue'+n],trigger:sp['EffectTriggerSpell'+n],school:sp.School,
     dispel:sp.Dispel,mechanic:sp.Mechanic||sp['EffectMechanic'+n],caster:e.id,casterName:e.name,until:sp.durationMs===Number.MAX_SAFE_INTEGER?sp.durationMs:s.clock+sp.durationMs,interval,next:interval?s.clock+interval:0},s.clock);
   }
  }
 }
}
export function castEnemySpell(s,e,target,id,actors,hurt,flags=0){
 e.time=s.clock;const sp=enemySpellInfo(e,id),triggered=!!(flags&2);if(!sp||!target||e.hp<=0)return false;
 if(!triggered&&(e.cast||controlled(e,s.clock)||e.silenceUntil>s.clock||(e.nextAction||0)>s.clock||(e.schoolLockouts?.[sp.School]||0)>s.clock))return false;
 const separation=distance(target,e);
 if(!triggered&&!(flags&4)&&(e.mana<sp.mana||target!==e&&(separation>sp.range||separation<sp.minRange)))return false;
 if(flags&32&&(target.auras||[]).some(a=>a.spell===id&&a.until>s.clock))return false;
 if(!triggered){e.mana=Math.max(0,e.mana-sp.mana);e.nextAction=s.clock+Math.max(sp.StartRecoveryTime||0,sp.castMs);}
 log(s,`${e.name} 施放 ${nameOf('spells',id)}`,'cast',{actorId:e.id,targetId:target.id,spellId:id,school:sp.School,duration:triggered?0:sp.castMs});
 if(!triggered&&sp.castMs)e.cast={spell:id,target:target.id,startedAt:s.clock,until:s.clock+sp.castMs,center:[1,2,3].some(n=>sp['Effect'+n]===27)?point(target):null};
 else if(triggered||!launchProjectile(s,e,target,sp,'enemy'))applySpell(s,e,target,sp,actors,hurt);
 return true;
}
export function tickEnemySpell(s,e,actors,hurt){
 if(!e.cast)return;
 if(e.hp<=0||controlled(e,s.clock)){e.cast=null;return;}
 if(s.clock<e.cast.until)return;
 const cast=e.cast;e.cast=null;const target=[...actors,...s.combat.enemies].find(u=>u.id===cast.target&&u.hp>0);
 const sp=enemySpellInfo(e,cast.spell),aim=cast.center?{id:cast.target,hp:target?.hp||1,position:cast.center.x,positionY:cast.center.y}:target;if(aim&&(target===e||distance(e,aim)<=sp.range&&distance(e,aim)>=sp.minRange)){if(!launchProjectile(s,e,aim,sp,'enemy'))applySpell(s,e,aim,sp,actors,hurt);}else log(s,'施法取消：目标失效或超出距离','cancel',{actorId:e.id,spellId:cast.spell});
}
export function tickEnemyAuras(s,actors,hurt){
 for(const area of s.groundEffects||[])if(area.interval&&area.side!=='friendly'){
  while(area.next<=s.clock&&area.next<=area.until){
   for(const unit of actors.filter(u=>u.hp>0&&distance(u,area)<=area.radius))if(!schoolImmune(unit,area.school,area.next-1))hurt(s,{id:area.caster,name:area.casterName},unit,area.amount,nameOf('spells',area.spell),{spellId:area.spell,periodic:true});
   area.next+=area.interval;
  }
 }
 s.groundEffects=(s.groundEffects||[]).filter(a=>a.until>s.clock);
 for(const unit of [...actors,...(s.combat?.enemies||[])]){
  if(unit.hp<=0){unit.auras=[];continue;}
  for(const aura of unit.auras||[])if(aura.type===3&&aura.interval){
   while(aura.next<=s.clock&&aura.next<=aura.until&&unit.hp>0){
    const caster=s.combat?.enemies.find(e=>e.id===aura.caster)||{id:aura.caster,name:aura.casterName};
    if(!schoolImmune(unit,aura.school,aura.next-1))hurt(s,caster,unit,aura.amount,nameOf('spells',aura.spell),{spellId:aura.spell,periodic:true});
    aura.next+=aura.interval;
   }
  }
  unit.auras=(unit.auras||[]).filter(a=>a.until>s.clock);
 }
}

export function tickEnemyProjectiles(s,actors,hurt){
 for(const p of takeImpacts(s,'enemy')){const caster=s.combat.enemies.find(e=>e.id===p.actorId),target=[...actors,...s.combat.enemies].find(u=>u.id===p.targetId&&u.hp>0&&!u.removed);if(caster&&target)applySpell(s,caster,target,enemySpellInfo(caster,p.spellId),actors,hurt);}
}
