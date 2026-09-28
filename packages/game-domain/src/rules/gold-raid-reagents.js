import {knownRank,spellInfo,makeItem,bagCapacity,log} from './character.js';
import {items,nameOf} from './catalog.js';
import {put,usableCount,marketPrice} from './inventory.js';
import {groupBuffRoots} from './group-buffs.js';

// Ten complete raid rebuff rounds per caster, even when another caster is absent.
export const GOLD_REAGENT_ROUNDS=10;
export function goldReagentTargets(c){
 const totals=new Map(),blessings=new Map();
 for(const root of Object.values(groupBuffRoots)){
  const id=knownRank(c,root);if(!id)continue;
  const sp=spellInfo(c,id),greater=sp.SpellName.startsWith('Greater Blessing');
  for(let i=1;i<=8;i++){
   const reagent=sp['Reagent'+i],count=sp['ReagentCount'+i];if(!(reagent>0&&count>0))continue;
   // Greater blessings cover a class; each paladin supplies one blessing per class.
   const target=count*GOLD_REAGENT_ROUNDS*(greater?9:5),map=greater?blessings:totals;
   map.set(reagent,greater?Math.max(map.get(reagent)||0,target):(map.get(reagent)||0)+target);
  }
 }
 for(const [id,count]of blessings)totals.set(id,(totals.get(id)||0)+count);
 // Reincarnation and Divine Intervention also need ordinary vendor reagents.
 for(const [root,reagent]of [[20608,17030],[19752,17033]])if(knownRank(c,root))totals.set(reagent,GOLD_REAGENT_ROUNDS);
 return totals;
}
export function stockGoldReagents(s,c){
 if(!c.goldNpc)return;
 c.bag??=[];
 for(const [id,target]of goldReagentTargets(c)){
  let missing=target-usableCount(c,id);const price=marketPrice(id).buy;
  while(missing>0&&c.money>=price){
   const count=Math.min(missing,Math.max(1,items[id].stackable),Math.floor(c.money/price));
   // Do not discard equipment or overfill a member's backpack to buy supplies.
   const bag=structuredClone(c.bag),item=makeItem(s,id,count);
   try{put(bag,item,bagCapacity({...c,bags:c.bags||[]}));}catch{break;}
   c.bag=bag;c.money-=price*count;c.goldProfile.consumableSpent+=price*count;missing-=count;
  }
  if(missing>0)log(s,`${c.name} 的${nameOf('items',id)}备料不足（${usableCount(c,id)}/${target}），需要更多金币或背包空间。`,'system');
 }
}
