import {applyGameEvent,type GameSnapshotEvent} from '../../../packages/contracts/src/events.ts';

export function gameStreamUrl(pageUrl:string){
 const page=new URL(pageUrl),url=new URL('/api/events',page);url.protocol=page.protocol==='https:'?'wss:':'ws:';
 const saveId=page.searchParams.get('saveId');if(saveId)url.searchParams.set('saveId',saveId);return url.href;
}

// Decode every ordered delta, but hold only one pending presentation while
// content loads. HTTP command replies never become this stream's delta baseline.
export function connectGameStream({url,characterId,onSnapshot,onConnection=()=>{},socketFactory=(url:string)=>new WebSocket(url),now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}:{
 url:string;characterId:string;onSnapshot:(snapshot:GameSnapshotEvent)=>Promise<unknown>|unknown;
 onConnection?:(connected:boolean)=>void;socketFactory?:(url:string)=>WebSocket;now?:()=>number;schedule?:typeof setTimeout;cancel?:typeof clearTimeout;
}){
 let socket:WebSocket|undefined,stopped=false,baseline:GameSnapshotEvent|null=null,pending:GameSnapshotEvent|null=null,draining=false;
 let retry:ReturnType<typeof setTimeout>|undefined,watchdog:ReturnType<typeof setTimeout>|undefined,failures=0,lastMessage=now(),generation=0;
 const subscribe=()=>socket?.send(JSON.stringify({type:'subscribe',characterId,mode:'delta',realtime:true}));
 const drain=async()=>{
  if(draining)return;draining=true;
  try{while(pending&&!stopped){const next=pending;pending=null;await onSnapshot(next);}}
  catch{onConnection(false);socket?.close();}
  finally{draining=false;}
 };
 const open=()=>{
  if(stopped)return;const current=++generation;baseline=null;pending=null;lastMessage=now();
  try{socket=socketFactory(url);}catch{reconnect();return;}
  const ws=socket;
  ws.onopen=()=>{if(!stopped&&current===generation)subscribe();};
  ws.onmessage=event=>{
   if(stopped||current!==generation)return;
   lastMessage=now();
   try{
    const message=JSON.parse(String(event.data));
    if(message.type==='heartbeat')return;
    if(message.type==='error'){onConnection(false);ws.close();return;}
    baseline=applyGameEvent(baseline,message);
    failures=0;onConnection(true);pending=baseline;void drain();
   }catch{baseline=null;pending=null;onConnection(false);subscribe();}
  };
  ws.onerror=()=>ws.close();
  ws.onclose=()=>{if(stopped||current!==generation)return;onConnection(false);reconnect();};
  const check=()=>{if(stopped||current!==generation)return;if(now()-lastMessage>5000){ws.close();return;}watchdog=schedule(check,1000);};
  watchdog=schedule(check,1000);
 };
 const reconnect=()=>{cancel(watchdog);cancel(retry);baseline=null;pending=null;retry=schedule(open,Math.min(15000,500*2**Math.min(failures++,5)));};
 open();
 return {close(){stopped=true;generation++;pending=null;cancel(retry);cancel(watchdog);socket?.close();onConnection(false);}};
}
