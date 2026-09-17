import {weaponAttack} from './weapon-attacks.js';
import {spellPowerBonus} from './spell-scaling.js';
import {beginSpellTiming,spellReady,gcdUntil} from './spell-timing.js';
import {rescueTarget} from './combat-positioning.js';
import {onTalentEvent,beginTalentCast,endTalentCast} from './talent-runtime.js';
import {items,spells,nameOf,table} from './catalog.js';
import {stats,knownRank,spellInfo,effectRange,roll,rng,log,armorReduction} from './character.js';
import passives from '../../../game-data/data/companion-passive-reference.json' with {type:'json'};
import {activeAuras,armorWithAuras,hasAura} from '../../../sim-core/src/combat-auras.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {moveToward,inSpellRange,detectsTarget} from './combat-space.js';
import {strategyAllows,companionRules,protectedTarget,protectCombatTarget} from './combat-strategy.js';
import {recordMetric} from './combat-metrics.js';
import {talentModifiers,healingMultiplier,spellCritBonus,ranks} from './talent-effects.js';
import {classEffect} from './class-mechanics.js';

const threatRows=Object.fromEntries(table('spell_threat').map(r=>[r.entry,r]));
export const defensive=c=>c.classId===1&&(c.stance?c.stance==='defensive':c.learned.includes(71));
export const stanceAllows=(c,sp)=>!sp.Stances||!!(sp.Stances&(c.classId===1?({battle:65536,defensive:131072,berserker:262144}[c.stance]||(defensive(c)?131072:65536)):({cat:1,bear:16,direbear:128,moonkin:1073741824}[c.form]||0)));
export function stanceModifiers(c){
 const result={damage:1,incoming:1,threat:1+(stats(c).threat||0)/100};if(c.classId!==1)return result;
 const passive=passives.spells.find(s=>s.Id===(defensive(c)?7376:21156));
 for(let n=1;n<=3;n++){const field={79:'damage',87:'incoming',10:'threat'}[passive['EffectApplyAuraName'+n]];if(field)result[field]*=1+(passive['EffectBasePoints'+n]+1)/100;}
 return result;
}
export function gainRage(c,damage,attacker){
 if(c.classId!==1&&c.form!=='bear')return;
 const conversion=.0091107836*c.level*c.level+3.225598133*c.level+4.2652911;
 c.rage=Math.min(1000,(c.rage||0)+Math.floor(damage/conversion*(attacker?7.5:2.5)*10));
}
export function effectiveArmor(e,clock){return armorWithAuras(e,Math.max(0,e.armor-(e.sunder?.until>clock?e.sunder.amount*e.sunder.stacks:0)),clock);}
export function weaponDamage(s,c,normalized=false){
 const weapon=!hasAura(c,67,s.clock)&&items[c.equipment[16]?.id],speed=c.form==='cat'?1:c.form==='bear'?2.5:normalized?(weapon?.subclass===15?1.7:weapon?.InventoryType===17?3.3:2.4):(weapon?.delay||2000)/1000;
 const power=stats(c).attackPower*(c.racialBuff?.kind==='bloodfury'&&c.racialBuff.until>s.clock?1.25:1);
 return (c.form?roll(s,c.level,c.level*2):roll(s,Math.floor(weapon?.dmg_min1||1),Math.ceil(weapon?.dmg_max1||2)))+power/14*speed+(c.form?0:stats(c).weaponDamage||0);
}
function announce(s,c,e,sp){const timing=beginSpellTiming(c,sp,s.clock);s.combat.casts++;log(s,`${c.name} 施放 ${nameOf('spells',sp.Id)}`,'cast',{actorId:c.id,targetId:e.id,spellId:sp.Id,duration:sp.castMs});return timing;}
function physical(s,c,e,sp,amount,damage){
 const attack=weaponAttack(s,c,e,{special:true,spell:sp});if(!attack.landed)return false;const critical=attack.critical;
 if(amount>0)damage(s,c,e,amount*attack.multiplier*(1-armorReduction(effectiveArmor(e,s.clock),c.level)),nameOf('spells',sp.Id),1,{spellId:sp.Id,critical});return true;
}
export function resolveHeal(s,c,target,sp,{effect=1,coefficient=1}={}){
 if(!target||target.hp<=0||!inSpellRange(c,target,sp))return;
 const [low,high]=effectRange(c,sp,effect),flat=activeAuras(target,s.clock).filter(a=>a.type===115).reduce((n,a)=>n+a.amount,0)+(['Holy Light','Flash of Light'].includes(sp.SpellName)?activeAuras(target,s.clock).filter(a=>spells[a.spell]?.SpellName?.includes('Blessing of Light')&&a.effect===(sp.SpellName==='Holy Light'?1:2)).reduce((n,a)=>n+a.amount,0):0),st=stats(c);
 const critical=rng(s)<st.spellCrit+spellCritBonus(c,sp),raw=Math.round((roll(s,low,high)+spellPowerBonus(st,sp,{healing:true,effect})+flat)*coefficient*(critical?1.5:1)*healingMultiplier(c,sp,target)*(target.auras||[]).filter(a=>a.type===118&&a.until>s.clock).reduce((m,a)=>m*(1+a.amount/100),1)*(target.racialBuff?.kind==='bloodfury'&&target.racialBuff.until>s.clock?.5:1)),amount=Math.min(stats(target).maxHp-target.hp,raw);target.hp+=amount;
 recordMetric(s,c,target,amount,{kind:'healing',effective:true,spellId:sp.Id,label:nameOf('spells',sp.Id),critical});
 const enemies=s.combat.enemies.filter(e=>e.hp>0&&!e.removed);
 for(const e of enemies)e.threat[c.id]=(e.threat[c.id]||0)+amount*.5/enemies.length;
 const key=c.name+' · '+nameOf('spells',sp.Id);s.combat.healing[key]=(s.combat.healing[key]||0)+amount;
 onTalentEvent(s,c,{type:'heal',target,spell:sp,amount,critical},{stats,rng,actors:[]});
 log(s,`${c.name} 的${nameOf('spells',sp.Id)}为 ${target.name} 恢复 ${amount} 点生命`,'heal',{actorId:c.id,targetId:target.id,spellId:sp.Id,amount,overheal:raw-amount,critical});
}
const injuredAllies=actors=>actors.filter(a=>a.hp>0&&a.hp<stats(a).maxHp*.85).sort((a,b)=>a.hp/stats(a).maxHp-b.hp/stats(b).maxHp);
function readyPriestSpell(s,c,base){
 const id=knownRank(c,base),sp=id&&spellInfo(c,id);
 return sp&&c.mana>=sp.mana&&spellReady(c,sp,s.clock,{ignoreGcd:!!c.cast})&&!(sp.School>0&&(c.silenceUntil>s.clock||hasAura(c,27,s.clock)))&&!((c.schoolLockouts?.[sp.School]||0)>s.clock)?sp:null;
}
const affordableHeals=(s,c)=>[2050,2054,2061].map(id=>readyPriestSpell(s,c,id)).filter(Boolean);
function selfShield(s,c){return c.hp<stats(c).maxHp*.85&&!(c.weakenedSoulUntil>s.clock)&&!(c.absorb?.amount>0&&c.absorb.until>s.clock)&&readyPriestSpell(s,c,17);}
function attackingPriest(s,c){return s.combat.enemies.filter(e=>e.hp>0&&!e.removed&&!e.controlledBy&&!protectedTarget(e,s.clock)&&e.target===c.id);}
export function interruptPriestForRescue(s,c,actors){
 if(c===s||c.classId!==5||!c.cast||c.cast.until<=s.clock)return;
 const damage=spells[c.cast.spell]?.SpellName==='Smite'&&injuredAllies(actors).length&&affordableHeals(s,c).length;
 const danger=c.cast.friendly&&c.hp<stats(c).maxHp*.4&&attackingPriest(s,c).length&&selfShield(s,c);
 if(!damage&&!danger)return;
 const cast=c.cast;c.cast=null;c.nextAction=s.clock;
 log(s,c.name+(danger?' 中止读条，优先自救':' 停止惩击，优先治疗受伤队友'),'cancel',{actorId:c.id,spellId:cast.spell});
}
export function decidePriestDefense(s,c,actors,api){
 if(c===s||c.classId!==5)return false;
 const attackers=attackingPriest(s,c),shield=attackers.length&&selfShield(s,c),fade=attackers.length&&!(c.fade?.until>s.clock)&&readyPriestSpell(s,c,586);
 const usefulFade=fade&&attackers.some(e=>actors.some(a=>a!==c&&a.hp>0&&Math.max(0,(e.threat[a.id]||0)-(a.fade?.until>s.clock?a.fade.amount:0))>Math.max(0,(e.threat[c.id]||0)-Math.abs(effectRange(c,fade)[0]))*(distance(a,e)<=5?1.1:1.3)));
 const defense=shield&&c.hp<stats(c).maxHp*.4?shield:usefulFade?fade:shield;
 if(!defense)return false;
 announce(s,c,c,defense);classEffect(s,c,c,defense,actors,api);return true;
}
function decidePriest(s,c,enemies,actors,api,rules){
 if(decidePriestDefense(s,c,actors,api))return true;
 // The controlled priest already evaluates configured healing rules in decideClass.
 // Only party AI has an independent emergency-healing policy.
 const target=!rules&&c!==s&&injuredAllies(actors)[0];
 if(target){
  if(distance(c,target)>40){moveToward(s,c,target,40,s.clock);return true;}
  const deficit=stats(target).maxHp-target.hp,emergency=target.hp/stats(target).maxHp<.3;
  const heals=affordableHeals(s,c);
  heals.sort((a,b)=>{if(emergency&&a.castMs!==b.castMs)return a.castMs-b.castMs;const av=effectRange(c,a).reduce((x,y)=>x+y)/2,bv=effectRange(c,b).reduce((x,y)=>x+y)/2;return Math.abs(av-deficit)-Math.abs(bv-deficit);});
  const sp=heals[0];if(!sp)return false;const talentCast=beginTalentCast(s,c,sp),timing=announce(s,c,target,sp);c.cast={timing,talentCast,spell:sp.Id,target:target.id,startedAt:s.clock,until:s.clock+sp.castMs,friendly:true};return true;
 }
 // Party healers reserve 70% mana; the controlled priest follows its damage rules.
 if(c.talentProcs?.spiritOfRedemption?.until>s.clock)return false;const e=enemies[0];if(!e)return false;
 for(const rule of rules||companionRules(c)){
  const id=rule.enabled&&knownRank(c,rule.spell),sp=id&&spellInfo(c,id);
  if(!sp||sp.SpellName!=='Smite'||!readyPriestSpell(s,c,rule.spell)||!rules&&c!==s&&c.mana<stats(c).maxMana*.7||!strategyAllows(s,c,e,sp,rule))continue;
  if(!inSpellRange(c,e,sp)){moveToward(s,c,e,sp.range,s.clock);return true;}
  const talentCast=beginTalentCast(s,c,sp),timing=announce(s,c,e,sp);c.cast={timing,talentCast,spell:id,target:e.id,startedAt:s.clock,until:s.clock+sp.castMs};return true;
 }

}
export function companionTarget(s,c,enemies){enemies=enemies.filter(e=>!e.controlledBy&&detectsTarget(c,e,s.clock));
 const uncontrolled=enemies.filter(e=>!(e.polyUntil>s.clock));if(uncontrolled.length)enemies=uncontrolled;
 // Movement, weapon swings and abilities must agree on the rescue target.
 // Stay on a recently taunted enemy while building threat during its forced focus.
 return rescueTarget(s,c,enemies)||enemies[0];
}
export function decideCompanion(s,c,enemies,actors,damage,spellLands,api,rules){
 if(c.strategyPolicy?.protectCC!==false)enemies=enemies.filter(e=>!protectCombatTarget(s,e));
 // Healing is independent of damage rules and remains the first priest decision.
 if(c.classId===5){return decidePriest(s,c,enemies,actors,api,rules);}
 const e=companionTarget(s,c,enemies);if(!e||distance(c,e)>5)return false;
 if(c.classId===1){
  const taunt=c.learned.includes(355)&&spellInfo(c,355);
  if(taunt&&(!rules||rules.some(r=>r.enabled&&spells[r.spell]?.SpellName==='Taunt'&&strategyAllows(s,c,e,taunt,r)))&&stanceAllows(c,taunt)&&e.target&&e.target!==c.id&&spellReady(c,taunt,s.clock)){announce(s,c,e,taunt);if(spellLands(s,c,e,taunt)){e.threat[c.id]=Math.max(0,...Object.values(e.threat));e.tauntedBy=c.id;e.tauntUntil=s.clock+taunt.durationMs;e.target=c.id;}return true;}
  if(hasAura(c,67,s.clock)){c.queuedStrike=null;return false;}
  for(const rule of rules||companionRules(c)){
   const id=rule.enabled&&knownRank(c,rule.spell),sp=id&&spellInfo(c,id);
   if(!sp||!stanceAllows(c,sp)||!spellReady(c,sp,s.clock)||c.rage<sp.mana||!strategyAllows(s,c,e,sp,rule))continue;
   if(sp.SpellName==='Sunder Armor'&&(!e.sunder||e.sunder.stacks<sp.StackAmount||e.sunder.until<s.clock+5000)){
    announce(s,c,e,sp);
    if(physical(s,c,e,sp,0,damage)){e.sunder={stacks:Math.min(sp.StackAmount,(e.sunder?.until>s.clock?e.sunder.stacks:0)+1),amount:Math.abs(sp.EffectBasePoints1+1),until:s.clock+sp.durationMs};e.threat[c.id]=(e.threat[c.id]||0)+(threatRows[sp.Id]?.Threat||0)*stanceModifiers(c).threat;}
    return true;
   }
   if(sp.SpellName==='Cleave'||sp.SpellName==='Heroic Strike'&&c.rage>=450){c.queuedStrike=id;return 'queued';}
  }
 }else if(c.classId===4){
  if(hasAura(c,67,s.clock))return false;
  if(c.comboTarget!==e.id){c.combo=0;c.comboTarget=e.id;}
  for(const rule of rules||companionRules(c)){
   const id=rule.enabled&&knownRank(c,rule.spell),sp=id&&spellInfo(c,id),finishing=sp?.SpellName==='Eviscerate';
   if(!sp||!['Eviscerate','Sinister Strike'].includes(sp.SpellName)||finishing&&c.combo<4||c.energy<sp.mana||!spellReady(c,sp,s.clock)||!strategyAllows(s,c,e,sp,rule))continue;
   announce(s,c,e,sp);
   const snapshot=beginTalentCast(s,c,sp),comboBefore=c.combo||0;const [low,high]=effectRange(c,sp),amount=finishing?roll(s,low,high)+sp.EffectPointsPerComboPoint1*c.combo+Math.floor(stats(c).attackPower*c.combo*.03):weaponDamage(s,c,true)+low;
   if(physical(s,c,e,sp,amount,damage)){if(finishing)c.combo=(ranks(c).Ruthlessness||0)&&rng(s)<.2*ranks(c).Ruthlessness?1:0;else c.combo=Math.min(5,c.combo+1);}endTalentCast(s,c,sp,snapshot,{stats,rng,damage,actors},{target:e,comboSpent:finishing?comboBefore:0});return true;
  }
 }
}
