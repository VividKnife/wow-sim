// Freeze the engine and public reference data so concurrent edits cannot invalidate a run.
import {cpSync,mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const web=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.argv[4]||`../../.cache/playthrough-${Date.now()}`);
if(existsSync(out))throw new Error('Choose a new output directory to preserve previous playthrough evidence.');
const runtime=resolve(out,'runtime');mkdirSync(runtime,{recursive:true});
const root=resolve(web,'../..');
for(const part of ['game-domain/src','game-data','sim-core/src','contracts/src'])cpSync(resolve(root,'packages',part),resolve(runtime,'packages',part),{recursive:true});
mkdirSync(resolve(runtime,'apps/web/scripts'),{recursive:true});
for(const name of ['playthrough.mjs','verify-class-journey.mjs','replay-playthrough.mjs'])cpSync(resolve(web,'scripts',name),resolve(runtime,'apps/web/scripts',name));
writeFileSync(resolve(runtime,'package.json'),JSON.stringify({private:true,type:'module'}));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]);}
const hashes=Object.fromEntries(files(runtime).sort().map(path=>[relative(runtime,path).replaceAll('\\','/'),createHash('sha256').update(readFileSync(path)).digest('hex')]));
writeFileSync(resolve(out,'source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:hashes},null,2));
for(const [script,args] of [[process.argv[5]?'verify-class-journey.mjs':'playthrough.mjs',[process.argv[2]||'20',process.argv[3]||'283',out,...(process.argv[5]?[process.argv[5]]:[])]],['replay-playthrough.mjs',[out]]]){
 const result=spawnSync(process.execPath,[resolve(runtime,'apps/web/scripts',script),...args],{stdio:'inherit'});
 if(result.status!==0){process.exitCode=result.status||1;break;}
}
