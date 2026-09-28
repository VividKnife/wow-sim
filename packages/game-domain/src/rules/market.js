import {groupRows} from '../../../sim-core/src/collections.js';
import {items,nameOf,table} from './catalog.js';
import {materialIds,recipes,potions,bandages} from './profession-data.js';
import {marketReference,classMarketSupplies} from '../../../game-data/market-reference.js';
import {marketAvailability} from '../../../sim-core/src/market-stock.js';

const crafted=groupRows(recipes,r=>r.item);
const vendors=new Map();
for(const r of table('npc_vendor')){const i=items[r.item];if(i?.BuyPrice>0)vendors.set(i.entry,i.BuyPrice/Math.max(1,i.BuyCount));}
const supplies=new Set(classMarketSupplies);
export const marketCategory=i=>i.enchant?'enchants':supplies.has(i.entry)?'reagents':({0:'consumables',1:'containers',2:'weapons',4:'armor',5:'materials',6:'projectiles',7:'materials',9:'recipes',11:'quivers'})[i.class]||'misc';
export const marketEligible=i=>!!(i&&i.Quality>0&&i.Quality<=4&&![1,4].includes(i.bonding)&&![12,13].includes(i.class)&&i.entry!==6948&&!i.companionKit&&i.RequiredLevel<=60);
// Keep the catalog tied to supported professions, actual vendors and authored
// supplies. Never turn the entire world loot table (including raid loot) into a shop.
const candidates=new Set([...materialIds,...recipes.flatMap(r=>[r.item,...r.tools,...r.recipeItems]),...Object.keys(potions).map(Number),...Object.keys(bandages).map(Number),...classMarketSupplies,4496,4498,
 ...table('npc_vendor').map(r=>r.item).filter(id=>[0,1,5,6,11].includes(items[id]?.class))]);
export const marketIds=[...candidates].filter(id=>marketEligible(items[id])).sort((a,b)=>a-b);
const marketSet=new Set(marketIds);
const priceCache=new Map();
function fallback(i){
 const quality=[1,1,2,5,15][i.Quality]||1,level=Math.max(1,i.RequiredLevel||i.ItemLevel||1);
 return Math.ceil(Math.max(4,(i.SellPrice||0)*1.6,level*level*quality*([2,4,9].includes(i.class)?12:2)));
}
function quote(id,path=new Set()){
 const i=items[id];if(!i)return null;
 if(priceCache.has(id))return priceCache.get(id);
 if(path.has(id))return {buy:fallback(i),sell:Math.floor(fallback(i)*.8)};
 const visited=new Set(path).add(id);
 const costs=(crafted[id]||[]).map(r=>r.materials.reduce((sum,m)=>sum+m.count*quote(m.id,visited).buy,0)/r.output).filter(n=>n>0);
 const craftCost=costs.length?Math.min(...costs):0,vendor=vendors.get(id),target=marketReference.prices[id];
 const buy=Math.max((i.SellPrice||0)+1,Math.ceil(target??(vendor?vendor*110/100:craftCost?craftCost*115/100:fallback(i))));
 // Prevent buy -> sell and vendor -> AH guaranteed profit. The vendor cap
 // includes the largest (20%) reputation/PvP discount with a margin.
 const sell=Math.max(0,Math.floor(Math.min(buy*80/100,vendor?vendor*70/100:Infinity,craftCost?craftCost*90/100:Infinity)));
 const result={buy,sell,basis:marketReference.anchors[id]?'reference':target?'estimate':vendor?'vendor':craftCost?'craft':'estimate'};
 // Recursive quotes in conversion cycles must not contaminate another root.
 if(!path.size)priceCache.set(id,result);
 return result;
}
export const marketPrice=id=>quote(id);
function supply(id){
 const i=items[id],price=marketPrice(id).buy,category=marketCategory(i);
 if(price>=100000||i.Quality===4)return {capacity:5,restockMs:3600000};
 if(['weapons','armor','containers','recipes','quivers','enchants'].includes(category))return {capacity:10,restockMs:1800000};
 if(category==='reagents'||vendors.has(id)&&[0,5,6].includes(i.class))return {capacity:400,restockMs:300000};
 if(materialIds.has(id))return {capacity:price>=10000?40:200,restockMs:price>=10000?1800000:300000};
 return {capacity:40,restockMs:900000};
}
const offers=marketIds.map(id=>({id,...marketPrice(id),...supply(id),category:marketCategory(items[id]),enchant:items[id].enchant||null}));
const offerById=new Map(offers.map(row=>[row.id,row]));
export const marketView=()=>offers;
export const marketOffer=id=>offerById.get(id);
export {marketAvailability};

/** Preflight the whole replenishment request before spending or reserving. */
export function reserveMarket(s,requests){
 const totals=new Map();
 for(const {id,count} of requests){
  if(!Number.isSafeInteger(count)||count<1)throw new Error('购买数量必须是正整数');
  if(!marketSet.has(id))throw new Error('拍卖行没有这件商品：'+nameOf('items',id)+'；绑定材料或工具需自行获取');
  totals.set(id,(totals.get(id)||0)+count);
 }
 let cost=0;const reservations=[];
 for(const [id,count] of totals){
  const row=offerById.get(id),stock=marketAvailability(s.marketStock,s.clock,row);
  if(count>stock.available)throw new Error(nameOf('items',id)+'库存不足，剩余 '+stock.available+' 件，请等待自动补货');
  cost+=row.buy*count;reservations.push([id,{purchased:row.capacity-stock.available+count,restockAt:stock.restockAt}]);
 }
 if(s.money<cost)throw new Error('金币不足');
 s.money-=cost;s.marketStock={...s.marketStock,...Object.fromEntries(reservations)};
 return cost;
}
