import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dataRoot=new URL('../apps/web/data/',import.meta.url);
const localization=JSON.parse(await readFile(new URL('localization.json',dataRoot),'utf8'));
const icons=JSON.parse(await readFile(new URL('icon-map.json',dataRoot),'utf8'));
for(const [id,nameEn] of [[845,'Cleave'],[1243,'Power Word: Fortitude'],[1244,'Power Word: Fortitude']]){
 const sourceURL=`https://nether.wowhead.com/classic/tooltip/spell/${id}?locale=4`;
 const response=await fetch(sourceURL);if(!response.ok)throw new Error(`${response.status}: ${sourceURL}`);
 const bytes=Buffer.from(await response.arrayBuffer()),body=JSON.parse(bytes.toString('utf8'));
 if(!body.name||!/[\u3400-\u9fff]/.test(body.name)||!body.icon)throw new Error(`Missing Chinese translation for ${id}`);
 const path=`assets/${body.icon}.png`;
 // These originals were already imported for NPC/other rank coverage.
 await access(new URL('../apps/web/public/icons/'+path,import.meta.url));
 icons.spells[id]=path;
 localization.spells[id]={type:'spell',id,scopes:['companion-strategies-through-20'],nameEn,status:'ok',nameZhCN:body.name,sourceURL,responseSha256:createHash('sha256').update(bytes).digest('hex'),fetchedAt:new Date().toISOString(),icon:body.icon,nameLanguageStatus:'contains-chinese'};
}
await writeFile(new URL('localization.json',dataRoot),JSON.stringify(localization,null,2)+'\n');
await writeFile(new URL('icon-map.json',dataRoot),JSON.stringify(icons,null,2)+'\n');
console.log('Verified and imported companion strategy spell names and existing original icons.');
