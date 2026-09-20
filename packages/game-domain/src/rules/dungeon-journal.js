import reference from '../../../game-data/data/dungeon-journal.json' with {type:'json'};
import {nameOf,items,icon} from './catalog.js';
import {dungeonDefinitions} from './dungeon-registry.js';

// Raw paths remain in the reference bundle for auditing. The client receives
// only display data, once per content version rather than on each game tick.
const lootDungeons=new Map();
for(const dungeon of reference.dungeons)for(const boss of dungeon.bosses)for(const item of boss.loot){
 if(!lootDungeons.has(item.id))lootDungeons.set(item.id,new Set());
 lootDungeons.get(item.id).add(dungeon.id);
}
export const dungeonJournal=reference.dungeons.map(d=>({...d,
 playable:Object.hasOwn(dungeonDefinitions,d.id),groupSize:d.id==='upper-blackrock-spire'?10:5,
 bosses:d.bosses.map(b=>({...b,loot:b.loot.map(item=>{
  const paths=item.source?.paths||[],shared=lootDungeons.get(item.id).size>=4||paths.length>0&&paths.every(path=>path.some(row=>row.mincountOrRef<=-60000));
  const damage=item.damage?.[0],local=items[item.id];
  return {...item,name:local?nameOf('items',item.id):item.name,level:local?local.RequiredLevel:item.level,icon:icon('items',item.id)||item.icon,
   damage:damage?[damage.min,damage.max]:null,speed:item.speed*1000,shared,
   source:item.source?.table==='gameobject_loot_template'?'宝箱掉落':shared?'共享掉落':'首领掉落'};
 })}))
}));
