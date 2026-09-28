import {items,spells} from './catalog.js';
import {canEquip,slotOf,stats} from './character.js';
import {combatRole} from './combat-roles.js';
import {talentSpellValue} from './talent-effects.js';
import {weaponMissChance,glanceMultiplier} from '../../../sim-core/src/attack-table.js';

// Scoring is a role heuristic, not a simulated DPS promise. School-specific
// power and talent hit caps follow the NPC's actual offensive spell families.
function magicValue(c,st){
 const fallback={2:20187,5:8092,7:403,8:116,9:686,11:2912};
 const byName=new Map();
 for(const rule of c.rules||[]){const sp=spells[rule.spell];if(rule.enabled&&sp?.School>0&&[1,2,3].some(n=>sp['Effect'+n]===2||[3,53].includes(sp['EffectApplyAuraName'+n])))byName.set(sp.SpellName,sp);}
 const profile=byName.size?[...byName.values()]:[spells[fallback[c.classId]]].filter(Boolean);
 if(!profile.length)return 0;
 return profile.reduce((sum,sp)=>sum+(st.spellPower+(st['schoolPower'+(1<<sp.School)]||0))*2+
  Math.min(.16,st.spellHit+talentSpellValue(c,sp,16,0)/100)*1800+st.spellCrit*1000,0)/profile.length;
}

// Compare complete loadouts: both ring slots and the loss of an offhand matter.
export function npcEquipmentValue(c,equipment=c.equipment){
 const role=combatRole(c),form=c.classId===11?(role==='tank'?'bear':role==='melee'?'cat':null):null;
 const st=stats({...c,equipment,form}),caster=role==='healer'||role==='ranged'&&c.classId!==3;
 const weapon=items[equipment[c.classId===3?18:16]?.id];
 const dps=weapon?.class===2?((weapon.dmg_min1||0)+(weapon.dmg_max1||0))*500/Math.max(1,weapon.delay):0;
 const offhand=items[equipment[17]?.id];
 const offhandDps=offhand?.class===2&&c.learned?.includes(674)?((offhand.dmg_min1||0)+(offhand.dmg_max1||0))*250/Math.max(1,offhand.delay):0;
 const healthWeight=c.npcBuild?.temperament==='steady'?.05:.025;
 const offense=c.npcBuild?.temperament==='collector'?1.08:1;
 // Small fallback value for on-use/proc items not represented in passive stats;
 // their item level must not outweigh the measured offensive/healing stats.
 const itemBudget=Object.values(equipment).reduce((sum,e)=>sum+(items[e.id]?.ItemLevel||0)*.1,0);
 if(role==='tank')return itemBudget+st.maxHp*(.1+healthWeight)+st.armor*.09+st.defense*2+((st.block||0)+st.dodge+st.parry)*300+st.attackPower*.25+(form?0:dps*4)+(c.classId===2?magicValue(c,st)*.35:0);
 if(role==='healer')return itemBudget+st.healing*2+st.int*2+st.spi*1.4+st.maxMana*.04+st.spellCrit*800+st.maxHp*healthWeight;
 if(caster){
  return itemBudget+offense*magicValue(c,st)+st.int*1.2+st.spi*.35+st.maxMana*.025+st.maxHp*healthWeight;
 }
 const defense=(c.level+3)*5,skill=form?c.level*5:c.classId===3?st.rangedWeaponSkill:st.weaponSkill;
 const specialHit=1-weaponMissChance(skill,defense,{hit:st.hit});
 const dual=offhandDps>0,whiteHit=1-weaponMissChance(skill,defense,{hit:st.hit,dualWield:dual});
 const whiteBase=1-weaponMissChance(skill,defense,{dualWield:dual});
 const hit=specialHit*1600+(dual?(whiteHit-whiteBase)*400:0);
 const glancing=c.classId===3?0:glanceMultiplier(skill,defense,.5)*400;
 const hybrid=[2,7].includes(c.classId)?magicValue(c,st)*.25:0;
 return itemBudget+offense*((c.classId===3?st.rangedAttackPower:st.attackPower)*.8+(form?0:dps+offhandDps)*8+(c.classId===3?st.rangedCrit??st.crit:st.crit)*1400+hit+glancing+hybrid)+st.maxHp*healthWeight;
}
export function npcWeaponAllowed(c,item){
 if(item.class!==2||slotOf(item)===18)return true;
 const style=c.npcBuild?.weaponStyle;
 if(style==='dual')return item.InventoryType!==17;
 if(style==='twoHand')return item.InventoryType===17;
 return true;
}
export function equipmentUpgrade(c,item){
 const data=typeof item==='number'?items[item]:item;
 if(!data||![2,4].includes(data.class)||!data.InventoryType||[4,19].includes(data.InventoryType)||!canEquip(c,data)||data.RequiredReputationFaction||data.requiredhonorrank||data.RequiredCityRank)return {need:false,reason:'不符合装备条件'};
 if([...(c.bag||[]),...(c.bank||[]),...(c.pending||[]),...(c.pendingRewards||[])].some(i=>i.id===data.entry))return {need:false,reason:'已经拥有这件装备，先领取或换装'};
 const role=combatRole(c);
 if(!npcWeaponAllowed(c,data))return {need:false,reason:'不符合当前天赋方案的武器类型'};
 if(role==='tank'&&c.classId!==11&&(data.InventoryType===17||slotOf(data)===17&&data.InventoryType!==14))return {need:false,reason:'当前坦克职责保留盾牌'};
 const natural=slotOf(data),slots=[natural];
 if([11,13].includes(natural))slots.push(natural+1);
 if(data.class===2&&data.InventoryType===13&&c.learned.includes(674))slots.push(17);
 const before=npcEquipmentValue(c,c.equipment);let best=null;
 for(const slot of slots){
  if(slot===17&&(items[c.equipment[16]?.id]?.InventoryType===17||data.class===2&&!c.learned.includes(674)))continue;
  const equipment={...c.equipment,[slot]:{id:data.entry}};
  if(data.InventoryType===17)delete equipment[17];
  if(data.maxcount>0&&Object.values(equipment).filter(e=>e.id===data.entry).length>data.maxcount)continue;
  const improvement=npcEquipmentValue(c,equipment)-before;
  if(!best||improvement>best.improvement)best={slot,improvement,replaces:c.equipment[slot]?.id||null};
 }
 const need=!!best&&best.improvement>.1;
 return {...best,need,reason:need?'提升当前职责配装':'已有相当或更好的配装'};
}
export function canReceiveEquipment(c,item){
 if(!item.maxcount||item.maxcount<0)return true;
 const owned=[...Object.values(c.equipment),...(c.bag||[]),...(c.bank||[]),...(c.pending||[]),...(c.pendingRewards||[])].filter(i=>i.id===item.entry).reduce((n,i)=>n+(i.count||1),0);
 return owned<item.maxcount;
}
export function equipNpcItem(c,item,plan=equipmentUpgrade(c,items[item.id])){
 if(!plan.need)return false;
 c.equipment[plan.slot]={...item,bound:true,ownerId:c.id};
 if(items[item.id].InventoryType===17)delete c.equipment[17];
 const st=stats(c);c.hp=Math.min(c.hp,st.maxHp);c.mana=Math.min(c.mana,st.maxMana);
 return true;
}
