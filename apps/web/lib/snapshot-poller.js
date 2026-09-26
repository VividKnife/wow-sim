/** One request at a time, bounded latency, and no stale delivery after disposal. */
export function createSnapshotPoller({request,delay,isVisible=()=>true,onError=(_error)=>{},schedule=setTimeout,cancel=clearTimeout,now=()=>performance.now(),random=Math.random,timeoutMs=8000}){
 let stopped=false,running=false,timer,controller,failures=0;
 const refresh=async()=>{
  if(stopped||running)return;
  cancel(timer);
  if(!isVisible())return;
  running=true;controller=new AbortController();const started=now();
  const timeout=schedule(()=>controller.abort(),timeoutMs);
  try{await request(controller.signal);controller.signal.throwIfAborted();failures=0;if(!stopped)onError(null);}
  catch(error){failures++;if(!stopped)onError(error);}
  finally{
   cancel(timeout);running=false;
   // A timeout already consumed the normal interval. Retrying immediately then
   // sustains pressure on the overloaded server; back off from completion, with
   // jitter so reconnecting clients do not all retry together.
   const retry=Math.min(30000,1000*2**Math.min(failures-1,5)*(1+random()*.2));
   if(!stopped)timer=schedule(refresh,failures?Math.max(delay(),retry):Math.max(16,delay()-(now()-started)));
  }
 };
 void refresh();
 return {refresh,stop(){stopped=true;cancel(timer);controller?.abort();}};
}
