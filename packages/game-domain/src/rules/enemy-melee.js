import {onTalentEvent} from './talent-runtime.js';
import {distance,point} from '../../../sim-core/src/geometry.js';
import {roll,rng,stats,armorReduction,log} from './character.js';
import {attackTimeMultiplier,physicalDamageBonus,activeAuras,hasAura} from '../../../sim-core/src/combat-auras.js';
import {talentModifiers,ranks,talentCombatDefense} from './talent-effects.js';
import {items} from './catalog.js';

export function enemyMeleeTick(s,e,target,actors,hurt,api={}){
 if(e.hp<=0||target.hp<=0||distance(e,target)>5)return;
 function hit(hand,extraAttack=false){
  if(target.hp<=0)return;
  const chance=Math.max(0,Math.min(1,(5+(e.dualWield?19:0)+(target.level-e.level)*.2-activeAuras(e,s.clock).filter(a=>a.type===54).reduce((n,a)=>n+a.amount,0))/100));
  if(rng(s)<chance){log(s,`${e.name} 的${hand==='off'?'副手':'近战'}攻击未命中`,'miss',{actorId:e.id,targetId:target.id,hand,extraAttack});return;}
  const bonuses=talentModifiers(target),avoid=stats(target).dodge+stats(target).parry+.0008*(ranks(target).Anticipation||0)+(target.auras||[]).filter(a=>[49,47].includes(a.type)&&a.until>s.clock).reduce((n,a)=>n+a.amount/100,0);
  if(avoid>0&&rng(s)<avoid){target.revengeUntil=s.clock+5000;target.dodgeUntil=s.clock+5000;target.parryUntil=s.clock+5000;onTalentEvent(s,target,{type:'incoming',target:e,amount:0,dodged:true},{...api,stats,rng,actors});log(s,target.name+' 闪避或招架了攻击','miss',{actorId:e.id,targetId:target.id});return;}
  const r=ranks(target),shieldItem=items[target.equipment?.[17]?.id],shield=shieldItem?.InventoryType===14;
  let amount=Math.max(0,roll(s,Math.floor(e.low),Math.ceil(e.high))+physicalDamageBonus(e,s.clock)+activeAuras(e,s.clock).filter(a=>a.type===99).reduce((n,a)=>n+a.amount,0)/14*e.swing/1000)*(hasAura(e,67,s.clock)?.5:1)*(hand==='off'?.5:1)*(1-armorReduction(stats(target).armor,e.level));
  const specialization=r['Shield Specialization']||0,blockChance=.05+bonuses.block+activeAuras(target,s.clock).filter(a=>a.type===51&&(a.charges==null||a.charges>0)).reduce((n,a)=>n+a.amount/100,0),blockBonus=target.classId===2?.1*specialization:target.classId===7?.05*specialization:0;
  if(shield&&rng(s)<blockChance){target.revengeUntil=s.clock+5000;for(const a of activeAuras(target,s.clock).filter(a=>a.type===51&&a.charges>0))if(!--a.charges)a.until=s.clock;onTalentEvent(s,target,{type:'incoming',target:e,amount:0,blocked:true},{...api,stats,rng,actors});for(const a of activeAuras(target,s.clock).filter(a=>a.type===43))if(api.damage)api.damage(s,target,e,a.amount,'格挡反击',1,{spellId:a.spell,school:1,talentProc:true});amount=Math.max(0,amount-Math.max(0,(shieldItem.block||0)+stats(target).str/20-1)*(1+blockBonus));if(amount===0){log(s,target.name+' 完全格挡了攻击','absorb',{actorId:target.id});return;}}
  const critical=rng(s)<Math.max(0,.05+(e.level-target.level)*.002-talentCombatDefense(target).meleeCritReduction-bonuses.defense*.0004);if(critical)amount*=2;
  hurt(s,e,target,amount,hand==='off'?'副手攻击':extraAttack?'额外攻击':'攻击',{hand,extraAttack,critical});
 }
 if(s.clock>=e.nextAttack){e.swingStartedAt=s.clock;e.nextAttack=s.clock+e.swing*attackTimeMultiplier(e,s.clock);hit('main');}
 if(e.dualWield){e.nextOffhand??=s.clock;if(s.clock>=e.nextOffhand){e.nextOffhand=s.clock+e.swing*attackTimeMultiplier(e,s.clock);hit('off');}}
 const extra=e.extraAttacks||0;e.extraAttacks=0;
 for(let n=0;n<extra&&target.hp>0;n++)hit('main',true);
}
