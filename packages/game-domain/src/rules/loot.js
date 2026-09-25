import {items,nameOf} from './catalog.js';
import {makeItem,bagCapacity,log} from './character.js';
import {put} from './inventory.js';
import {queueGroupLoot} from './group-loot.js';

// Filter only automatic pickup; unknown items remain eligible and manual pickup is unchanged.
export function autoLootSkips(s,item){return !!(s.settings.autoLoot&&s.settings.autoLootIgnoreGray&&items[item.id]?.Quality===0);}
export function hasBlockingLoot(s){return s.pending.some(item=>!autoLootSkips(s,item));}
export function collectAutoLoot(s){collectLoot(s,s.pending.filter(item=>!autoLootSkips(s,item)).map(item=>item.uid));}

// Keep rolled rewards out of the inventory until the player actually loots them.
export function queueCombatLoot(s,id,count){
 const data=items[id];if(!data)return;
 if(queueGroupLoot(s,id,count))return;
 const owned=[...s.bag,...s.pending,...s.bank,...Object.values(s.equipment),...s.auctions.map(a=>a.item)].filter(i=>i.id===id).reduce((n,i)=>n+i.count,0);
 if(data.maxcount>0)count=Math.min(count,Math.max(0,data.maxcount-owned));
 const max=Math.max(1,data.stackable||1);
 while(count>0){const n=Math.min(count,max);s.pending.push({...makeItem(s,id,n),lootBattleId:s.combat.id});count-=n;}
}

export function collectLoot(s,uids){
 if(s.combat)throw new Error('请先结束战斗再拾取。');
 if(uids!==undefined&&(!Array.isArray(uids)||uids.some(uid=>typeof uid!=='string')))throw new Error('拾取物品列表无效。');
 const selected=uids===undefined?null:new Set(uids);
 for(const item of [...s.pending]){
  if(selected&&!selected.has(item.uid))continue;
  const {lootBattleId,...instance}=item;
  const max=Math.max(1,items[item.id]?.stackable||1);
  let remaining=item.count;
  while(remaining>0){
   const count=Math.min(remaining,max);
   try{put(s.bag,{...instance,count,uid:remaining===item.count?item.uid:'i'+(s.itemSequence+1)},bagCapacity(s));}
   catch{break;}
   if(remaining!==item.count)s.itemSequence++;
   remaining-=count;
  }
  if(remaining<item.count)log(s,`拾取 ${nameOf('items',item.id)} ×${item.count-remaining}`,'loot');
  if(remaining){if(remaining<item.count)item.uid='i'+(++s.itemSequence);item.count=remaining;}else s.pending.splice(s.pending.indexOf(item),1);
 }
}
