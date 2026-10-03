import {table,items,creatureLocations,nameOf,icon} from './catalog.js';
import {LEVEL_CAP} from './character.js';
import {classSupplyShop} from './class-acquisition.js';
export function shop(s){const vendors=table('npc_vendor').filter(r=>(creatureLocations[r.entry]||[]).includes(s.location));const unique=new Map();for(const r of vendors){const item=items[r.item];if(item&&item.RequiredLevel<=LEVEL_CAP&&!unique.has(item.entry))unique.set(item.entry,{id:item.entry,name:nameOf('items',item.entry),price:item.BuyPrice,count:item.BuyCount||1,icon:icon('items',item.entry),quality:item.Quality});}for(const row of classSupplyShop(s))if(!unique.has(row.id))unique.set(row.id,row);return[...unique.values()];}
