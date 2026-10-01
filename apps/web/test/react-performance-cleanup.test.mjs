import test from 'node:test';
import assert from 'node:assert/strict';
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {installReactPerformanceCleanup} from '../lib/react-performance-cleanup.js';

test('React component and scheduler measures do not accumulate; observers still receive them',async()=>{
 const original=performance.measure,received=[];
 const observer=new PerformanceObserver(list=>received.push(...list.getEntries()));
 observer.observe({entryTypes:['measure']});
 const restore=installReactPerformanceCleanup(performance);
 try{
  performance.mark('app-start');
  performance.measure('app-measure','app-start');
  for(let i=0;i<10000;i++){
   const entry=performance.measure('\u200bBattle',{start:0,detail:{devtools:{track:'Components ⚛',properties:[['hp',String(i)]]}}});
   assert.equal(entry.name,'\u200bBattle');
   assert.equal(entry.detail.devtools.properties[0][1],String(i));
  }
  performance.measure('Update',{start:0,detail:{devtools:{track:'Blocking',trackGroup:'Scheduler ⚛'}}});
  assert.equal(performance.getEntriesByName('\u200bBattle','measure').length,0);
  assert.equal(performance.getEntriesByName('Update','measure').length,0);
  assert.equal(performance.getEntriesByName('app-measure','measure').length,1);
  assert.equal(performance.getEntriesByName('app-start','mark').length,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(received.filter(e=>e.name==='\u200bBattle').length,10000);
  assert.equal(received.filter(e=>e.name==='Update').length,1);
  assert.throws(()=>performance.measure('invalid','missing-start-mark'));
 }finally{
  observer.disconnect();restore();performance.clearMeasures('app-measure');performance.clearMarks('app-start');
 }
 assert.equal(performance.measure,original);
});

test('disposal does not overwrite a subsequently installed instrument',()=>{
 const original=(...args)=>args,host={measure:original,clearMeasures(){}};
 const restore=installReactPerformanceCleanup(host),later=()=>{};
 host.measure=later;restore();assert.equal(host.measure,later);
});
