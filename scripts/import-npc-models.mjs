// Extend the archived portrait collection with local template display IDs.
// Images retain their original Classic CDN bytes; no runtime network dependency.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {creatures,creatureLocations} from '../packages/game-domain/src/rules/catalog.js';
import portraits from '../packages/game-data/data/creature-portraits-manifest.json' with {type:'json'};
const root=new URL('../',import.meta.url);
const assets=new Map(portraits.assets.map(a=>[a.displayId,a]));
const entries={...portraits.entries};
const ids=[...new Set([...Object.keys(creatureLocations).map(Number),467,68,197,54,295,332,8670,914,1205,4981,6740])];
const pending=new Map();
for(const entry of ids){
 if(entries[entry])continue;
 const row=creatures[entry];
 // Location links can include templates outside the imported catalogue.
 if(!row)continue;
 const displayId=row.ModelId1;
 if(!displayId)throw new Error(`Missing model: ${entry}`);
 entries[entry]={entry,assetId:`classic-display-${displayId}`,displayId,creatureType:row.CreatureType,family:row.Family,evidenceLevel:'local-creature-template-model-id'};
 if(!assets.has(displayId))pending.set(displayId,null);
}
await mkdir(new URL('apps/web/public/creatures/portraits/',root),{recursive:true});
const queue=[...pending.keys()],failures=[];
await Promise.all(Array.from({length:8},async()=>{
 while(queue.length){
  const displayId=queue.shift(),path=`creatures/portraits/classic-display-${displayId}.webp`;
  const url=`https://wow.zamimg.com/modelviewer/classic/webthumbs/npc/${displayId&255}/${displayId}.webp`;
  try{
   let bytes;try{bytes=await readFile(new URL('apps/web/public/'+path,root));}catch{
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
   }
   if(bytes.toString('ascii',8,12)!=='WEBP')throw new Error('Not WebP');
   await writeFile(new URL('apps/web/public/'+path,root),bytes);
   assets.set(displayId,{id:`classic-display-${displayId}`,displayId,kind:'npc-model-render',path,url,sha256:createHash('sha256').update(bytes).digest('hex')});
  }catch(error){failures.push({displayId,error:error.message});}
 }
}));
if(failures.length){console.error(failures);process.exitCode=1;}else{
 const result={schemaVersion:1,source:'Archived Classic portraits and local creature_template.ModelId1; Classic CDN static renders',copyright:'Blizzard Entertainment artwork; third-party Wowhead hosting. Code license does not relicense artwork.',assets:[...assets.values()].sort((a,b)=>a.displayId-b.displayId),entries};
 await writeFile(new URL('packages/game-data/data/npc-models-manifest.json',root),JSON.stringify(result,null,2)+'\n');
 console.log(`Registered ${Object.keys(entries).length} creatures, ${assets.size} model textures.`);
}
