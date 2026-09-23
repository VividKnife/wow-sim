import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

let source;
before(async()=>{
 const fixtures={
  'engine.js':'export const advance=(...args)=>globalThis.advanceFixture(...args);export const view=()=>({});',
  'arena.js':'export const arenaView=()=>({});',
  'battleground.js':'export const battlegroundView=()=>({});',
  'battle-presentation.js':'export const battlePresentation=()=>({});',
  'client-snapshot.ts':'export const projectClientSnapshot=(player,view)=>({player,view});export const projectCombatPlayback=()=>({view:{}});',
  'manifest.json':'export default {contentVersion:"fixture"};',
  'local-item-identities.js':'export const reconcileItemIdentities=state=>state;',
 };
 const bundle=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['lib/local-simulation.worker.ts'],write:false,bundle:true,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'worker-fixtures',setup(build){
  build.onResolve({filter:/\.(js|ts|json)$/},args=>{const name=args.path.split('/').at(-1);if(fixtures[name])return {path:name,namespace:'fixture'};});
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
 }}]});source=bundle.outputFiles[0].text;
});

function runtime({now=0,wallAt=0,serverNow=100000,deadline=200000,visible=true}={}){
 const messages=[],timers=new Map(),steps=[];let id=0,time=now;
 const sandbox={performance:{now:()=>time},structuredClone,postMessage:message=>messages.push(structuredClone(message)),setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),advanceFixture:(state,target,{maxTicks})=>{
  const next=Math.min(target,state.wallAt+maxTicks*100);steps.push({target,maxTicks,wallAt:next});
  return {state:{...state,clock:next,wallAt:next},complete:next===target};
 }};
 runInNewContext(source,sandbox);
 const send=data=>sandbox.onmessage({data});
 const initial={clock:wallAt,wallAt,activity:{type:'battlegroundCombat'}};
 send({type:'visibility',visible,watching:true});send({type:'start',contentVersion:'fixture',generation:'session',state:initial,serverNow,deadline});
 const run=()=>{const first=timers.entries().next().value;if(!first)return false;timers.delete(first[0]);first[1]();return true;};
 return {messages,steps,send,run,clock:value=>{time=value;},pending:()=>timers.size};
}

test('manual checkpoint catches up in bounded slices to a fixed instant, then pauses',()=>{
 const r=runtime();r.send({type:'checkpoint',generation:'session',pause:true,requestId:'command'});
 assert.equal(r.messages.filter(m=>m.type==='checkpoint').length,0);
 r.clock(60000);for(let i=0;i<100&&r.run();i++);
 const saved=r.messages.filter(m=>m.type==='checkpoint');assert.equal(saved.length,1);assert.equal(saved[0].state.wallAt,100000);assert.equal(saved[0].requestId,'command');assert.equal(r.pending(),0);
 assert.ok(r.steps.every(s=>s.maxTicks===20&&s.target===100000));
 r.send({type:'resume',generation:'session'});assert.ok(r.steps.at(-1).wallAt>100000);
});

test('hidden or stopped simulation can settle a command and report progress without visible frames',()=>{
 const r=runtime({visible:false});r.send({type:'stop'});r.send({type:'checkpoint',generation:'session',pause:true,requestId:'command'});
 for(let i=0;i<100&&r.run();i++);
 assert.equal(r.messages.filter(m=>m.type==='full').length,0);assert.equal(r.messages.findLast(m=>m.type==='checkpoint').state.wallAt,100000);
 assert.ok(r.messages.some(m=>m.type==='checkpointProgress'));
});

test('capture respects offline deadline, rejects stale sessions and keeps periodic checkpoints non-blocking',()=>{
 const r=runtime({serverNow:100000,deadline:30000});
 r.send({type:'checkpoint',generation:'old-session',pause:true,requestId:'old'});assert.equal(r.messages.some(m=>m.requestId==='old'),false);
 r.send({type:'checkpoint',generation:'session',pause:false,requestId:'periodic'});
 assert.equal(r.messages.findLast(m=>m.type==='checkpoint').state.wallAt,2000);assert.ok(r.pending()>0);
 r.send({type:'checkpoint',generation:'session',pause:true,requestId:'command'});for(let i=0;i<100&&r.run();i++);
 assert.equal(r.messages.findLast(m=>m.type==='checkpoint').state.wallAt,30000);assert.equal(r.pending(),0);
});

test('starting a new session discards a pending command from the old session',()=>{
 const r=runtime();r.send({type:'checkpoint',generation:'session',pause:true,requestId:'old'});
 r.send({type:'start',generation:'new',contentVersion:'fixture',serverNow:100000,deadline:200000,state:{wallAt:100000,clock:100000,activity:{type:'idle'}}});
 r.run();assert.equal(r.messages.some(m=>m.type==='checkpoint'&&m.requestId==='old'),false);
});
