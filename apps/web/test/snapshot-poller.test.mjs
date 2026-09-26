import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotPoller} from '../lib/snapshot-poller.js';

function timers(){
 let time=0,id=0;const pending=new Map();
 return {now:()=>time,schedule:(fn,delay)=>{pending.set(++id,{fn,at:time+delay});return id;},cancel:id=>pending.delete(id),
  async tick(ms){const end=time+ms;while(true){const entry=[...pending].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry||entry[1].at>end)break;time=entry[1].at;pending.delete(entry[0]);await entry[1].fn();}time=end;},pending};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('slow requests never overlap and stopping aborts the current request without reporting a stale error',async()=>{
 const clock=timers();let requests=0,release,signal;const errors=[];
 const poller=createSnapshotPoller({...clock,delay:()=>200,onError:e=>errors.push(e),request:s=>{requests++;signal=s;return new Promise(resolve=>{release=resolve;});}});
 await clock.tick(400);await poller.refresh();assert.equal(requests,1);
 poller.stop();assert.ok(signal.aborted);release();await flush();await clock.tick(1000);
 assert.equal(requests,1);assert.deepEqual(errors,[]);assert.equal(clock.pending.size,0);
});
test('polling uses the remaining interval and sleeps while hidden until explicitly resumed',async()=>{
 const clock=timers();let count=0,visible=true;
 const poller=createSnapshotPoller({...clock,isVisible:()=>visible,delay:()=>200,request:async()=>{count++;}});
 await flush();await clock.tick(199);assert.equal(count,1);await clock.tick(1);assert.equal(count,2);
 visible=false;await clock.tick(1000);assert.equal(count,2);
 visible=true;await poller.refresh();assert.equal(count,3);poller.stop();
});
test('a timed out network request is aborted and waits before retrying',async()=>{
 const clock=timers();let count=0;const errors=[];
 const poller=createSnapshotPoller({...clock,random:()=>0,delay:()=>200,timeoutMs:500,onError:e=>errors.push(e),request:signal=>new Promise((_,reject)=>{count++;signal.addEventListener('abort',()=>reject(new Error('timeout')));})});
 await clock.tick(500);await flush();assert.equal(errors.length,1);assert.match(errors[0].message,/timeout/);
 // The retried request remains pending; tick without awaiting its promise.
 const next=[...clock.pending.values()][0];assert.equal(next.at,1500);void next.fn();assert.equal(count,2);poller.stop();await flush();
});
test('repeated failures back off to a cap and successful recovery restores normal polling',async()=>{
 const clock=timers();let fail=true,count=0;
 const poller=createSnapshotPoller({...clock,random:()=>0,delay:()=>200,request:async()=>{count++;if(fail)throw new Error('unavailable');}});
 await flush();
 for(const wait of [1000,2000,4000,8000,16000,30000,30000]){
  const before=count;await clock.tick(wait-1);assert.equal(count,before);
  await clock.tick(1);assert.equal(count,before+1);
 }
 fail=false;await clock.tick(30000);const recovered=count;
 await clock.tick(199);assert.equal(count,recovered);await clock.tick(1);assert.equal(count,recovered+1);
 poller.stop();assert.equal(clock.pending.size,0);
});
test('a request returning after cancellation is still a timeout, not a successful sync',async()=>{
 const clock=timers(),errors=[];
 const poller=createSnapshotPoller({...clock,random:()=>0,delay:()=>200,timeoutMs:500,onError:e=>errors.push(e),request:signal=>new Promise(resolve=>signal.addEventListener('abort',resolve))});
 await clock.tick(500);await flush();
 assert.equal(errors.length,1);assert.equal(errors[0].name,'AbortError');
 assert.equal([...clock.pending.values()][0].at,1500);poller.stop();
});
test('retry jitter spreads clients and preserves a longer normal polling interval',async()=>{
 const clock=timers();
 const poller=createSnapshotPoller({...clock,random:()=>1,delay:()=>200,request:async()=>{throw new Error('offline');}});
 await flush();assert.equal([...clock.pending.values()][0].at,1200);poller.stop();
 const slow=createSnapshotPoller({...clock,random:()=>0,delay:()=>10000,request:async()=>{throw new Error('offline');}});
 await flush();assert.equal([...clock.pending.values()][0].at,10000);slow.stop();
});
