import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createContext,runInContext} from 'node:vm';
import {createGame,act,advanceOwned,view} from '../../../packages/game-domain/src/rules/engine.js';
import {projectLocalCheckpoint} from '../../../packages/game-domain/src/rules/local-checkpoint.js';
import {createMoltenCoreDemo,startMoltenCoreBoss} from '../../../packages/game-domain/src/molten-core-demo.ts';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import manifest from '../../../packages/game-data/manifest.json' with {type:'json'};
import version from '../../../packages/game-data/runtime/version.json' with {type:'json'};

const root=fileURLToPath(new URL('../../../',import.meta.url));
let workerBundle;
const buildWorker=()=>workerBundle??=build({absWorkingDir:root,entryPoints:['apps/web/lib/local-simulation.worker.ts'],write:false,bundle:true,format:'iife',platform:'browser',logLevel:'silent',metafile:true,plugins:[{name:'browser-content',setup(build){
 build.onResolve({filter:/runtime-content\.js$/},()=>({path:root+'packages/game-domain/src/rules/runtime-content.browser.js'}));
}}]});
async function waitFor(test,label){for(let i=0;i<6000;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(label);}

for(const scenario of ['solo','raid'])test(`real browser engine: ${scenario} loads shards and preserves the complete checkpoint`,async()=>{
 const bundle=await buildWorker();
 for(const name of Object.keys(bundle.metafile.inputs))assert.ok(!/game-data\/(?:runtime\/catalog|data\/(?:world-reference|classes-reference|classic-reference|dungeon-journal))\.json$/.test(name),name);
 const messages=[],requests=[];
 const scope=createContext({performance,structuredClone,TextEncoder,TextDecoder,crypto,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},postMessage:message=>messages.push(structuredClone(message)),fetch:async url=>{
  const match=url.match(/^\/api\/simulation-content\/([a-f0-9]{64})\/(boot|class-\d+|\d+)$/);assert.ok(match,url);assert.equal(match[1],version.version);
  const body=await readFile(root+`packages/game-data/runtime/browser/${match[2]}.json.gz`);requests.push({pack:match[2],bytes:body.length});
  return {ok:true,json:async()=>JSON.parse(gunzipSync(body))};
 }});
 scope.self=scope;runInContext('Object.groupBy = undefined',scope);
 runInContext(bundle.outputFiles[0].text,scope,{timeout:120000});
 const state=scenario==='solo'?act(createGame('手机分片验证',93,0),{type:'hunt',id:299},0):startMoltenCoreBoss(createMoltenCoreDemo(93),'lucifron').state;
 scope.onmessage({data:{type:'visibility',visible:true,watching:false}});
 scope.onmessage({data:{type:'start',state:structuredClone(state),contentVersion:manifest.contentVersion,generation:'current',serverNow:1000,deadline:1000}});
 await waitFor(()=>messages.some(m=>m.type==='full'||m.type==='error'),'worker never produced a snapshot');
 assert.deepEqual(messages.filter(m=>m.type==='error'),[]);
 assert.ok(requests.some(r=>r.pack===`class-${state.classId}`),'prefetch the player class');
 scope.onmessage({data:{type:'checkpoint',generation:'current',requestId:'capture'}});
 const snapshot=messages.find(m=>m.type==='checkpoint').state;
 const expected=advanceOwned(structuredClone(state),1000).state;
 assert.deepEqual(snapshot,projectLocalCheckpoint(expected));
 assert.deepEqual(messages.find(m=>m.type==='full').snapshot,structuredClone(projectClientSnapshot(expected,view(expected))));
 assert.equal(requests.filter(r=>r.pack==='boot').length,1);
 assert.ok(requests.length<Math.ceil(version.totalNodes/version.shardSize),'a solo start must not fetch every shard');
 assert.equal(new Set(requests.map(r=>r.pack)).size,requests.length,'no cache eviction/retry download loop');
 console.log(`Cold ${scenario} worker:`,JSON.stringify({jsBytes:bundle.outputFiles[0].contents.length,requests:requests.length,gzipBytes:requests.reduce((n,r)=>n+r.bytes,0)}));
});

async function faultHarness({reject=false}={}){
 const bundle=await buildWorker(),messages=[];
 let release,requested=false;
 const gate=new Promise(resolve=>{release=resolve;});
 const scope=createContext({performance,structuredClone,TextEncoder,TextDecoder,crypto,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},postMessage:message=>messages.push(structuredClone(message)),fetch:async url=>{
  const pack=url.split('/').at(-1);
  // Deliberately miss the speculative profile: correctness cannot depend on it.
  if(pack.startsWith('class-'))return {ok:true,json:async()=>({version:version.version,nodes:{}})};
  if(/^\d+$/.test(pack)&&!requested){requested=true;await gate;if(reject)throw new Error('test network failure');}
  const body=await readFile(root+`packages/game-data/runtime/browser/${pack}.json.gz`);
  return {ok:true,json:async()=>JSON.parse(gunzipSync(body))};
 }});
 scope.self=scope;runInContext(bundle.outputFiles[0].text,scope,{timeout:120000});
 scope.onmessage({data:{type:'visibility',visible:true,watching:false}});
 return {messages,scope,release,requested:()=>requested,start:(state,generation='first')=>scope.onmessage({data:{type:'start',state:structuredClone(state),generation,contentVersion:manifest.contentVersion,serverNow:1000,deadline:1000}})};
}

