import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicationLoop} from '../src/publication-loop.ts';
const fail=(error:unknown):never=>{throw error;};
function timer(){
 let time=0,id=0;
 const pending=new Map<number,{at:number;callback:()=>void}>();
 const schedule=((callback:()=>void,delay:number)=>{const key=++id;pending.set(key,{at:time+delay,callback});return key;}) as unknown as typeof setTimeout;
 const cancel=((key:number)=>{pending.delete(key);}) as unknown as typeof clearTimeout;
 return {now:()=>time,schedule,cancel,pending,
  set(value:number){time=value;},
  async fire(){assert.equal(pending.size,1);const [key,entry]=[...pending][0];pending.delete(key);time=Math.max(time,entry.at);entry.callback();await Promise.resolve();await Promise.resolve();},
  next(){assert.equal(pending.size,1);return [...pending.values()][0].at;},
 };
}
test('publication work stays inside its period without dropping every other deadline',async()=>{
 const clock=timer(),starts:number[]=[];
 const loop=createPublicationLoop({...clock,publish:async()=>{starts.push(clock.now());clock.set(clock.now()+35);},interval:()=>100,onError:fail});
 loop.request();await clock.fire();assert.equal(clock.next(),101);
 await clock.fire();assert.equal(clock.next(),201);
 await clock.fire();assert.deepEqual(starts,[1,101,201]);loop.close();assert.equal(clock.pending.size,0);
});
test('slow publication coalesces missed frames and always yields before the next one',async()=>{
 const clock=timer();let calls=0;
 const loop=createPublicationLoop({...clock,publish:async()=>{calls++;clock.set(clock.now()+1600);},interval:()=>100,onError:fail});
 loop.request();await clock.fire();assert.equal(calls,1);assert.equal(clock.next(),1602);
 await clock.fire();assert.equal(calls,2);assert.equal(clock.pending.size,1);loop.close();
});
test('resubscriptions during a pending read become one forced baseline after it completes',async()=>{
 const clock=timer(),forces:boolean[]=[];let complete!:()=>void;
 const loop=createPublicationLoop({...clock,publish:async force=>{forces.push(force);await new Promise<void>(resolve=>{complete=resolve;});},interval:()=>100,onError:fail});
 loop.request();await clock.fire();assert.equal(clock.pending.size,0);
 loop.request();loop.request();assert.deepEqual(forces,[true]);assert.equal(clock.pending.size,0);
 clock.set(55);complete();await Promise.resolve();await Promise.resolve();assert.equal(clock.next(),56);
 await clock.fire();assert.deepEqual(forces,[true,true]);loop.close();complete();await Promise.resolve();await Promise.resolve();assert.equal(clock.pending.size,0);
});
test('cadence follows current activity and closing cannot restart an outstanding read',async()=>{
 const clock=timer();let interval=1000,complete!:()=>void;
 const loop=createPublicationLoop({...clock,publish:async()=>{await new Promise<void>(resolve=>{complete=resolve;});},interval:()=>interval,onError:fail});
 loop.request();await clock.fire();interval=100;complete();await Promise.resolve();await Promise.resolve();assert.equal(clock.next(),101);
 await clock.fire();loop.close();complete();await Promise.resolve();await Promise.resolve();loop.request();assert.equal(clock.pending.size,0);
});
test('unexpected failures are reported and closing the loop prevents retries',async()=>{
 const clock=timer(),errors:unknown[]=[];
 const loop=createPublicationLoop({...clock,publish:async()=>{throw new Error('failed');},interval:()=>100,onError:error=>{errors.push(error);loop.close();}});
 loop.request();await clock.fire();assert.equal(errors.length,1);assert.equal(clock.pending.size,0);
});
