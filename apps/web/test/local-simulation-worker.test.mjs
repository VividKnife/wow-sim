import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

let source;
before(async()=>{
 const fixtures={
  'engine.js':'export const advanceOwned=(...args)=>globalThis.advanceFixture(...args);export const act=(...args)=>globalThis.actFixture(...args);export const view=state=>globalThis.viewFixture(state);',
  'raid-command.js':'export const raidCommandView=state=>({clock:state.clock,order:state.order});',
  'combat-command.js':'export const combatCommandView=()=>null;',
  'arena.js':'export const arenaView=()=>({});',
  'battleground.js':'export const battlegroundView=()=>({});',
  'gold-raid.js':'export const goldRaidView=state=>({clock:state.clock});',
  'battle-presentation.js':'export const battlePresentation=()=>({});',
  'client-snapshot.ts':'export const projectClientSnapshot=(player,view)=>({player,view});export const projectCombatPlayback=()=>({view:{}});',
  'manifest.json':'export default {contentVersion:"fixture"};',
 };
 const bundle=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['lib/local-simulation.worker.ts'],write:false,bundle:true,format:'iife',platform:'browser',logLevel:'silent',plugins:[{name:'worker-fixtures',setup(build){
  build.onResolve({filter:/\.(js|ts|json)$/},args=>{const name=args.path.split('/').at(-1);if(fixtures[name])return {path:name,namespace:'fixture'};});
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path],loader:'js'}));
 }}]});source=bundle.outputFiles[0].text;
});

function runtime({now=0,wallAt=0,serverNow=100000,deadline=200000,visible=true,extra={},computeMs=0}={}){
 const messages=[],timers=new Map(),steps=[],views=[],delays=[];let id=0,time=now,patch={};
 const sandbox={actFixture:(state,command)=>{if(command.invalid)throw new Error('invalid order');return {...state,order:command.order};},performance:{now:()=>time},structuredClone,postMessage:message=>messages.push(structuredClone(message)),setTimeout:(fn,delay)=>{delays.push(delay);timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),viewFixture:state=>{views.push(state.clock);return {clock:state.clock};},advanceFixture:(state,target,{maxTicks})=>{
  time+=computeMs;
  const next=Math.min(target,state.wallAt+maxTicks*100);steps.push({target,maxTicks,wallAt:next});
  Object.assign(state,patch,{clock:next,wallAt:next});return {state,complete:next===target};
 }};
 runInNewContext(source,sandbox);
 const send=data=>sandbox.onmessage({data});
 const initial={id:'hero',clock:wallAt,wallAt,activity:{type:'battlegroundCombat'},...extra};
 send({type:'visibility',visible,watching:true});send({type:'start',contentVersion:'fixture',generation:'session',state:initial,serverNow,deadline});
 const run=()=>{const first=timers.entries().next().value;if(!first)return false;timers.delete(first[0]);first[1]();return true;};
 return {messages,steps,views,delays,send,run,clock:value=>{time=value;},change:value=>{patch=value;},pending:()=>timers.size};
}

test('watching a fight streams frames without rebuilding the full overview every second',()=>{
 for(const extra of [{combat:{id:'boss'},goldRaid:{}},{arena:{phase:'combat'}},{battleground:{phase:'countdown'}}]){
  const r=runtime({serverNow:0,extra});
  for(let ms=100;ms<=3000;ms+=100){r.clock(ms);r.run();}
  assert.equal(r.views.length,1);
  assert.equal(r.messages.filter(m=>m.type==='frame').length,30);
  assert.equal(r.messages.findLast(m=>m.type==='frame').behindMs,0);
  if(extra.goldRaid)assert.equal(r.messages.findLast(m=>m.type==='frame').snapshot.view.goldRaid.clock,2100);
  r.send({type:'visibility',visible:true,watching:false});r.clock(3050);r.run();
  assert.equal(r.views.length,2,'closing the fight refreshes the overview immediately');
  assert.equal(r.messages.findLast(m=>m.type==='full').snapshot.player.clock,3050);
 }
});

test('encounter transitions and idle overviews still publish fresh full snapshots',()=>{
 const r=runtime({serverNow:0,extra:{combat:{id:'first'}}});
 r.clock(100);r.change({combat:{id:'second'}});r.run();assert.equal(r.views.length,2);
 r.clock(200);r.change({combat:null,activity:{type:'idle'}});r.run();assert.equal(r.views.length,3);
 r.clock(1200);r.run();assert.equal(r.views.length,4);
 assert.equal(r.messages.filter(m=>m.type==='boundary').length,2);
});

