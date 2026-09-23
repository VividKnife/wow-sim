import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../packages/game-data/',import.meta.url);
const names=(await readdir(new URL('data/',root))).filter(name=>name.endsWith('.json')).sort();
const bundles={};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const name of names){
 const bytes=await readFile(new URL(`data/${name}`,root));
 const data=JSON.parse(bytes);
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(`${name}: expected content object`);
 const tables=data.tableData?Object.fromEntries(Object.entries(data.tableData).map(([name,rows])=>[name,JSON.parse(rows)])):data.tables;
 if(data.schemas&&tables)for(const [table,rows] of Object.entries(tables)){
  const schema=data.schemas[table];if(!schema)continue;
  for(const row of rows)if(Array.isArray(row)&&row.length!==schema.length)throw new Error(`${name}/${table}: packed row width does not match schema`);
 }
 bundles[name]={sha256:digest(bytes),bytes:bytes.length};
}
// Some current encounter, travel, and profession definitions remain registered in
// code. Pin those rules too: a running activity must never silently use a newer
// definition merely because its JSON input happened not to change.
const rules={};
const sources=['world-content.js','world-endgame.js','world-quest-content.js','../game-domain/src/content.ts','../game-domain/src/molten-core-roster.ts','../game-domain/src/raid-loadouts.ts'];
for(const directory of ['../game-domain/src/rules/','../sim-core/src/']){
 for(const name of (await readdir(new URL(directory,root))).filter(name=>/\.(?:js|ts)$/.test(name)).sort())sources.push(directory+name);
}
for(const source of sources.sort()){
 const bytes=await readFile(new URL(source,root));rules[source]={sha256:digest(bytes),bytes:bytes.length};
}
const contentVersion=digest(JSON.stringify({bundles,rules}));
const output=JSON.stringify({formatVersion:1,contentVersion,bundles,rules},null,2)+'\n';
const destination=new URL('manifest.json',root);
if(process.argv.includes('--check')){
 if(await readFile(destination,'utf8')!==output)throw new Error('Content changed: run npm run data:compile before starting the server/worker.');
 console.log(`Content manifest verified: ${names.length} bundles, ${contentVersion}`);
}else{await writeFile(destination,output);console.log(`Compiled ${names.length} content bundles: ${contentVersion}`);}
