import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';

let Client,directory,outfile;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.local-client-test-'));outfile=join(directory,'client.mjs');
 await build({absWorkingDir:web,entryPoints:['lib/local-simulation-client.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
 Client=(await import(pathToFileURL(outfile).href)).LocalSimulationClient;
});
after(async()=>{await unlink(outfile);await rmdir(directory);});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(t,{lag=0,itemIds=[]}={}){
 const savedWindow=globalThis.window,savedWorker=globalThis.Worker;
 const requests=[],workers=[],statuses=[];
 let pendingReply=null,failNext=false,generation=0;
 const initial={id:'hero',clock:0,wallAt:0,bag:[]};
 let canonical=structuredClone(initial);
 const result=(sequence=0)=>({ownerId:'activity',state:structuredClone(canonical),contentVersion:'fixture',serverNow:canonical.wallAt+lag,deadline:999999,active:true,session:{id:`session-${generation}`,sequence}});
 class Worker {
  onmessage=null;messages=[];state=null;generation='';autoCapture=true;
  constructor(){workers.push(this);}
  postMessage(message){
   this.messages.push(message);
   if(message.type==='start'){this.state=structuredClone(message.state);this.generation=message.generation;}
   if(message.type==='checkpoint'&&this.autoCapture)queueMicrotask(()=>this.onmessage?.({data:{type:'checkpoint',generation:this.generation,requestId:message.requestId,state:structuredClone(this.state)}}));
   if(message.type==='command')queueMicrotask(()=>this.onmessage?.({data:{type:'commandResult',generation:this.generation,requestId:message.requestId,error:message.command.invalid?'invalid order':undefined}}));
  }
  terminate(){}
 }
 globalThis.window={location:{origin:'http://preview',search:'?saveId=one'}};globalThis.Worker=Worker;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.match(url,/saveId=one/);
  const body=JSON.parse(options.body);requests.push(body);
  if(body.type==='claim'){generation++;return Response.json(result());}
  if(body.type==='release')return Response.json({});
  if(failNext){failNext=false;return Response.json({error:'retry'},{status:503});}
  canonical=structuredClone(body.state);
  const {state,...ack}=result(body.sequence);
  const response=Response.json({...ack,itemIds});
  if(pendingReply)return new Promise(resolve=>{pendingReply.resolve=()=>resolve(response);});
  return response;
 });
 t.mock.timers.enable({apis:['setTimeout']});
 const client=new Client({onFull:()=>{},onStatus:message=>statuses.push(message),refresh:async()=>{}});
 t.after(()=>{client.dispose();globalThis.window=savedWindow;globalThis.Worker=savedWorker;});
 return {client,workers,requests,statuses,hold:()=>{pendingReply={};return ()=>{pendingReply.resolve();pendingReply=null;};},fail:()=>{failNext=true;}};
}
test('rules load only after ownership; delayed periodic ACK does not restart or rewind the Worker',async t=>{
 const h=harness(t);assert.equal(h.workers.length,0);
 h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0];assert.equal(worker.messages.filter(m=>m.type==='start').length,1);
 worker.state.clock=worker.state.wallAt=10000;
 const deliver=h.hold();t.mock.timers.tick(10000);await flush();
 assert.equal(worker.messages.findLast(m=>m.type==='checkpoint').pause,false);
 worker.state.clock=worker.state.wallAt=12000;
 deliver();await flush();
 assert.equal(worker.messages.filter(m=>m.type==='start').length,1);
 assert.equal(worker.messages.findLast(m=>m.type==='ack').state,undefined);
 assert.deepEqual(worker.messages.findLast(m=>m.type==='ack').itemIds,[]);
 assert.equal(worker.state.clock,12000);
 assert.equal(h.requests.filter(r=>r.type==='checkpoint').length,1);
});
test('a failed checkpoint retries the identical request and manual commands pause at the latest state',async t=>{
 const h=harness(t);h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 h.workers[0].state.clock=h.workers[0].state.wallAt=10000;
 h.fail();t.mock.timers.tick(10000);await flush();
 const first=h.requests.find(r=>r.type==='checkpoint');assert.ok(first);
 t.mock.timers.tick(2000);await flush();
 assert.deepEqual(h.requests.filter(r=>r.type==='checkpoint')[1],first);
 let executed=false;
 await h.client.command(async credentials=>{
  assert.equal(h.workers[0].messages.findLast(m=>m.type==='checkpoint').pause,true);
  assert.equal(credentials.localSessionId,'session-1');executed=true;
 });
 assert.equal(executed,true);
 await flush();
 assert.equal(h.requests.filter(r=>r.type==='claim').length,2);
});

