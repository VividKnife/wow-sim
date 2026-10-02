import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Source archives and runtime Docker images do not have a Git checkout.
if(existsSync(new URL('../.git',import.meta.url))){
 let current='';
 try{current=execFileSync('git',['config','--get','core.hooksPath'],{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();}catch(error){if(error.status!==1)throw error;}
 if(current&&current!=='.githooks')throw new Error(`Existing core.hooksPath=${current}; integrate the game-version hook before replacing it.`);
 execFileSync('git',['config','--local','core.hooksPath','.githooks'],{cwd:root,stdio:'pipe'});
 console.log('Git hooks installed: game version updates on commit and CI validation runs before push.');
}
