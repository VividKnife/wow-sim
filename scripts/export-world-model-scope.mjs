import {writeFile} from 'node:fs/promises';
import {nodes,monsterIdsAt,creatures} from '../packages/game-domain/src/rules/catalog.js';
import {dungeonDefinitions} from '../packages/game-domain/src/rules/dungeon-registry.js';
const entries=new Set(Object.keys(nodes).flatMap(monsterIdsAt));
for(const entry of [7915,6575,7076,10120,7309,7077])entries.add(entry);
for(const d of Object.values(dungeonDefinitions))for(const e of d.reference.encounters)for(const id of e.creatureTemplateIds)entries.add(id);
const displays=[...new Set([...entries].map(id=>creatures[id]?.ModelId1).filter(Boolean))].sort((a,b)=>a-b);
await writeFile(new URL('../.cache/world-combat-displays.json',import.meta.url),JSON.stringify(displays));
console.log(`${entries.size} playable enemy templates, ${displays.length} distinct displays`);
