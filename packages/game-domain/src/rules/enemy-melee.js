import {onTalentEvent} from './talent-runtime.js';
import {distance} from '../../../sim-core/src/geometry.js';
import {rollAttackTable,weaponMissChance} from '../../../sim-core/src/attack-table.js';
import {roll,rng,stats,armorReduction,log} from './character.js';
import {attackTimeMultiplier,physicalDamageBonus,activeAuras,hasAura,controlled} from '../../../sim-core/src/combat-auras.js';
import {talentCombatDefense} from './talent-effects.js';
import {items} from './catalog.js';
import {facesAttacker} from './weapon-attacks.js';

export function enemyMeleeTick(s,e,target,actors,hurt,api={}){
 if(e.hp<=0||target.hp<=0||distance(e,target)>5)return;
 function hit(hand,extraAttack=false){
  if(target.hp<=0)return;
  const st=stats(target),skill=e.level*5,defense=st.defense||target.level*5,delta=defense-skill;
  const auras=activeAuras(target,s.clock),front=facesAttacker(s,e,target),canDefend=front&&!target.cast&&!controlled(target,s.clock);
  const shieldItem=items[target.equipment?.[17]?.id],shield=shieldItem?.InventoryType===14&&target.equipment[17].durability!==0;
  const bonus=type=>auras.filter(a=>a.type===type&&(a.charges==null||a.charges>0)).reduce((n,a)=>n+a.amount/100,0);
  const deficit=skill-Math.min(defense,target.level*5);
  const outcome=rollAttackTable(rng(s),{
   miss:weaponMissChance(skill,defense,{dualWield:!!e.dualWield,playerTarget:true,hit:activeAuras(e,s.clock).filter(a=>a.type===54).reduce((n,a)=>n+a.amount/100,0)}),
   dodge:canDefend?Math.max(0,st.dodge+bonus(49)+delta*.0004):0,
   parry:canDefend&&!hasAura(target,67,s.clock)?Math.max(0,st.parry+bonus(47)+delta*.0004):0,
   block:canDefend&&shield?Math.max(0,st.block+bonus(51)+delta*.0004):0,
   critical:Math.max(0,.05-delta*.0004-talentCombatDefense(target).meleeCritReduction),
   crushing:!e.noCrushing&&deficit>=15?Math.max(0,(2*deficit-15)/100):0,
  });
  if(['miss','dodge','parry'].includes(outcome)){
   if(outcome!=='miss'){target.revengeUntil=s.clock+5000;target[outcome==='dodge'?'dodgeUntil':'parryUntil']=s.clock+5000;onTalentEvent(s,target,{type:'incoming',target:e,amount:0,dodged:outcome==='dodge',parried:outcome==='parry'},{...api,stats,rng,actors});}
   log(s,`${e.name} 的攻击${{miss:'未命中',dodge:'被闪避',parry:'被招架'}[outcome]}`,'miss',{actorId:e.id,targetId:target.id,hand,extraAttack,outcome});return;
  }
  let amount=Math.max(0,roll(s,Math.floor(e.low),Math.ceil(e.high))+physicalDamageBonus(e,s.clock)+activeAuras(e,s.clock).filter(a=>a.type===99).reduce((n,a)=>n+a.amount,0)/14*e.swing/1000)*(hasAura(e,67,s.clock)?.5:1)*(hand==='off'?.5:1)*(1-armorReduction(st.armor,e.level));
  if(outcome==='block'){
   target.revengeUntil=s.clock+5000;
   for(const a of auras.filter(a=>a.type===51&&a.charges>0))if(!--a.charges)a.until=s.clock;
   onTalentEvent(s,target,{type:'incoming',target:e,amount:0,blocked:true},{...api,stats,rng,actors});
   for(const a of auras.filter(a=>a.type===43))if(api.damage)api.damage(s,target,e,a.amount,'格挡反击',1,{spellId:a.spell,school:1,talentProc:true});
   amount=Math.max(0,amount-Math.max(0,(shieldItem.block||0)+st.str/20-1)*(1+(st.blockValuePct||0)));
   if(amount===0){log(s,target.name+' 完全格挡了攻击','absorb',{actorId:target.id,outcome});return;}
  }
  const critical=outcome==='critical',crushing=outcome==='crushing';amount*=critical?2:crushing?1.5:1;
  hurt(s,e,target,amount,hand==='off'?'副手攻击':extraAttack?'额外攻击':'攻击',{hand,extraAttack,critical,crushing,outcome});
 }
 if(s.clock>=e.nextAttack){e.swingStartedAt=s.clock;e.nextAttack=s.clock+e.swing*attackTimeMultiplier(e,s.clock);hit('main');}
 if(e.dualWield){e.nextOffhand??=s.clock;if(s.clock>=e.nextOffhand){e.nextOffhand=s.clock+e.swing*attackTimeMultiplier(e,s.clock);hit('off');}}
 const extra=e.extraAttacks||0;e.extraAttacks=0;
 for(let n=0;n<extra&&target.hp>0;n++)hit('main',true);
}
