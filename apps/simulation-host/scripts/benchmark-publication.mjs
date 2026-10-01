import {execFileSync} from 'node:child_process';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Optional baseline substitutes only the five optimized modules, retaining the
// same current content, scenarios and unrelated worktree changes in both runs.
const baseline=process.argv[2]||null,root=new URL('../../../',import.meta.url);
if(baseline){
 const paths=['character.js','talent-effects.js','server-response.js','combat-strategy.js','pvp-profiles.js'].map(name=>'packages/game-domain/src/rules/'+name);
 const sources=new Map(paths.map(path=>[new URL(path,root).href,execFileSync('git',['show',`${baseline}:${path}`],{cwd:fileURLToPath(root),encoding:'utf8'})]));
 registerHooks({load(url,context,next){return sources.has(url)?{format:'module',shortCircuit:true,source:sources.get(url)}:next(url,context);}});
}
const {ResidentInstance}=await import('../src/instance.ts');
const {localScenarios}=await import('../../../packages/simulation-tests/support/baseline.ts');
const {createDeltaEvent}=await import('../../../packages/contracts/src/events.ts');
const state=localScenarios().raid,room=new ResidentInstance({instanceId:'publication-benchmark',ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'preview',generation:1,canPause:true}]});
let previous={type:'snapshot',sequence:1,...room.presentation('preview',state.id)};
const start=room.wallAt,samples={advance:[],full:[],combat:[],diff:[],encode:[]};
for(let i=1;i<=200;i++){
 const collect=(key,at)=>{if(i>10)samples[key].push(performance.now()-at);};
 let at=performance.now();room.advance(start+i*100,10000);collect('advance',at);
 const scope=i%10?'combat':'full';at=performance.now();const response=room.presentation('preview',state.id,scope);collect(scope,at);
 let next={type:'snapshot',sequence:response.execution.streamSequence,...response};
 if(scope==='combat')next={...next,snapshot:{...next.snapshot,view:{...previous.snapshot.view,...next.snapshot.view}}};
 at=performance.now();const delta=createDeltaEvent(previous,next);collect('diff',at);
 at=performance.now();JSON.stringify(delta);collect('encode',at);previous=next;
}
const result=Object.fromEntries(Object.entries(samples).map(([key,values])=>{values.sort((a,b)=>a-b);return[key,{count:values.length,total:values.reduce((a,b)=>a+b,0),p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)}];}));
console.log(JSON.stringify({node:process.version,baseline,scenario:'40-person raid / 20 simulated seconds / discard first 1 second',unit:'milliseconds',timings:result,finalProjectionHash:createHash('sha256').update(JSON.stringify(previous)).digest('hex')},null,2));