test('identity-only ACK updates queued inventory commands and preserves live action eligibility',async t=>{
 const h=harness(t,{itemIds:[['drop','asset-id']]});
 h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 h.workers[0].state.bag.push({uid:'drop',count:1});
 t.mock.timers.tick(10000);await flush();
 assert.deepEqual(h.workers[0].messages.findLast(m=>m.type==='ack').itemIds,[['drop','asset-id']]);
 assert.equal(h.client.canAct({type:'cast',characterId:'hero'}),true);
 await h.client.command(async(credentials,prepare)=>{
  assert.equal(credentials.localSessionId,'session-1');
  assert.deepEqual(prepare({type:'loot',uids:['drop']}),{type:'loot',uids:['asset-id']});
 });
});

test('a command received during offline catch-up waits for its settled checkpoint and executes once',async t=>{
 const h=harness(t,{lag:60000});h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0];worker.autoCapture=false;let executions=0;
 const command=h.client.command(async()=>{executions++;return 'done';});await flush();
 const capture=worker.messages.findLast(m=>m.type==='checkpoint');assert.equal(capture.pause,true);assert.equal(capture.generation,worker.generation);
 assert.equal(executions,0);assert.match(h.statuses.at(-1),/自动执行/);
 // Catch-up takes longer than the original 15-second timeout but progresses.
 for(let i=1;i<=3;i++){t.mock.timers.tick(14000);worker.onmessage({data:{type:'checkpointProgress',generation:worker.generation,requestId:capture.requestId,wallAt:i*20000}});await flush();assert.equal(executions,0);}
 // An earlier response from the same session cannot release the queued command.
 worker.onmessage({data:{type:'checkpoint',generation:worker.generation,requestId:'stale-request',state:worker.state}});await flush();assert.equal(executions,0);
 worker.state.clock=worker.state.wallAt=60000;
 worker.onmessage({data:{type:'checkpoint',generation:worker.generation,requestId:capture.requestId,state:structuredClone(worker.state)}});
 assert.equal(await command,'done');assert.equal(executions,1);assert.equal(h.requests.find(r=>r.type==='checkpoint').state.wallAt,60000);
});

test('a stale lag sample no longer blocks commands after the Worker has caught up',async t=>{
 const h=harness(t,{lag:30000});h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0];worker.state.clock=worker.state.wallAt=30000;
 // No full projection was sent yet (e.g. a hidden tab). The worker handshake
 // remains authoritative instead of relying on that old display sample.
 let executed=false;await h.client.command(async()=>{executed=true;});assert.equal(executed,true);
 assert.equal(h.requests.find(r=>r.type==='checkpoint').state.wallAt,30000);
});

test('combat frames clear catch-up status even when the full overview is deferred',async t=>{
 const h=harness(t,{lag:30000});h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0];
 worker.onmessage({data:{type:'frame',generation:worker.generation,behindMs:30000,snapshot:{player:{clock:0},view:{}}}});
 assert.match(h.statuses.at(-1),/结算离线/);
 worker.onmessage({data:{type:'frame',generation:worker.generation,behindMs:0,snapshot:{player:{clock:30000},view:{}}}});
 assert.equal(h.statuses.at(-1),'');
 assert.equal(h.client.latest,null,'a partial frame must not replace the full overview');
});

