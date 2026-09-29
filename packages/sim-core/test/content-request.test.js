import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchContentJson} from '../src/content-request.js';

for(const failure of ['timeout','network','body','503'])test(`content retries transient ${failure} once`,async()=>{
 let calls=0;const signals=[],delays=[];
 const result=await fetchContentJson('/content',{
  sleep:async ms=>delays.push(ms),fetchImpl:async(url,options)=>{
   signals.push(options.signal);
   if(++calls===1){
    if(failure==='503')return new Response(null,{status:503});
    if(failure==='body')return {ok:true,json:async()=>{throw new DOMException('signal timed out','TimeoutError');}};
    throw failure==='network'?new TypeError('Failed to fetch'):new DOMException('signal timed out','TimeoutError');
   }
   return Response.json({version:'current'});
  },
 });
 assert.deepEqual(result,{version:'current'});assert.equal(calls,2);assert.deepEqual(delays,[500]);assert.notEqual(signals[0],signals[1]);
});
test('exhausted content downloads use a recoverable Chinese error',async()=>{
 let calls=0;
 await assert.rejects(fetchContentJson('/content',{sleep:async()=>{},fetchImpl:async()=>{calls++;throw new DOMException('signal timed out','TimeoutError');}}),error=>error.code==='LOCAL_CONTENT_NETWORK'&&/冒险资料下载/.test(error.message)&&!error.message.includes('signal'));
 assert.equal(calls,2);
});
for(const status of [401,404,409])test(`content does not retry permanent HTTP ${status}`,async()=>{
 let calls=0;
 await assert.rejects(fetchContentJson('/content',{fetchImpl:async()=>{calls++;return new Response(null,{status});}}),error=>error.status===status);
 assert.equal(calls,1);
});
test('invalid JSON is not retried',async()=>{
 let calls=0;
 await assert.rejects(fetchContentJson('/content',{fetchImpl:async()=>{calls++;return new Response('broken');}}),SyntaxError);
 assert.equal(calls,1);
});
