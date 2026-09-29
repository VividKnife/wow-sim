// Runs the production Worker entry points using node:worker_threads and real
// transferable MessagePorts. Includes both Workers and receiver CPU. No GPU.
import {Worker,MessageChannel} from 'node:worker_threads';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {serialize} from 'node:v8';
import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import {createMoltenCoreDemo,defaultRaidTactics} from '../packages/game-domain/src/molten-core-demo.ts';
import {beginMoltenCoreBattle} from '../packages/game-domain/src/rules/molten-core-battle.js';
import {combatRole} from '../packages/game-domain/src/rules/combat-roles.js';
import {CombatStreamReceiver,hydrateCombatFrame} from '../packages/sim-core/src/combat-stream.js';
import manifest from '../packages/game-data/manifest.json' with {type:'json'};
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const duration=Number(arg('duration','15000')),mode=arg('mode','both');
const scratch=resolve('.cache/combat-policy');mkdirSync(scratch,{recursive:true});
const banner="import {parentPort} from 'node:worker_threads';globalThis.self=globalThis;globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);parentPort.on('message',data=>globalThis.onmessage?.({data}));";
await build({entryPoints:['apps/web/lib/local-simulation-runtime.ts','apps/web/lib/combat-policy-runtime.ts'],outdir:scratch,bundle:true,format:'esm',platform:'node',banner:{js:banner},logLevel:'silent',outExtension:{'.js':'.mjs'}});
let initial;
const fixture=arg('fixture','');
if(fixture)initial=JSON.parse(readFileSync(fixture,'utf8'));
else{
 initial=createMoltenCoreDemo().state;const members=[initial,...initial.party];
 const extra=[members[1],...members.filter(c=>combatRole(c)==='healer').slice(0,3),...members.filter(c=>!['tank','healer'].includes(combatRole(c))).slice(0,11)];
 for(const [i,source]of extra.entries()){const actor=structuredClone(source===initial?{...initial,party:[]}:source);actor.id=`policy-bench-${i}`;actor.raidMainTank=false;if(actor.pet){actor.pet.id=actor.id+':pet';actor.pet.ownerId=actor.id;}initial.party.push(actor);}
 beginMoltenCoreBattle(initial,'lucifron',defaultRaidTactics);
}
// Keep the encounter alive for the entire sample. This is a synthetic capacity
// fixture, not encounter balance: increase enemy health without changing damage.
for(const enemy of initial.combat.enemies)enemy.hp=enemy.maxHp=enemy.maxHp*100;
if(initial.combat.pull){initial.combat.pull.startsAt=initial.clock;initial.combat.pull.engagedAt=initial.clock;}
const summary=xs=>{const a=[...xs].sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((n,x)=>n+x,0)/a.length,p95:a[Math.max(0,Math.ceil(a.length*.95)-1)],max:a.at(-1)};};
async function run(dual){
 const combat=new Worker(resolve(scratch,'local-simulation-runtime.mjs')),policy=dual?new Worker(resolve(scratch,'combat-policy-runtime.mjs')):null;
 const stream=new CombatStreamReceiver(),tick=[],latency=[],bytes=[],stateCloneBytes=[],consumer=[],lag=[];let active=0,samples=0,alive=40,policyMs=0,lastMetrics,policyErrors=0,policyTimeouts=0,lastPolicyError='',policyTransfers,frames=0,sequence=0,start=0,cpu;
 const pending=new Map();let interval;
 if(policy){const {port1,port2}=new MessageChannel();combat.postMessage({type:'policyPort',port:port1},[port1]);policy.postMessage({type:'connect',port:port2},[port2]);}
 const outcome=await new Promise((resolveRun,reject)=>{
  let timeout=setTimeout(()=>reject(new Error('Worker benchmark timed out')),duration+90000);
  for(const worker of [combat,policy].filter(Boolean))worker.on('error',reject);
  combat.on('message',data=>{
   try{
    if(data.type==='error')throw new Error(data.error);
    if(data.type==='ready'){
     start=performance.now();cpu=process.cpuUsage();
     interval=setInterval(()=>{const requestId=String(++sequence);pending.set(requestId,performance.now());combat.postMessage({type:'command',generation:'benchmark',requestId,command:{type:'combatCommand',encounterId:initial.combat.id,order:sequence%2?'focus':'stopCast',...(sequence%2?{targetId:initial.combat.enemies[0].id}:{memberId:initial.id})}});},750);
    }
    if(data.type==='commandResult'){latency.push(performance.now()-pending.get(data.requestId));pending.delete(data.requestId);if(data.error)throw new Error(data.error);}
    if(data.type==='frame'){
     const began=performance.now(),packet=data.packet;
     if(packet.buffer){bytes.push(packet.buffer.byteLength);stateCloneBytes.push(serialize({...packet,buffer:undefined}).byteLength);}
     const decoded=stream.apply(packet);if(decoded.status!=='applied')throw new Error('Frame baseline lost');hydrateCombatFrame(decoded.snapshot);consumer.push(performance.now()-began);frames++;
     combat.postMessage({type:'frameAck',generation:'benchmark',sequence:packet.sequence,buffer:packet.buffer},packet.buffer?[packet.buffer]:[]);
    }
    if(data.type==='diagnostics'){
     tick.push(data.tickMs);lag.push(data.behindMs);samples++;active+=Number(data.active);alive=Math.min(alive,data.alive);policyMs=data.policyCpuMs;lastMetrics=data.metrics;policyErrors=data.policyErrors;policyTimeouts=data.policyTimeouts;lastPolicyError=data.lastPolicyError;policyTransfers=data.policyTransfers;
     if(data.clock-initial.clock>=duration){clearTimeout(timeout);clearInterval(interval);const used=process.cpuUsage(cpu);resolveRun({mode:dual?'dual-worker':'single-worker',durationMs:duration,wallMs:performance.now()-start,processCpuMs:(used.user+used.system)/1000,activeSamples:active,samples,minAlive:alive,frames,tickMs:summary(tick),inputFeedbackMs:summary(latency),transferredNumericBytes:summary(bytes),structuredMetadataV8Bytes:summary(stateCloneBytes),receiverMs:summary(consumer),backlogMs:summary(lag),finalBacklogMs:lag.at(-1),last100BacklogMs:summary(lag.slice(-100)),policyTransfers,policyWorkerMeasuredMs:policyMs,metrics:lastMetrics,policyErrors,policyTimeouts,lastPolicyError});}
    }
   }catch(error){clearTimeout(timeout);clearInterval(interval);reject(error);}
  });
  combat.postMessage({type:'start',generation:'benchmark',profile:true,contentVersion:manifest.contentVersion,state:structuredClone(initial),serverNow:initial.wallAt,deadline:initial.wallAt+duration+5000});
 });
 clearInterval(interval);await combat.terminate();await policy?.terminate();return outcome;
}
const results=[];for(const dual of mode==='both'?[false,true]:[mode==='dual']){const result=await run(dual);results.push(result);console.log(JSON.stringify(result));}
writeFileSync(arg('output',resolve(scratch,'benchmark.json')),JSON.stringify({date:new Date().toISOString(),contentVersion:manifest.contentVersion,fixture:'40-person synthetic Lucifron; enemy HP x100; production Workers, no GPU; V8 metadata bytes are an encoding proxy, not browser structured-clone bytes',results},null,2)+'\n');