test('a failed cold fetch retains the checkpoint and never publishes partial simulation',async()=>{
 const h=await faultHarness({reject:true}),state=act(createGame('断网',94,0),{type:'hunt',id:299},0);h.start(state);
 await waitFor(h.requested,'no cold dependency requested');
 h.scope.onmessage({data:{type:'checkpoint',generation:'first',requestId:'before'}});
 assert.deepEqual(h.messages.find(m=>m.requestId==='before').state,projectLocalCheckpoint(state));
 assert.equal(h.messages.filter(m=>m.type==='full').length,0);
 h.release();await waitFor(()=>h.messages.some(m=>m.type==='error'),'missing download failure');
 h.scope.onmessage({data:{type:'checkpoint',generation:'first',requestId:'after'}});
 assert.deepEqual(h.messages.find(m=>m.requestId==='after').state,projectLocalCheckpoint(state));
 assert.equal(h.messages.filter(m=>m.type==='full').length,0);
});

test('switching saves during a cold fetch advances only the new generation',async()=>{
 const h=await faultHarness(),first=act(createGame('旧角色',95,0),{type:'hunt',id:299},0);h.start(first);
 await waitFor(h.requested,'no cold dependency requested');
 const next=act(createGame('新角色',96,0),{type:'hunt',id:299},0);h.start(next,'second');h.release();
 await waitFor(()=>h.messages.some(m=>m.type==='full'||m.type==='error'),'no replacement snapshot');
 assert.deepEqual(h.messages.filter(m=>m.type==='error'),[]);
 assert.ok(h.messages.filter(m=>m.type==='full').every(m=>m.generation==='second'));
 h.scope.onmessage({data:{type:'checkpoint',generation:'second',requestId:'capture'}});
 assert.deepEqual(h.messages.find(m=>m.requestId==='capture').state,projectLocalCheckpoint(advanceOwned(structuredClone(next),1000).state));
});

test('boot failure reports to a start that arrives after the failed download',async()=>{
 const bundle=await buildWorker(),messages=[];
 const scope=createContext({performance,structuredClone,TextEncoder,TextDecoder,crypto,AbortSignal,setTimeout,clearTimeout,postMessage:message=>messages.push(structuredClone(message)),fetch:async()=>{throw new Error('boot offline');}});
 scope.self=scope;runInContext(bundle.outputFiles[0].text,scope,{timeout:120000});
 await new Promise(resolve=>setTimeout(resolve,10));
 scope.onmessage({data:{type:'start',state:createGame('离线',97,0),generation:'late'}});
 await waitFor(()=>messages.some(m=>m.type==='error'),'late start was left hanging');
 assert.equal(messages[0].generation,'late');assert.equal(messages[0].code,'LOCAL_CONTENT');
});

test('class download starts before boot finishes and safely joins boot initialization',async()=>{
 const bundle=await buildWorker(),messages=[],requests=[];
 let release;const bootGate=new Promise(resolve=>{release=resolve;});
 const scope=createContext({performance,structuredClone,TextEncoder,TextDecoder,crypto,AbortSignal,setTimeout:()=>1,clearTimeout:()=>{},postMessage:message=>messages.push(structuredClone(message)),fetch:async url=>{
  const pack=url.split('/').at(-1);requests.push(pack);
  if(pack==='boot')await bootGate;
  const body=await readFile(root+`packages/game-data/runtime/browser/${pack}.json.gz`);
  return {ok:true,json:async()=>JSON.parse(gunzipSync(body))};
 }});
 scope.self=scope;runInContext(bundle.outputFiles[0].text,scope,{timeout:120000});
 const state=createGame('并行下载',98,0);
 scope.onmessage({data:{type:'start',state:structuredClone(state),contentVersion:manifest.contentVersion,generation:'parallel',serverNow:0,deadline:0}});
 try{await waitFor(()=>requests.includes(`class-${state.classId}`),'class download waited for boot');}
 finally{release();}
 await waitFor(()=>messages.some(m=>m.type==='full'||m.type==='error'),'parallel boot never finished');
 assert.deepEqual(messages.filter(m=>m.type==='error'),[]);
 assert.equal(requests.filter(name=>name==='boot').length,1);
 assert.deepEqual(messages.find(m=>m.type==='full').snapshot,structuredClone(projectClientSnapshot(state,view(state))));
});
