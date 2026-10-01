import assert from 'node:assert/strict';
import test from 'node:test';
import {once} from 'node:events';
import {get,createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {createGameServer} from '../src/server.ts';
import {accounts,appOrigin} from './session-fixture.ts';

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

test('disconnected model request cancels a late upstream body without crashing the gateway',async t=>{
 const originalFetch=globalThis.fetch;
 const requested=deferred(),headers=deferred(),cancelled=deferred();
 let controller:ReadableStreamDefaultController<Uint8Array>;
 t.mock.method(globalThis,'fetch',async (...args:Parameters<typeof fetch>)=>{
  if(!String(args[0]).startsWith('https://wow.zamimg.com/'))return originalFetch(...args);
  requested.resolve();await headers.promise;
  return new Response(new ReadableStream<Uint8Array>({start(c){controller=c;},cancel(){cancelled.resolve();}}));
 });
 const game=createGameServer({accounts,appOrigin,service:{} as any});
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
 t.after(()=>game.close());
 const address=game.server.address();assert.ok(address&&typeof address==='object');
 const url=`http://127.0.0.1:${address.port}`;
 const request=get(url+'/api/model-viewer/m2/119940.m2');request.on('error',()=>{});
 await requested.promise;
 const closed=new Promise<void>(resolve=>request.once('close',resolve));request.destroy();await closed;
 headers.resolve();
 // A real upstream fetch can time out after the downstream has gone away.
 await new Promise(resolve=>setTimeout(resolve,30));
 controller!.error(new DOMException('The operation was aborted due to timeout','TimeoutError'));
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal((await originalFetch(url+'/unknown')).status,404);
 await Promise.race([cancelled.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('upstream body not cancelled')),500))]);
});

for(const status of [404,503])test(`rejected upstream ${status} releases its unfinished body`,async t=>{
 const originalFetch=globalThis.fetch;let connections=0,ended=0;
 const upstream=createServer((_request,response)=>{
  connections++;response.on('close',()=>{ended++;});
  response.writeHead(status,{'content-type':'application/octet-stream','content-encoding':'gzip'});
  response.write(gzipSync('upstream error').subarray(0,-4));
 });
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const upstreamAddress=upstream.address();assert.ok(upstreamAddress&&typeof upstreamAddress==='object');
 t.mock.method(globalThis,'fetch',async (...args:Parameters<typeof fetch>)=>String(args[0]).startsWith('https://wow.zamimg.com/')
  ?originalFetch(`http://127.0.0.1:${upstreamAddress.port}`,{signal:AbortSignal.timeout(300)}):originalFetch(...args));
 const game=createGameServer({accounts,appOrigin,service:{} as any});
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());
 const address=game.server.address();assert.ok(address&&typeof address==='object');
 const url=`http://127.0.0.1:${address.port}`;
 const response=await originalFetch(url+'/api/model-viewer/m2/119940.m2');
 assert.equal(response.status,status===404?404:502);await response.text();
 await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal(ended,connections,'rejected response bodies must be cancelled before their upstream timeout');
 await new Promise(resolve=>setTimeout(resolve,350));
 assert.equal((await originalFetch(url+'/unknown')).status,404);
});

for(const compressed of [false,true])for(const disconnect of [false,true])test(`a model stream failure stays isolated (gzip=${compressed}, disconnect=${disconnect})`,async t=>{
 const originalFetch=globalThis.fetch;
 const upstream=createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/octet-stream',...(compressed?{'content-encoding':'gzip'}:{})});response.write(compressed?gzipSync('partial model').subarray(0,-4):'partial model');});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const upstreamAddress=upstream.address();assert.ok(upstreamAddress&&typeof upstreamAddress==='object');
 t.mock.method(globalThis,'fetch',async (...args:Parameters<typeof fetch>)=>String(args[0]).startsWith('https://wow.zamimg.com/')
  ?originalFetch(`http://127.0.0.1:${upstreamAddress.port}`,{signal:AbortSignal.timeout(100)}):originalFetch(...args));
 const game=createGameServer({accounts,appOrigin,service:{} as any});
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());
 const address=game.server.address();assert.ok(address&&typeof address==='object');
 const url=`http://127.0.0.1:${address.port}`;
 const client=new AbortController();
 const response=await originalFetch(url+'/api/model-viewer/m2/119940.m2',{signal:client.signal});
 if(disconnect)client.abort();
 await assert.rejects(response.arrayBuffer());
 if(disconnect)await new Promise(resolve=>setTimeout(resolve,150));
 assert.equal((await originalFetch(url+'/unknown')).status,404);
});
