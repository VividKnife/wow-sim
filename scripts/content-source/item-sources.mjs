import {weaponItemSources} from '../../packages/game-data/epic-weapons.js';
import * as catalog from './catalog.mjs';
const {creatures,creatureLoot,referenceLoot,creatureLocations,objectTemplates,objectLoot,objectLocations,table,quests,questLinks,endpointNodes,nodes,monsterIdsAt}=catalog;
import {marketIds} from '../../packages/game-domain/src/rules/market.js';
import {recipes} from '../../packages/game-domain/src/rules/profession-data.js';
import {questItemActions,questFishingSources} from '../../packages/game-data/world-quest-content.js';
const sourceCache=new Map();
function addSource(item,locations){if(!item)return;const set=sourceCache.get(item)||new Set();for(const location of locations)if(location)set.add(location);sourceCache.set(item,set);}
function lootItems(rows,seen=new Set()){
 const result=new Set();for(const row of rows||[]){if(row.mincountOrRef>0)result.add(row.item);else if(row.mincountOrRef<0&&!seen.has(-row.mincountOrRef)){const next=new Set(seen);next.add(-row.mincountOrRef);for(const id of lootItems(referenceLoot[-row.mincountOrRef],next))result.add(id);}}return result;
}
for(const c of Object.values(creatures))for(const id of lootItems(creatureLoot[c.LootId]))addSource(id,creatureLocations[c.Entry]||[]);
for(const o of Object.values(objectTemplates))if([3,25].includes(o.type))for(const id of lootItems(objectLoot[o.data1]))addSource(id,objectLocations[o.entry]||[]);
for(const r of table('npc_vendor'))addSource(r.item,creatureLocations[r.entry]||[]);
for(const q of Object.values(quests))for(const prefix of ['RewItemId','RewChoiceItemId'])for(let n=1;n<=6;n++)addSource(q[prefix+n],(questLinks[q.entry]?.ends||[]).flatMap(endpointNodes));
const supplyLocations=Object.values(nodes).filter(n=>n.kind==='city').map(n=>n.id);
for(const id of new Set([...marketIds,...recipes.map(r=>r.item)]))addSource(id,supplyLocations);
for(const [id,action]of Object.entries({...questItemActions,...questFishingSources}))addSource(+id,action.locations);
for(const [id,locations]of Object.entries(weaponItemSources))addSource(+id,locations);
addSource(6265,Object.keys(nodes).filter(n=>monsterIdsAt(n).length)); // Drain Soul.
addSource(12731,['upper-blackrock-spire']); // The Beast's rare skinning reward.
export function itemSources(id){if(+id===7206)return ['mirror'];if(+id===7292)return ['bluerecluse'];return [...(sourceCache.get(+id)||[])];}