test('a failed Worker reports its real error instead of claiming offline catch-up',async t=>{
 const h=harness(t,{lag:60000});h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0];worker.onmessage({data:{type:'error',generation:worker.generation,error:'游戏规则已更新，请刷新页面'}});
 await assert.rejects(()=>h.client.command(async()=>assert.fail('must not execute')),/游戏规则已更新/);
 assert.equal(h.requests.filter(r=>r.type==='checkpoint').length,0);
});

test('a stalled command checkpoint still times out and ignores non-advancing progress',async t=>{
 const h=harness(t,{lag:60000});h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0];worker.autoCapture=false;
 const command=h.client.command(async()=>assert.fail('must not execute'));
 const rejected=assert.rejects(command,/响应超时/);await flush();
 const capture=worker.messages.findLast(m=>m.type==='checkpoint');
 worker.onmessage({data:{type:'checkpointProgress',generation:worker.generation,requestId:capture.requestId,wallAt:0}});
 t.mock.timers.tick(10000);
 worker.onmessage({data:{type:'checkpointProgress',generation:worker.generation,requestId:capture.requestId,wallAt:0}});
 t.mock.timers.tick(5000);await rejected;
});

test('live commands bypass a delayed checkpoint upload without saving, restarting or reclaiming',async t=>{
 const h=harness(t);h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0],deliver=h.hold();t.mock.timers.tick(10000);await flush();
 assert.equal(h.requests.filter(r=>r.type==='checkpoint').length,1);
 for(const type of ['combatCommand','raidOrder','cast','petCommand','battlegroundOrder','arenaSurrender'])assert.equal(await h.client.act({type,characterId:'hero'}),true);
 assert.equal(h.requests.length,2,'claim and periodic save only; no network round-trip for live commands');
 assert.equal(worker.messages.filter(m=>m.type==='start').length,1);
 assert.equal(worker.messages.filter(m=>m.type==='checkpoint').length,1);
 deliver();await flush();assert.equal(h.requests.length,2);
});

test('live command rejection is surfaced without retrying on the server or stopping the Worker',async t=>{
 const h=harness(t);h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 await assert.rejects(h.client.act({type:'combatCommand',invalid:true}),/invalid order/);
 assert.equal(await h.client.act({type:'combatCommand',order:'resume'}),true);
 assert.equal(h.client.canAct({type:'equip'}),false);
 assert.equal(h.client.canAct({type:'cast',characterId:'other'}),false);
 assert.equal(h.client.canAct({type:'combatCommand',order:'prepare'}),false);
 assert.equal(h.requests.length,1);
});

test('temporary save failures keep combat and input running while preserving the retry body',async t=>{
 const h=harness(t);h.client.observe({ownerId:'activity',sessionId:null},'fixture','hero');await flush();
 const worker=h.workers[0],stops=worker.messages.filter(m=>m.type==='stop').length;
 h.fail();t.mock.timers.tick(10000);await flush();
 assert.equal(worker.messages.filter(m=>m.type==='stop').length,stops);
 worker.onmessage({data:{type:'frame',generation:worker.generation,behindMs:0,snapshot:{player:{clock:10000},view:{}}}});
 assert.match(h.statuses.at(-1),/暂未同步/,'live frames must not hide a failed save');
 assert.equal(await h.client.act({type:'raidOrder'}),true);
 t.mock.timers.tick(2000);await flush();
 assert.deepEqual(h.requests.filter(r=>r.type==='checkpoint')[0],h.requests.filter(r=>r.type==='checkpoint')[1]);
});

test('the first browser command requests local execution before an owner or Worker exists',async t=>{
 const h=harness(t);
 await h.client.command(async credentials=>{assert.equal(typeof credentials.localClientId,'string');assert.ok(credentials.localClientId.length);assert.equal(credentials.localSessionId,undefined);});
 assert.equal(h.requests.length,0);assert.equal(h.workers.length,0);
});
