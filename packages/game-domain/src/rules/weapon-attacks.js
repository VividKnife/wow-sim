import {rollAttackTable,weaponMissChance,glanceMultiplier} from '../../../sim-core/src/attack-table.js';
import {point} from '../../../sim-core/src/geometry.js';
import {activeAuras,controlled,hasAura} from '../../../sim-core/src/combat-auras.js';
import {stats,rng,log} from './character.js';
import {items} from './catalog.js';
import {spellCritBonus,talentSpellValue} from './talent-effects.js';

export function weaponSkill(c,slot=16){
 const st=stats(c);
 if(c.form==='bear'||c.form==='cat')return c.level*5;
 return slot===18?(st.rangedWeaponSkill||c.level*5):slot===17?(st.offhandWeaponSkill||c.level*5):(st.weaponSkill||c.level*5);
}
export function facesAttacker(s,attacker,target){
 const focus=[s,...(s.party||[]),...(s.combat?.enemies||[])].find(u=>u.id===target.target);
 if(!focus)return true;
 const a=point(attacker),t=point(target),f=point(focus);
 return (a.x-t.x)*(f.x-t.x)+(a.y-t.y)*(f.y-t.y)>=0;
}
export function weaponAttack(s,c,target,{special=false,hand='main',ranged=false,spell=null,rollCritical=true}={}){
 const playerTarget=!!target.classId||!!target.petUnit,st=stats(c),defense=playerTarget?stats(target).defense||target.level*5:target.level*5;
 const skill=weaponSkill(c,ranged?18:hand==='off'?17:16),difference=defense-skill,auras=activeAuras(target,s.clock);
 const front=facesAttacker(s,c,target),canDefend=!controlled(target,s.clock)&&!target.cast;
 const dual=!ranged&&!special&&!c.form&&c.learned?.includes(674)&&items[c.equipment?.[17]?.id]?.class===2;
 const dodge=canDefend&&!ranged&&(!target.pvp||!target.classId||front)?Math.max(0,(playerTarget?stats(target).dodge:.05)+(difference*(playerTarget||difference<=0?.0004:.001))+auras.filter(a=>a.type===49).reduce((n,a)=>n+a.amount/100,0)):0;
 const parry=canDefend&&front&&!ranged&&!hasAura(target,67,s.clock)?Math.max(0,(playerTarget?stats(target).parry:.05)+(difference*(playerTarget||difference<=0?.0004:difference>10?.006:.001))+auras.filter(a=>a.type===47).reduce((n,a)=>n+a.amount/100,0)):0;
 const critical=Math.max(0,(ranged?st.rangedCrit??st.crit:st.crit)+(spell?spellCritBonus(c,spell,target):0)-difference*(playerTarget?.0004:.002));
 const chances={miss:weaponMissChance(skill,defense,{hit:st.hit,dualWield:dual,playerTarget}),dodge,parry,
  glancing:!special&&!ranged&&!playerTarget&&target.level>10?Math.max(0,Math.min(.4,([5,8,9].includes(c.classId)?Math.min(30,target.level):10)*.01+(defense-Math.min(c.level*5,skill))*.02)):0,
  block:target.pvp&&canDefend&&front&&items[target.equipment?.[17]?.id]?.InventoryType===14?Math.max(0,(stats(target).block||.05)+difference*.0004+auras.filter(a=>a.type===51).reduce((n,a)=>n+a.amount/100,0)):0,
  critical:special?0:critical};
 const outcome=rollAttackTable(rng(s),chances),landed=!['miss','dodge','parry'].includes(outcome);
 if(outcome==='block')c.pvpBlockedHit={targetId:target.id,at:s.clock,amount:stats(target).blockValue||Math.max(0,(items[target.equipment?.[17]?.id]?.block||0)+stats(target).str/20-1)};
 if(!landed)log(s,`${c.name} 的攻击${{miss:'未命中',dodge:'被闪避',parry:'被招架'}[outcome]}`,'miss',{actorId:c.id,targetId:target.id,spellId:spell?.Id??null,hand,outcome});
 const crit=outcome==='critical'||special&&landed&&rollCritical&&rng(s)<critical;
 const multiplier=outcome==='glancing'?glanceMultiplier(skill,defense,rng(s),{caster:[5,8,9].includes(c.classId)}):crit?1+(spell?talentSpellValue(c,spell,15,100)/100:1):1;
 return {landed,critical:crit,glancing:outcome==='glancing',outcome,multiplier};
}
