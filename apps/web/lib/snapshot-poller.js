/** One request at a time, bounded latency, and no stale delivery after disposal. */
export function createSnapshotPoller({request,delay,isVisible=()=>true,onError=(_error)=>{},schedule=setTimeout,cancel=clearTimeout,now=()=>performance.now(),timeoutMs=8000}){
 let stopped=false,running=false,timer,controller;
 const refresh=async()=>{
  if(stopped||running)return;
  cancel(timer);
  if(!isVisible())return;
  running=true;controller=new AbortController();const started=now();
  const timeout=schedule(()=>controller.abort(),timeoutMs);
  try{await request(controller.signal);if(!stopped)onError(null);}
  catch(error){if(!stopped)onError(error);}
  finally{cancel(timeout);running=false;if(!stopped)timer=schedule(refresh,Math.max(16,delay()-(now()-started)));}
 };
 void refresh();
 return {refresh,stop(){stopped=true;cancel(timer);controller?.abort();}};
}
