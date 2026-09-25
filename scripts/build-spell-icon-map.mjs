// Resolve effect/trigger spell icons from the pinned Classic DBC, not just trainer abilities.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,basename} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const source='docs/research/import/item-profession-assets/sources/SpellIcon.dbc';
const raw=await readFile(resolve(root,source));
if(raw.toString('ascii',0,4)!=='WDBC')throw new Error('Invalid SpellIcon DBC');
const count=raw.readUInt32LE(4),size=raw.readUInt32LE(12),strings=20+count*size;
const files=(await readdir(resolve(root,'apps/web/public/icons'),{recursive:true})).filter(p=>/\.(png|jpg)$/.test(p)).sort();
const assets=new Map();
for(const path of files){const name=basename(path).replace(/\.(png|jpg)$/,'').toLowerCase();if(!assets.has(name))assets.set(name,path);}
const icons={};
for(let row=0;row<count;row++){
 const offset=20+row*size,id=raw.readUInt32LE(offset),start=strings+raw.readUInt32LE(offset+4);
 const name=raw.toString('utf8',start,raw.indexOf(0,start)).split(/[/\\]/).at(-1).toLowerCase().replace(/\.(tga|blp)$/,'');
 if(assets.has(name))icons[id]=assets.get(name);
}
const output=JSON.stringify({source,sha256:createHash('sha256').update(raw).digest('hex'),icons},null,2)+'\n';
const target=resolve(root,'packages/game-data/data/spell-icon-map.json');
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==output)throw new Error('Spell icon map is stale');}
else await writeFile(target,output);
console.log(`${relative(root,target)}: ${Object.keys(icons).length} icon identities`);
