import reference from '../../../game-data/data/dungeon-journal.json' with {type:'json'};
import {itemDetails} from './item-details.js';
import {nameOf,items,icon,table,spells} from './catalog.js';
import {dungeonBossGuides,dungeonBossSkills} from './dungeon-boss-skills.js';
import {dungeonDefinitions} from './dungeon-registry.js';
import presentation from '../../../game-data/data/dungeon-presentation.json' with {type:'json'};
import {dungeonMap} from './dungeon-map.js';
import {creatureVisual} from '../../../game-data/creature-visuals.js';

// Raw paths remain in the reference bundle for auditing. The client receives
// only display data, once per content version rather than on each game tick.
const lootDungeons=new Map();
const lootBosses=new Map();
const bossAI=Object.groupBy(table('creature_ai_scripts'),row=>row.creature_id);
function bossGuide(entry){
 const guide=dungeonBossGuides[entry];
 const ids=[...new Set([...(guide?.spells||[]),...(bossAI[entry]||[]).flatMap(row=>[1,2,3].filter(n=>row[`action${n}_type`]===11).map(n=>row[`action${n}_param1`]))])];
 return {strategy:guide?.text||null,abilities:ids.filter(id=>spells[id]).map(id=>({id,name:nameOf('spells',id),icon:icon('spells',id),cooldown:dungeonBossSkills[entry]?.find(s=>s.spell===id)?.repeat||null}))};
}
for(const dungeon of reference.dungeons)for(const boss of dungeon.bosses)for(const item of boss.loot){
 if(!lootDungeons.has(item.id))lootDungeons.set(item.id,new Set());
 lootDungeons.get(item.id).add(dungeon.id);
 if(!lootBosses.has(item.id))lootBosses.set(item.id,new Set());
 lootBosses.get(item.id).add(boss.id);
}
export const dungeonJournal=reference.dungeons.map(d=>({...d,
 minimumLevel:dungeonDefinitions[d.id]?.minimumLevel??d.minimumLevel,
 background:presentation.dungeons[d.id]?.background,
 atlas:dungeonDefinitions[d.id]?{...dungeonMap(d.id),bossLocations:Object.fromEntries(dungeonDefinitions[d.id].reference.encounters.filter(e=>e.kind==='boss').flatMap(e=>e.creatureTemplateIds.map(entry=>[entry,e.id])))}:null,
 playable:Object.hasOwn(dungeonDefinitions,d.id),groupSize:d.id==='upper-blackrock-spire'?10:5,
 bosses:d.bosses.map(b=>({...b,...bossGuide(b.id),portrait:presentation.bosses[b.id]||creatureVisual({entry:b.id}).src,name:nameOf('npcs',b.id)===String(b.id)?b.name:nameOf('npcs',b.id),loot:b.loot.map(item=>{
  const paths=item.source?.paths||[],shared=lootBosses.get(item.id).size>=4||lootDungeons.get(item.id).size>=4||paths.length>0&&paths.every(path=>path.some(row=>row.mincountOrRef<=-60000));
  const damage=item.damage?.[0],local=items[item.id];
  return {...item,...itemDetails(item.id),name:local?nameOf('items',item.id):item.name,level:local?local.RequiredLevel:item.level,icon:icon('items',item.id)||item.icon,
   damage:damage?[damage.min,damage.max]:null,speed:item.speed*1000,shared,
   source:item.source?.table==='gameobject_loot_template'?'宝箱掉落':shared?'共享掉落':'首领掉落'};
 })}))
}));
