import {itemBis} from './item-bis.js';
import {itemDetails} from './item-details.js';
import {dungeonJournal} from './dungeon-journal.js';
import {moltenCoreBosses,moltenCoreMap} from './molten-core-content.js';
import {onyxiaBoss,onyxiaMap} from './onyxia-content.js';
import {raidLoot} from './raid-rewards.js';
import presentation from '../../../game-data/data/dungeon-presentation.json' with {type:'json'};
import {items,nameOf,icon,classDefinitions,raceDefinitions} from './catalog.js';
import {marketView} from './inventory.js';
import {enchants,bandages,potions} from './profession-data.js';
import manifest from '../../../game-data/manifest.json' with {type:'json'};

export function itemView(id){
 const i=items[id];
 return i?{...itemDetails(id),bis:itemBis(id),id,appearanceItemId:i.appearanceItemId||id,name:nameOf('items',id),icon:icon('items',id),quality:i.Quality,level:i.RequiredLevel,maxDurability:i.MaxDurability,armor:i.armor,class:i.class,subclass:i.subclass,mailEligible:i.class!==12&&id!==6948&&i.bonding!==1&&i.bonding!==4,description:enchants[i.enchant]?.description||null,enchant:i.enchant||null,slot:i.InventoryType,bagSlots:i.class===1?i.ContainerSlots:0,sell:i.SellPrice,damage:i.dmg_min1?[i.dmg_min1,i.dmg_max1]:null,speed:i.delay,stats:[1,2,3,4,5,6,7,8,9,10].filter(n=>i['stat_value'+n]).map(n=>({type:i['stat_type'+n],value:i['stat_value'+n]}))}:null;
}

const catalog={
 dungeonJournal,
 raidJournal:[
  {id:'molten-core',name:'熔火之心',zone:'黑石山',description:'深入黑石山下的熔火之心，挑战火焰领主及其仆从。',bosses:moltenCoreBosses,atlas:moltenCoreMap},
  {id:'onyxias-lair',name:'奥妮克希亚的巢穴',zone:'尘泥沼泽',description:'进入黑龙公主的巢穴，迎战奥妮克希亚。',bosses:[onyxiaBoss],atlas:onyxiaMap},
 ].map(raid=>({...raid,minimumLevel:60,recommendedLevel:60,groupSize:40,playable:true,background:presentation.dungeons[raid.id]?.background,
  atlas:{...raid.atlas,bossLocations:Object.fromEntries(raid.bosses.map(b=>[b.id,b.id]))},
  bosses:raid.bosses.map(b=>({id:b.id,name:b.name,description:b.description,portrait:presentation.bosses[b.entry]||null,
   abilities:[],loot:(raidLoot[b.id]||[]).map(id=>({...itemView(id),id,source:'首领掉落',shared:false})).filter(item=>item.name)}))})),
 items:Object.fromEntries(Object.keys(items).map(Number).map(id=>[id,itemView(id)]).filter(([,item])=>item)),
 market:marketView(),
 enchants,
 bandages,
 potionOptions:Object.keys(potions).map(Number).map(id=>({id,name:nameOf('items',id),...potions[id],level:items[id].RequiredLevel})),
 creationOptions:{classes:classDefinitions,races:raceDefinitions},
};
const cached=Object.freeze({contentVersion:manifest.contentVersion,...catalog});
export const CONTENT_VERSION=cached.contentVersion;
export function clientContent(){return cached;}
