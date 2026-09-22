import {items} from './catalog.js';
import {canEquip,slotOf,stats} from './character.js';
import {combatRole} from './combat-roles.js';

// Compare complete loadouts: both ring slots and the loss of an offhand matter.
function value(c,equipment){
 const st=stats({...c,equipment}),role=combatRole(c),caster=role==='healer'||role==='ranged'&&c.classId!==3;
 const weapon=items[equipment[c.classId===3?18:16]?.id];
 const dps=weapon?.class===2?((weapon.dmg_min1||0)+(weapon.dmg_max1||0))*500/Math.max(1,weapon.delay):0;
 if(role==='tank')return st.maxHp*.12+st.armor*.09+st.defense*2+(st.block||0)*200+st.attackPower*.25+dps*4;
 if(role==='healer')return st.healing*2+st.int*2+st.spi*1.4+st.maxMana*.04+st.maxHp*.025;
 if(caster)return st.spellPower*2+st.int*1.5+st.spi*.35+st.maxMana*.025+st.maxHp*.025;
 return (c.classId===3?st.rangedAttackPower:st.attackPower)*.8+st.agi*.8+dps*8+st.maxHp*.04;
}
export function equipmentUpgrade(c,item){
 const data=typeof item==='number'?items[item]:item;
 if(!data||![2,4].includes(data.class)||!data.InventoryType||[4,19].includes(data.InventoryType)||!canEquip(c,data)||data.RequiredReputationFaction||data.requiredhonorrank||data.RequiredCityRank)return {need:false,reason:'不符合装备条件'};
 if([...(c.bag||[]),...(c.bank||[]),...(c.pending||[]),...(c.pendingRewards||[])].some(i=>i.id===data.entry))return {need:false,reason:'已经拥有这件装备，先领取或换装'};
 const role=combatRole(c);
 if(role==='tank'&&c.classId!==11&&(data.InventoryType===17||slotOf(data)===17&&data.InventoryType!==14))return {need:false,reason:'当前坦克职责保留盾牌'};
 const natural=slotOf(data),slots=[natural];
 if([11,13].includes(natural))slots.push(natural+1);
 if(data.class===2&&data.InventoryType===13&&c.learned.includes(674))slots.push(17);
 const before=value(c,c.equipment);let best=null;
 for(const slot of slots){
  if(slot===17&&(items[c.equipment[16]?.id]?.InventoryType===17||data.class===2&&!c.learned.includes(674)))continue;
  const equipment={...c.equipment,[slot]:{id:data.entry}};
  if(data.InventoryType===17)delete equipment[17];
  if(data.maxcount>0&&Object.values(equipment).filter(e=>e.id===data.entry).length>data.maxcount)continue;
  const improvement=value(c,equipment)-before;
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
