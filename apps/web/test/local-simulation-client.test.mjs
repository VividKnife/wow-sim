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
function harness(t){
 const savedWindow=globalThis.window,savedWorker=globalThis.Worker;
 const requests=[],workers=[],statuses=[];
 let pendingReply=null,failNext=false,generation=0;
 const initial={id:'hero',clock:0,wallAt:0,bag:[]};
 let canonical=structuredClone(initial);
 const result=(sequence=0)=>({ownerId:'activity',state:structuredClone(canonical),contentVersion:'fixture',serverNow:canonical.wallAt,deadline:999999,active:true,session:{id:`session-${generation}`,sequence}});
 class Worker {
  onmessage=null;messages=[];state=null;generation='';
  constructor(){workers.push(this);}
  postMessage(message){
   this.messages.push(message);
   if(message.type==='start'){this.state=structuredClone(message.state);this.generation=message.generation;}
   if(message.type==='checkpoint')queueMicrotask(()=>this.onmessage?.({data:{type:'checkpoint',generation:this.generation,state:structuredClone(this.state)}}));
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
  const response=Response.json(result(body.sequence));
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
 assert.equal(worker.messages.findLast(m=>m.type==='ack').state.clock,10000);
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
