import {stats,armorReduction} from './character.js';
import {items} from './catalog.js';
import {activeAuras,hasAura} from '../../../sim-core/src/combat-auras.js';

// Sheet values use the same stats and same-level defense adjustments as combat.
// They describe standing, frontal defense; casting, control and facing still
// determine whether an individual attack can actually be avoided.
export function characterAttributes(c,st=stats(c)){
 const now=c.clock??c.time??0,auras=activeAuras(c,now);
 const bonus=type=>auras.filter(a=>a.type===type&&(a.charges==null||a.charges>0)).reduce((n,a)=>n+a.amount/100,0);
 const defenseBonus=(st.defense-c.level*5)*.0004;
 const shieldItem=items[c.equipment?.[17]?.id],shield=shieldItem?.InventoryType===14&&c.equipment[17].durability!==0;
 const offhand=items[c.equipment?.[17]?.id]?.class===2&&!c.form&&c.learned?.includes(674);
 const ranged=items[c.equipment?.[18]?.id]?.class===2;
 const skill=c.form==='cat'||c.form==='bear'?c.level*5:st.weaponSkill;
 const number=value=>Number(value||0).toLocaleString('zh-CN',{maximumFractionDigits:2});
 const percent=value=>(100*(value||0)).toFixed(2)+'%';
 const chance=value=>percent(Math.max(0,Math.min(1,value)));
 const row=(label,value)=>({label,value});
 const group=(title,rows,note='')=>({title,rows,note});
 return [
  group('基本属性',[['力量',st.str],['敏捷',st.agi],['耐力',st.sta],['智力',st.int],['精神',st.spi]].map(([label,value])=>row(label,number(value)))),
  group('近战属性',[
   row('攻击强度',number(st.attackPower)),row('近战暴击',chance(st.crit)),row('命中加成',percent(st.hit)),
   row('主手武器技能',number(skill)),row('副手武器技能',offhand?number(st.offhandWeaponSkill):'—'),
   row('精准','不适用'),
  ],'当前规则使用武器技能，没有独立精准属性。命中加成不是最终命中率；目标等级、武器技能和双持会影响未命中率。'),
  group('远程属性',[
   row('远程攻击强度',number(st.rangedAttackPower)),row('远程暴击',chance(st.rangedCrit)),row('命中加成',percent(st.hit)),row('远程武器技能',ranged?number(st.rangedWeaponSkill):'—'),
  ],'远程数值用于物理射击；魔杖按法术规则结算。未装备对应武器时，武器技能显示为 —。'),
  group('法术属性',[
   row('法术强度',number(st.spellPower)),row('治疗加成',number(st.healing)),row('法术暴击',chance(st.spellCrit)),row('法术命中加成',percent(st.spellHit)),
   ...[[2,'神圣'],[4,'火焰'],[8,'自然'],[16,'冰霜'],[32,'暗影'],[64,'奥术']].map(([mask,label])=>row(label+'法术强度',number(st.spellPower+(st['schoolPower'+mask]||0)))),
  ],'命中与暴击显示通用加成，特定技能、学派天赋及目标修正另行结算。'),
  group('防御属性',[
   row('护甲',number(st.armor)),row('物理减伤',percent(armorReduction(st.armor,c.level))),row('防御技能',number(st.defense)),
   row('躲闪',chance(st.dodge+bonus(49)+defenseBonus)),row('招架',hasAura(c,67,now)?'0.00%':chance(st.parry+bonus(47)+defenseBonus)),
   row('格挡',shield?chance(st.block+bonus(51)+defenseBonus):'0.00%'),
   row('格挡值',number(shield?Math.max(0,(shieldItem.block||0)+st.str/20-1)*(1+(st.blockValuePct||0)):0)),
  ],'按同级敌人、正面且可防御时计算；施法、控制和朝向会影响实际结果。格挡需要未损坏的盾牌。'),
  group('魔法抗性',[[1,'神圣'],[2,'火焰'],[3,'自然'],[4,'冰霜'],[5,'暗影'],[6,'奥术']].map(([school,label])=>row(label+'抗性',number(st.resistances?.[school])))),
 ];
}
