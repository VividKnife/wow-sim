import {items,nameOf} from './catalog.js';
import {professionRanks,professions} from './profession-data.js';
import {marketIds,marketOffer,marketAvailability,reserveMarket} from './market.js';
import {equipmentUpgrade,equipNpcItem} from './npc-equipment.js';

const pairs=[['herbalism','alchemy'],['mining','blacksmithing'],['skinning','leatherworking'],['tailoring','enchanting'],['mining','engineering']];
export const wealthyNpc=p=>['whale','impulsive'].includes(p.raidProfile.personality);
// Copper per hour at level 60. Net professional earnings include materials,
// training, travel and auction fees; this is an abstract job, not free crafting.
export const NPC_ECONOMY={professionGoldPerHour:6,wealthGoldPerHour:150,expertMultiplier:2};
export function trainNpcProfessions(c,index){
 c.professions??={};
 for(const id of [...pairs[index%pairs.length],'fishing','cooking','firstaid']){
  const target=Math.min(300,c.level*5);
  const ranks=professionRanks[id].filter(r=>r.level<=c.level&&r.skill<=target);
  if(!ranks.length)continue;
  const cap=ranks.at(-1).cap,old=c.professions[id];
  c.professions[id]={...old,cap,skill:Math.max(old?.skill||0,Math.min(cap,target))};
 }
}
export function npcIncome(p,milliseconds,professionalFraction=1){
 trainNpcProfessions(p.unit,p.index);
 const professional=Object.entries(p.unit.professions).reduce((sum,[id,value])=>sum+value.skill/300*(professions.find(p=>p.id===id)?.kind==='副职业'?.1:.5),0);
 const expert=p.raidProfile.skill==='expert'?NPC_ECONOMY.expertMultiplier:1;
 const profession=Math.floor(professional*NPC_ECONOMY.professionGoldPerHour*10000*expert*professionalFraction*milliseconds/3600000);
 const wealth=wealthyNpc(p)?Math.floor(NPC_ECONOMY.wealthGoldPerHour*10000*(p.unit.level/60)**2*milliseconds/3600000):0;
 p.wallet+=profession+wealth;p.unit.money=p.wallet;
 p.economy??={profession:0,wealth:0,shopping:0};
 p.economy.profession+=profession;p.economy.wealth+=wealth;
 return {profession,wealth};
}
const luxuryIds=marketIds.filter(id=>items[id].bonding===2&&items[id].Quality>=3&&[2,4].includes(items[id].class));
export function buyNpcLuxury(p,at){
 if(!wealthyNpc(p))return null;
 // Background trading uses wall time; store explicit wall deadlines so room
 // clock rebasing cannot move an NPC's market restock deadline.
 const stock=Object.fromEntries(Object.entries(p.economy?.stock||{}).map(([id,row])=>[id,{purchased:row.purchased,restockAt:row.restockWall}]));
 const c=p.unit,shopping={money:p.wallet,clock:at,marketStock:stock};
 const reserve=Math.round(20*10000*c.level/60);
 const choices=luxuryIds.map(id=>({id,offer:marketOffer(id),plan:equipmentUpgrade(c,items[id])}))
  .filter(x=>x.plan.need&&x.offer&&x.offer.buy<=p.wallet-reserve&&marketAvailability(shopping.marketStock,at,x.offer).available>0)
  .sort((a,b)=>b.plan.improvement-a.plan.improvement||a.id-b.id);
 const choice=choices[0];if(!choice)return null;
 const cost=reserveMarket(shopping,[{id:choice.id,count:1}]);
 p.wallet=shopping.money;p.unit.money=p.wallet;
 equipNpcItem(c,{id:choice.id,uid:`${c.id}:market:${++c.itemSequence}`,count:1,durability:items[choice.id].MaxDurability},choice.plan);
 p.economy??={profession:0,wealth:0,shopping:0};p.economy.shopping+=cost;
 p.economy.stock=Object.fromEntries(Object.entries(shopping.marketStock).map(([id,row])=>[id,{purchased:row.purchased,restockWall:row.restockAt}]));
 return `在拍卖行花费${(cost/10000).toFixed(2)}金购买${nameOf('items',choice.id)}并换装。`;
}