test('simulation work is included in the visible timer cadence',()=>{
 const r=runtime({serverNow:0,computeMs:35,extra:{combat:{id:'fight'}}});
 assert.equal(r.delays.at(-1),15);
});

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

test('live input catches up to its arrival time, publishes immediately and keeps running',()=>{
 const r=runtime({serverNow:10000,extra:{combat:{id:'fight'}}});
 r.send({type:'command',generation:'session',requestId:'focus',command:{type:'combatCommand',order:'focus',characterId:'hero'}});
 assert.equal(r.messages.some(m=>m.type==='commandResult'),false);
 for(let i=0;i<10&&!r.messages.some(m=>m.type==='commandResult');i++)r.run();
 assert.equal(r.messages.findLast(m=>m.type==='commandResult').error,undefined);
 assert.equal(r.messages.findLast(m=>m.type==='frame').snapshot.view.raidCommand.order,'focus');
 assert.equal(r.views.length,1,'live orders must not compute the expensive full view');
 assert.ok(r.pending());assert.equal(r.messages.some(m=>m.type==='checkpoint'),false);
});

test('invalid commands reject independently and cannot mutate state or stop simulation',()=>{
 const r=runtime({serverNow:0,extra:{combat:{id:'fight'}}});
 for(const command of [{type:'equip'},{type:'cast',characterId:'other'},{type:'cast',casterId:'other'},{type:'combatCommand',invalid:true}]){
  r.send({type:'command',generation:'session',requestId:'bad',command});
  assert.ok(r.messages.findLast(m=>m.type==='commandResult').error);assert.ok(r.pending());
 }
 r.send({type:'command',generation:'old',requestId:'stale',command:{type:'cast'}});
 assert.equal(r.messages.some(m=>m.requestId==='stale'),false);
 r.send({type:'command',generation:'session',requestId:'good',command:{type:'combatCommand',order:'resume'}});
 assert.equal(r.messages.findLast(m=>m.type==='commandResult').error,undefined);
});

test('PvP phase transitions publish a full snapshot even when the activity is unchanged',()=>{
 for(const key of ['arena','battleground']){
  const r=runtime({serverNow:0,extra:{[key]:{id:'match',phase:'countdown'}}});
  r.clock(100);r.change({[key]:{id:'match',phase:'combat'}});r.run();
  assert.equal(r.views.length,2);assert.equal(r.messages.filter(m=>m.type==='boundary').length,1);
 }
});

test('compact checkpoints omit local history; identity-only ACK preserves newer live state and logs',()=>{
 const r=runtime({serverNow:0,extra:{logs:[{text:'local event'}],battleHistory:[{battle:{id:'old'}}],bag:[{uid:'drop'}]}});r.clock(100);r.run();
 r.send({type:'checkpoint',generation:'session',requestId:'save'});
 const captured=r.messages.findLast(m=>m.type==='checkpoint').state;
 assert.deepEqual(captured.logs,[]);assert.deepEqual(captured.battleHistory,[]);
 r.clock(200);r.run();
 r.send({type:'ack',generation:'session',itemIds:[['drop','canonical']],deadline:200000});
 r.send({type:'visibility',visible:true,watching:false});r.clock(250);r.run();
 const live=r.messages.findLast(m=>m.type==='full').snapshot.player;
 assert.equal(live.wallAt,250);assert.equal(live.bag[0].uid,'canonical');
 assert.equal(live.logs[0].text,'local event');assert.equal(live.battleHistory[0].battle.id,'old');
 assert.equal(captured.wallAt,100);assert.equal(captured.bag[0].uid,'drop');
});

test('a server handoff settles queued live input and then its own later capture time',()=>{
 const r=runtime();
 r.send({type:'command',generation:'session',requestId:'live',command:{type:'combatCommand',order:'focus'}});
 r.clock(1000);r.send({type:'checkpoint',generation:'session',requestId:'handoff',pause:true});
 for(let i=0;i<100&&r.run();i++);
 assert.equal(r.messages.findLast(m=>m.type==='commandResult').error,undefined);
 const checkpoint=r.messages.findLast(m=>m.type==='checkpoint');
 assert.equal(checkpoint.state.wallAt,101000);assert.equal(checkpoint.state.order,'focus');assert.equal(r.pending(),0);
});
