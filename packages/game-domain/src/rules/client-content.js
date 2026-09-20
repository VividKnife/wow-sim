import {dungeonJournal} from './dungeon-journal.js';
import {items,nameOf,icon,classDefinitions,raceDefinitions} from './catalog.js';
import {marketView} from './inventory.js';
import {enchants,bandages,potions} from './profession-data.js';
import manifest from '../../../game-data/manifest.json' with {type:'json'};

export function itemView(id){
 const i=items[id];
 return i?{id,appearanceItemId:i.appearanceItemId||id,name:nameOf('items',id),icon:icon('items',id),quality:i.Quality,level:i.RequiredLevel,maxDurability:i.MaxDurability,armor:i.armor,class:i.class,subclass:i.subclass,description:enchants[i.enchant]?.description||null,enchant:i.enchant||null,slot:i.InventoryType,bagSlots:i.class===1?i.ContainerSlots:0,sell:i.SellPrice,damage:i.dmg_min1?[i.dmg_min1,i.dmg_max1]:null,speed:i.delay,stats:[1,2,3,4,5,6,7,8,9,10].filter(n=>i['stat_value'+n]).map(n=>({type:i['stat_type'+n],value:i['stat_value'+n]}))}:null;
}

const catalog={
 dungeonJournal,
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
