import {mkdir,writeFile} from 'node:fs/promises';
import {worldNodes,worldDungeons} from '../packages/game-data/world-content.js';
import {nodes} from '../packages/game-domain/src/rules/catalog.js';
import {questItemActions} from '../packages/game-data/world-quest-content.js';
await mkdir(new URL('../.cache/',import.meta.url),{recursive:true});
await writeFile(new URL('../.cache/world-geography.json',import.meta.url),JSON.stringify({nodes:{...nodes,...Object.fromEntries(worldNodes.map(n=>[n.id,n]))},dungeons:worldDungeons,questItemActions}));
