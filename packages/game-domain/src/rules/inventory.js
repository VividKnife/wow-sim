import {capitals} from '../../../game-data/world-content.js';
import {items,nameOf} from './catalog.js';
import {bagCapacity,clone,makeItem,log} from './character.js';
import {materialIds,marketIds,priceOverrides,recipes} from './profession-data.js';

export const quantity=(n,max=100)=>{if(!Number.isInteger(n)||n<1||n>max)throw new Error('数量必须是 1—'+max+' 的整数');return n;};
// A quest can request ordinary trade goods (linen, meat, oil). That does not
// change their source item category or permanently prohibit selling/storage.
export const protectedItem=i=>!!(i.locked||i.issued||items[i.id]?.class===12||items[i.id]?.bonding===4||i.id===6948);
export const bankable=i=>!i.issued&&i.id!==6948&&items[i.id]?.class!==12&&items[i.id]?.bonding!==4;
export const tradable=i=>!protectedItem(i)&&!i.bound&&!i.ownerId&&items[i.id]?.bonding!==1&&items[i.id]?.bonding!==4;
export const transferBlockedReason=i=>i.locked?'请先解锁物品':i.issued?'配发物品不能转移':i.id===6948?'炉石不能转移':items[i.id]?.class===12||items[i.id]?.bonding===4?'任务物品不能转移':null;
export const usableCount=(s,id)=>s.bag.filter(i=>i.id===id&&!i.locked&&!i.issued).reduce((n,i)=>n+i.count,0);
export function consume(s,id,count){if(usableCount(s,id)<count)throw new Error('缺少未锁定材料：'+nameOf('items',id));for(const i of [...s.bag]){if(i.id!==id||i.locked||i.issued)continue;const used=Math.min(i.count,count);i.count-=used;count-=used;if(!i.count)s.bag.splice(s.bag.indexOf(i),1);if(!count)break;}}
const stackKey=i=>JSON.stringify(Object.fromEntries(Object.entries(i).filter(([k])=>!['uid','count'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
export function put(list,instance,capacity){
 let remaining=instance.count;const max=Math.max(1,items[instance.id]?.stackable||1),key=stackKey(instance);
 const room=list.reduce((n,i)=>n+(stackKey(i)===key?Math.max(0,max-i.count):0),0)+(capacity-list.length)*max;
 if(room<remaining)throw new Error('储物空间不足，请先整理背包或银行。');
 for(const i of list){if(stackKey(i)!==key)continue;const n=Math.min(remaining,max-i.count);i.count+=n;remaining-=n;if(!remaining)return;}
 // Incoming transfer instances are at most one normal stack.
 if(remaining)list.push({...instance,count:remaining});
}
export function receive(s,id,count){const data=items[id],max=Math.max(1,data?.stackable||1);if(data?.maxcount>0){const owned=[...s.bag,...s.bank,...s.pending,...Object.values(s.equipment),...s.auctions.map(a=>a.item)].filter(i=>i.id===id).reduce((n,i)=>n+i.count,0);if(owned+count>data.maxcount)throw new Error('超过唯一物品持有上限：'+nameOf('items',id));}while(count>0){const n=Math.min(count,max);put(s.bag,makeItem(s,id,n),bagCapacity(s));count-=n;}}
export function organize(list){const result=[];for(const i of list)put(result,i,Infinity);result.sort((a,b)=>(items[a.id]?.class||0)-(items[b.id]?.class||0)||(items[b.id]?.Quality||0)-(items[a.id]?.Quality||0)||a.id-b.id||a.uid.localeCompare(b.uid));return result;}
export const bankHere=s=>capitals.some(c=>c.id===s.location);
export const bankCapacity=s=>24+s.bankUpgrades*16;
const scrollRecipes=Object.fromEntries(recipes.filter(r=>r.item>=900000).map(r=>[r.item,r]));
export function marketPrice(id){const i=items[id];if(!i)return null;const scrollCost=scrollRecipes[id]?.materials.reduce((n,m)=>n+m.count*marketPrice(m.id).buy,0)||0;const buy=Math.max(4,(i.SellPrice||0)*4,priceOverrides[id]||0,Math.ceil(scrollCost*1.1));return{buy,sell:Math.max(1,Math.floor(buy*.65))};}
export const marketView=()=>marketIds.filter(id=>items[id]).map(id=>({id,...marketPrice(id),enchant:items[id].enchant||null}));
export function buyMarket(s,id,count){quantity(count);if(!marketIds.includes(id)||!items[id])throw new Error('拍卖行没有这件商品');const cost=marketPrice(id).buy*count;if(s.money<cost)throw new Error('金币不足');receive(s,id,count);s.money-=cost;}
export function selectedBagItems(s,uids){
 if(!Array.isArray(uids)||!uids.length||uids.some(uid=>typeof uid!=='string')||new Set(uids).size!==uids.length)throw new Error('请选择物品，且不能重复选择');
 return uids.map(uid=>{const i=s.bag.find(i=>i.uid===uid);if(!i)throw new Error('所选物品已不在背包中，请重新选择');return i;});
}
export function sellBatch(s,uids){
 const selected=selectedBagItems(s,uids);
 if(selected.some(i=>protectedItem(i)||!(items[i.id]?.SellPrice>0)))throw new Error('所选物品无法出售或已锁定');
 const amount=selected.reduce((n,i)=>n+items[i.id].SellPrice*i.count,0),selectedIds=new Set(uids);
 s.money+=amount;s.bag=s.bag.filter(i=>!selectedIds.has(i.uid));log(s,'出售 '+selected.length+' 组物品，获得 '+amount+' 铜','trade');
}
export function auctionSellBatch(s,uids){
 const selected=selectedBagItems(s,uids);
 if(selected.some(i=>!tradable(i)||!(items[i.id]?.Quality>0)))throw new Error('仅可上架未绑定、未锁定的非任务物品；灰色垃圾请售予商人');
 if(s.auctions.length+selected.length>100)throw new Error('最多同时上架 100 组物品');
 const listings=selected.map(i=>{const gross=marketPrice(i.id).sell*i.count,net=Math.floor(gross*.95);if(net<1)throw new Error('这组物品价值过低');return{id:i.uid,item:clone(i),gross,net,createdAt:s.clock,endsAt:s.clock+30000};});
 s.auctions.push(...listings);const selectedIds=new Set(uids);s.bag=s.bag.filter(i=>!selectedIds.has(i.uid));
 for(const a of listings)log(s,'自动上架 '+nameOf('items',a.item.id)+' ×'+a.item.count+'，预计到账 '+a.net+' 铜','trade');
}
export function auctionSell(s,uid){auctionSellBatch(s,[uid]);}
export function settleAuctions(s){for(const a of s.auctions.filter(a=>a.endsAt<=s.clock)){s.money+=a.net;s.marketHistory.unshift({id:a.id,item:a.item.id,count:a.item.count,net:a.net,at:a.endsAt});log(s,'拍卖行已收购 '+nameOf('items',a.item.id)+' ×'+a.item.count+'，到账 '+a.net+' 铜','trade');}s.auctions=s.auctions.filter(a=>a.endsAt>s.clock);s.marketHistory=s.marketHistory.slice(0,30);}
export function storageAction(s,a){
 if(a.type==='sortBag'){s.bag=organize(s.bag);return;}
 if(a.type==='discardJunk'){const selected=s.bag.filter(i=>items[i.id]?.Quality===0&&!protectedItem(i));if(!selected.length)throw new Error('没有可丢弃的灰色物品');const uids=new Set(selected.map(i=>i.uid)),count=selected.reduce((n,i)=>n+i.count,0);s.bag=s.bag.filter(i=>!uids.has(i.uid));log(s,'一键丢弃灰色物品，共 '+count+' 件','trade');return;}
 if(a.type==='lockItem'){const i=s.bag.find(i=>i.uid===a.uid)||s.bank.find(i=>i.uid===a.uid);if(!i)throw new Error('找不到这件物品');i.locked=!i.locked;return;}
 if(a.type==='auctionBuy'){buyMarket(s,a.id,a.count);return;}
 if(a.type==='auctionSell'){auctionSell(s,a.uid);return;}
 if(a.type==='auctionSellBatch'){auctionSellBatch(s,a.uids);return;}
 if(a.type==='auctionSellAll'){const selected=s.bag.filter(i=>tradable(i)&&items[i.id]?.Quality>0&&items[i.id]?.Quality<=3);if(!selected.length)throw new Error('没有可快捷上架的物品');auctionSellBatch(s,selected.map(i=>i.uid));return;}
 if(a.type==='auctionCancel'){const listing=s.auctions.find(i=>i.id===a.id);if(!listing)throw new Error('拍卖已成交或不存在');put(s.bag,listing.item,bagCapacity(s));s.auctions=s.auctions.filter(i=>i.id!==a.id);return;}
 if(!bankHere(s))throw new Error('请到本阵营主城的银行办理。');
 if(a.type==='sortBank'){s.bank=organize(s.bank);return;}
 if(a.type==='expandBank'){if(s.bankUpgrades>=3)throw new Error('银行容量已达上限');const cost=1000*(s.bankUpgrades+1);if(s.money<cost)throw new Error('金币不足');s.money-=cost;s.bankUpgrades++;return;}
 if(a.type==='bankDepositMaterials'){const selected=s.bag.filter(i=>materialIds.has(i.id)&&!protectedItem(i));if(!selected.length)throw new Error('没有可存入的未锁定材料');for(const i of selected){put(s.bank,i,bankCapacity(s));s.bag=s.bag.filter(x=>x.uid!==i.uid);}return;}
 const deposit=a.type==='bankDeposit',source=deposit?s.bag:s.bank,target=deposit?s.bank:s.bag,capacity=deposit?bankCapacity(s):bagCapacity(s);
 const i=source.find(i=>i.uid===a.uid);if(!i)throw new Error('找不到这件物品');const count=quantity(a.count,Math.max(1,i.count));if(!bankable(i))throw new Error('任务物品、炉石或配发装备不能存入银行');
 const moved={...i,count,uid:count===i.count?i.uid:'i'+(++s.itemSequence)};put(target,moved,capacity);i.count-=count;if(!i.count)source.splice(source.indexOf(i),1);
}
export const storageActions=new Set(['sortBag','discardJunk','lockItem','auctionBuy','auctionSell','auctionSellBatch','auctionSellAll','auctionCancel','sortBank','expandBank','bankDepositMaterials','bankDeposit','bankWithdraw']);
