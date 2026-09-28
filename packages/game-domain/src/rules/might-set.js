import {items,spells} from './catalog.js';

// Battlegear of Might (209), from the pinned Classic item-set spell records.
// Broken pieces do not grant a set bonus; duplicate item instances count once.
export function mightSetBonuses(c){
 const count=c.classId===1?new Set(Object.values(c.equipment||{}).filter(e=>items[e.id]?.itemset===209&&e.durability!==0).map(e=>e.id)).size:0;
 return {count,blockValue:count>=3?spells[23562].EffectBasePoints1+1:0,
  rageChance:count>=5?spells[21838].ProcChance/100:0,
  sunderThreat:count>=8?1+(spells[23561].EffectBasePoints1+1)/100:1};
}
