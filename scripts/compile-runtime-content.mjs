import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import {packContent} from './content-source/pack.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const temporary=await fs.mkdtemp(path.join(tmpdir(),'wow-content-'));
try {
 const output=path.join(temporary,'source.mjs');
 await build({absWorkingDir:root,stdin:{contents:`export * as catalog from './scripts/content-source/catalog.mjs';
 export {dungeonDefinitions} from './scripts/content-source/dungeon-registry.mjs';
 export {dungeonJournal} from './scripts/content-source/dungeon-journal.mjs';
 export {itemSources} from './scripts/content-source/item-sources.mjs';`,resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent',
 plugins:[{name:'source-catalog',setup(build){build.onResolve({filter:/(?:catalog|dungeon-registry|dungeon-journal)\.js$/},args=>{
  const name=path.basename(args.path,'.js');return {path:path.join(root,'scripts/content-source',name+'.mjs')};
 })}}]});
 const source=await import(pathToFileURL(output));
 const c=source.catalog, data={};
 for(const [name,value]of Object.entries(c))if(typeof value!=='function'&&!['spawns','instanceSpawns','classQuestSources','provenance','startingItems','abilities'].includes(name))data[name]=value instanceof Set?[...value]:value;
 // All source tables use precisely the same ordered merge as the authored
 // catalog. Shared record identities are encoded once across indexes/tables.
 const tableNames=new Set();
 const files=await fs.readdir(path.join(root,'packages/game-data/data'));
 const locales={items:new Set(Object.keys(c.items)),spells:new Set(Object.keys(c.spells)),npcs:new Set(Object.keys(c.creatures)),quests:new Set(Object.keys(c.quests)),objects:new Set(Object.keys(c.objectTemplates)),talents:new Set(Object.keys(c.talents))};
 for(const file of files.filter(f=>f.endsWith('.json'))){const raw=JSON.parse(await fs.readFile(path.join(root,'packages/game-data/data',file),'utf8'));
  for(const key of Object.keys(raw.schemas||{}))tableNames.add(key);
  for(const [kind,ids]of Object.entries(locales))for(const id of Object.keys(raw[kind]||{}))ids.add(id);
 }
 data.tables=Object.fromEntries([...tableNames].filter(name=>!['creature','gameobject'].includes(name)).sort().map(name=>[name,c.table(name)]));
 data.text=Object.fromEntries(Object.entries(locales).map(([kind,ids])=>[kind,Object.fromEntries([...ids].map(id=>[id,{name:c.nameOf(kind,id),icon:c.icon(kind,id),localized:c.localize(kind,id)}]))]));
 data.monstersByNode=Object.fromEntries(Object.keys(c.nodes).map(id=>[id,c.monsterIdsAt(id)]));
 data.itemSourceIndex=Object.fromEntries(Object.keys(c.items).map(id=>[id,source.itemSources(id)]));
 data.dungeonEntrances=Object.fromEntries(Object.entries(source.dungeonDefinitions).map(([id,d])=>[id,{reference:{entrance:d.reference.entrance}}]));
 data.dungeonDefinitions=source.dungeonDefinitions;
 // Source SQL tables inside a dungeon reference are redundant with the merged
 // catalog. Runtime routes use encounters/entrance/scriptObjects, not SQL.
 for(const d of Object.values(data.dungeonDefinitions)){
  const {tables,schemas,tableData,sources,meta,localization,questXpByPlayerLevel,questLinks,npcPlacements,...reference}=d.reference;
  d.reference=reference;
 }
 data.dungeonJournal=source.dungeonJournal;
 const portraits=JSON.parse(await fs.readFile(path.join(root,'packages/game-data/data/npc-models-manifest.json'),'utf8'));
 const portraitPaths=new Map(portraits.assets.map(asset=>[asset.id,'/'+asset.path]));
 data.npcPortraits=Object.fromEntries(Object.entries(portraits.entries).map(([id,entry])=>[id,portraitPaths.get(entry.assetId)||null]));
 const raid=JSON.parse(await fs.readFile(path.join(root,'packages/game-data/data/molten-core-loot.json'),'utf8'));
 data.raidLootSource={bossSources:raid.bossSources,creatureLootIds:raid.creatureLootIds,tables:Object.fromEntries(Object.entries(raid.tables).filter(([key])=>key.endsWith('_loot_template')))};
 data.smiteObjects=JSON.parse(await fs.readFile(path.join(root,'packages/game-data/data/deadmines-reference.json'),'utf8')).scriptObjects;
 const escort=JSON.parse(await fs.readFile(path.join(root,'packages/game-data/data/escort-reference.json'),'utf8'));
 const hostile=new Set(['sentinel','moonbrook'].flatMap(c.monsterIdsAt)),nearby=new Map();
 for(const spawn of c.spawns){if(spawn.map!==0||!hostile.has(spawn.id))continue;let best=Infinity,index=0;
  escort.rows.forEach((p,i)=>{const d=Math.hypot(p.PositionX-spawn.position_x,p.PositionY-spawn.position_y);if(d<best){best=d;index=i;}});
  if(best>18)continue;const row=nearby.get(spawn.guid)||{guid:spawn.guid,index,entries:[]};if(!row.entries.includes(spawn.id))row.entries.push(spawn.id);nearby.set(spawn.guid,row);
 }
 data.escortNearby=[...nearby.values()];
 const packed=packContent(data);packed.nodes=packed.nodes.map(row=>JSON.stringify(row));
 const bytes=JSON.stringify(packed)+'\n';
 const versionHash=createHash('sha256').update(bytes);
 const versionInputs=['packages/game-data/mounts.js','scripts/compile-runtime-content.mjs','scripts/content-source/pack.mjs','packages/sim-core/src/packed-content.js',
  ...(await fs.readdir(path.join(root,'packages/game-domain/src/rules'))).filter(name=>name.endsWith('.js')).sort().map(name=>'packages/game-domain/src/rules/'+name)];
 for(const name of versionInputs)versionHash.update(name).update(await fs.readFile(path.join(root,name)));
 const versionFile=path.join(root,'packages/game-data/runtime/version.json');
 const versionBytes=JSON.stringify({version:versionHash.digest('hex')})+'\n';
 if(process.argv.includes('--check')){if(await fs.readFile(versionFile,'utf8')!==versionBytes)throw new Error('Runtime version is stale: npm run data:compile');}
 else await fs.writeFile(versionFile,versionBytes);
 const destination=path.join(root,'packages/game-data/runtime/catalog.json');
 if(process.argv.includes('--check')){if(await fs.readFile(destination,'utf8')!==bytes)throw new Error('Runtime content is stale: npm run data:compile');}
 else {await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);}
 console.log(`Runtime content ${process.argv.includes('--check')?'verified':'compiled'}: ${Buffer.byteLength(bytes)} bytes, ${packed.nodes.length} records, ${packed.schemas.length} schemas`);
} finally {await fs.rm(temporary,{recursive:true,force:true});}
