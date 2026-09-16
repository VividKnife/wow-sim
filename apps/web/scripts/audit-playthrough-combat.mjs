// Replay a frozen command journal and retain full diagnostic traces for one route cursor.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [directoryArg,cursorArg,outputArg]=process.argv.slice(2);
if(!directoryArg||!cursorArg||!outputArg)throw new Error('Usage: node audit-playthrough-combat.mjs PLAYTHROUGH CURSOR OUTPUT');
const directory=resolve(directoryArg),out=resolve(outputArg),cursor=Number(cursorArg);
if(existsSync(out))throw new Error('Choose a fresh diagnostic directory');mkdirSync(out,{recursive:true});
const {act,advance}=await import(pathToFileURL(resolve(directory,'runtime/lib/game/engine.js')));
let s=JSON.parse(readFileSync(resolve(directory,'initial-state.json'),'utf8')),start=null,events=[],sequence=s.logSequence,attempt=0;
for(const row of readFileSync(resolve(directory,'commands.jsonl'),'utf8').trim().split('\n').map(JSON.parse).slice(1)){
 const previous=s;
 if(row.type==='command')s=act(s,row.action,row.at);
 else{let result;do{result=advance(s,row.now,row.options);s=result.state;}while(!result.complete);}
 if(!previous.combat&&s.combat&&s.dungeon?.cursor===cursor){start=structuredClone(s);events=[];}
 if(start)events.push(...s.logs.filter(event=>event.id>sequence));sequence=s.logSequence;
 if(start&&previous.combat&&!s.combat){
  const path=resolve(out,`attempt-${++attempt}.json`);writeFileSync(path,JSON.stringify({start,end:s,events}));
  console.log(JSON.stringify({attempt,path,seconds:(s.clock-start.clock)/1000,won:s.hp>0,events:events.length}));start=null;events=[];
 }
}
if(!attempt)throw new Error('No completed encounter at this cursor');
