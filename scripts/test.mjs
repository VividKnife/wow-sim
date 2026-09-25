// Browser harnesses and workers are applications, not Node test modules.
import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
async function collect(directory){
 const entries=await readdir(directory,{withFileTypes:true});
 return (await Promise.all(entries.filter(e=>!['node_modules','dist'].includes(e.name)&&!e.name.startsWith('.next')).map(e=>e.isDirectory()?collect(`${directory}/${e.name}`):/\.test\.(?:mjs|js|ts)$/.test(e.name)?[`${directory}/${e.name}`]:[]))).flat();
}
const files=(await Promise.all(['apps','packages'].map(collect))).flat().sort();
const child=spawn(process.execPath,['--test',...process.argv.slice(2),...files],{stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
