// React 19.2's development Performance Tracks retain serialized component props
// in Chromium's User Timing buffer. Frequent battle updates can accumulate many
// hundreds of thousands of entries, outside the usual JS heap measurement.
// Keep emitting the measures for DevTools/PerformanceObserver, then release only
// React's named buffer entries, as upstream does in react/react#34803.
export function installReactPerformanceCleanup(performance){
 const measure=performance.measure;
 function measured(...args){
  const result=Reflect.apply(measure,this,args);
  const details=args[1]?.detail?.devtools;
  if(details?.track==='Components ⚛'||details?.trackGroup==='Scheduler ⚛')performance.clearMeasures(args[0]);
  return result;
 }
 performance.measure=measured;
 return()=>{if(performance.measure===measured)performance.measure=measure;};
}
