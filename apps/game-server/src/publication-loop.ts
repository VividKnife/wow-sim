/** One in-flight projection and one timer per subscriber. Missed publication
 * deadlines are coalesced, never queued as a burst of historical frames. */
export function createPublicationLoop({publish,interval,onError,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}:{
 publish:(force:boolean)=>Promise<void>;
 interval:()=>number;
 onError:(error:unknown)=>void;
 now?:()=>number;
 schedule?:typeof setTimeout;
 cancel?:typeof clearTimeout;
}){
 let timer:ReturnType<typeof setTimeout>|undefined,running=false,closed=false,forced=false;
 const arm=(delay:number)=>{
  if(closed)return;
  if(timer!==undefined)cancel(timer);
  timer=schedule(()=>{timer=undefined;void run();},Math.max(1,Math.ceil(delay)));
 };
 const run=async()=>{
  if(closed||running)return;
  running=true;const force=forced;forced=false;const started=now();
  try{await publish(force);}catch(error){onError(error);}
  finally{
   running=false;
   // Count work time inside the period. Even after an overrun, yield to input
   // and other sockets before asking for one fresh projection.
   arm(forced?1:started+interval()-now());
  }
 };
 return {
  request(){if(closed)return;forced=true;if(!running)arm(1);},
  close(){closed=true;if(timer!==undefined)cancel(timer);timer=undefined;},
 };
}
