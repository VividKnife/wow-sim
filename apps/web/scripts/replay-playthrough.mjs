import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../lib/game/engine.js';

const directory=resolve(process.argv[2]||'../../.cache/playthrough');
writeFileSync(resolve(directory,'replay-verification.json'),JSON.stringify({equal:false,status:'verification started'}));
const raw=readFileSync(resolve(directory,'commands.jsonl'),'utf8');
const rows=raw.trim().split('\n').map(row=>JSON.parse(row));
const first=rows.shift();let state;
if(first.type==='load'){
 const initial=readFileSync(resolve(directory,'initial-state.json'),'utf8');
 assert.equal(createHash('sha256').update(initial).digest('hex'),first.sha256);
 state=JSON.parse(initial);
}else{assert.equal(first.type,'create');state=createGame(first.name,first.seed,first.now);}
for(const row of rows){
 if(row.type==='command'){assert.equal(row.at,state.wallAt);state=act(state,row.action,row.at);}
 else if(row.type==='advance'){let result;do{result=advance(state,row.now,row.options);state=result.state;}while(!result.complete);}
 else throw new Error('Unexpected journal operation: '+row.type);
}
assert.deepEqual(state,JSON.parse(readFileSync(resolve(directory,'final-state.json'),'utf8')));
const result={equal:true,operations:rows.length,level:state.level,kills:state.totals.kills,deaths:state.totals.deaths,completed:Object.keys(state.completed).length,sha256:createHash('sha256').update(raw).digest('hex')};
writeFileSync(resolve(directory,'replay-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
