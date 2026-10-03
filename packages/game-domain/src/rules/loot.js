import {itemIdentity,nextItemIdentity} from './item-identity.js';
import {items,nameOf} from './catalog.js';
import {makeItem,log} from './character.js';
import {putInBag} from './inventory.js';
import {canReceiveEquipment} from './npc-equipment.js';
import {npcAward} from './npc-world.js';
import {queueGroupLoot} from './group-loot.js';
import {rewardCharacters} from './combat-members.js';

// Filter only automatic pickup; unknown items remain eligible and manual pickup is unchanged.
export function autoLootSkips(s,item){return !!(s.settings.autoLoot&&s.settings.autoLootIgnoreGray&&items[item.id]?.Quality===0);}
export function hasBlockingLoot(s){return s.pending.some(item=>!autoLootSkips(s,item));}
export function collectAutoLoot(s){collectLoot(s,s.pending.filter(item=>!autoLootSkips(s,item)).map(item=>item.uid));}

// Keep rolled rewards out of the inventory until the player actually loots them.
export function queueCombatLoot(s,id,count,recipients=rewardCharacters(s)){
 const data=items[id];if(!data)return;
 if(!recipients.length)return;
 if(queueGroupLoot(s,id,count,recipients))return;
 if(s.dungeon&&s.party.length&&!data.startquest&&data.bonding!==4){
  const actors=recipients,max=Math.max(1,data.stackable||1);
  while(count>0){
   const cursor=s.lootCursor??0;if(!Number.isSafeInteger(cursor)||cursor<0||cursor===Number.MAX_SAFE_INTEGER)throw new Error('Loot sequence exhausted');
   const eligible=actors.map((_,offset)=>actors[(cursor+offset)%actors.length]).find(c=>canReceiveEquipment(c,data));
   if(!eligible)return;
   const owned=[...(eligible.bag||[]),...(eligible.pending||[]),...(eligible.bank||[]),...Object.values(eligible.equipment),...(eligible.auctions||[]).map(a=>a.item)].filter(i=>i.id===id).reduce((n,i)=>n+i.count,0);
   const n=Math.min(count,max,data.maxcount>0?Math.max(0,data.maxcount-owned):count),item={...makeItem(s,id,n),lootBattleId:s.combat?.id};
   s.lootCursor=cursor+((actors.indexOf(eligible)-cursor%actors.length+actors.length)%actors.length)+1;
   if(!Number.isSafeInteger(s.lootCursor))throw new Error('Loot sequence exhausted');
   if(eligible.npcPlayer)npcAward(s,eligible,item,false);else eligible.pending.push(item);
   count-=n;
  }
  return;
 }
 queuePersonalCombatLoot(s,recipients[0],id,count);
}

export function queuePersonalCombatLoot(s,actor,id,count){
 const data=items[id];if(!data)return;
 const owned=[...actor.bag,...actor.pending,...actor.bank,...Object.values(actor.equipment),...actor.auctions.map(a=>a.item)].filter(i=>i.id===id).reduce((n,i)=>n+i.count,0);
 if(data.maxcount>0)count=Math.min(count,Math.max(0,data.maxcount-owned));
 const max=Math.max(1,data.stackable||1);
 while(count>0){const n=Math.min(count,max);actor.pending.push({...makeItem(s,id,n),lootBattleId:s.combat?.id});count-=n;}
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
   try{putInBag(s,{...instance,count,uid:remaining===item.count?item.uid:itemIdentity(s)});}
   catch(error){break;}
   if(remaining!==item.count)s.itemSequence++;
   remaining-=count;
  }
  if(remaining<item.count)log(s,`拾取 ${nameOf('items',item.id)} ×${item.count-remaining}`,'loot');
  if(remaining){if(remaining<item.count)item.uid=nextItemIdentity(s);item.count=remaining;}else s.pending.splice(s.pending.indexOf(item),1);
 }
}
