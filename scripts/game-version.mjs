import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function gameVersion(at=new Date()){
 if(!Number.isFinite(at.getTime()))throw new Error('Invalid game version date');
 const updatedAt=new Date(Math.floor(at.getTime()/60000)*60000).toISOString();
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(updatedAt)).map(p=>[p.type,p.value]));
 return {version:`${parts.year}.${parts.month}.${parts.day}-${parts.hour}${parts.minute}`,updatedAt,timeZone:'Asia/Shanghai'};
}

export function stampGameVersion(root=process.cwd(),at=new Date()){
 const version=gameVersion(at);
 writeFileSync(resolve(root,'game-version.json'),JSON.stringify(version,null,2)+'\n');
 // Stage only this generated file, including Git's temporary index for --only.
 execFileSync('git',['add','--','game-version.json'],{cwd:root,stdio:'pipe'});
 return version;
}

export function syncGameVersionIndex(root=process.cwd()){
 // `commit --only` uses a temporary index for pre-commit, then restores the
 // original index. post-commit receives the final index: synchronize only the
 // generated version if its working content still matches the new commit.
 const committed=execFileSync('git',['show','HEAD:game-version.json'],{cwd:root,encoding:'utf8',stdio:'pipe'});
 if(readFileSync(resolve(root,'game-version.json'),'utf8')!==committed)return;
 execFileSync('git',['add','--','game-version.json'],{cwd:root,stdio:'pipe'});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
 if(process.argv[2]==='--sync-index')syncGameVersionIndex(root);
 else console.log(`Game version: ${stampGameVersion(root).version} (Asia/Shanghai)`);
}
