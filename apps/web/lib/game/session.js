import {advance,act} from './engine.js';

// Server time only. A missed heartbeat window is discarded for dungeons,
// including cooldowns/rest/RNG; outdoor catch-up keeps its existing semantics.
export const heartbeatWindowMs=6000;
export const ownsSession=(s,id,now)=>s.presence?.clientId===id&&!s.presence.paused&&s.presence.until>now;
export function stepSession(input,command,now){
 const id=command.clientId;if(typeof id!=='string'||!/^[-\w]{8,100}$/.test(id))throw new Error('页面标识无效，请刷新页面。');
 const owner=input.presence,other=owner&&owner.clientId!==id&&!owner.paused&&owner.until>now;
 if(other&&command.type!=='takeControl'){
  if(!['sync','pause'].includes(command.type))throw new Error('另一页面正在操作这个角色，请先接管控制权。');
  return {state:input,complete:true,controlled:false,changed:false};
 }
 const dungeonOnline=ownsSession(input,id,now)&&now-owner.seenAt<=heartbeatWindowMs;
 const result=advance(input,now,{dungeonOnline});let s=result.state;
 if(result.complete&&!['sync','pause','takeControl'].includes(command.type))s=act(s,command,now);
 s.presence={clientId:id,seenAt:now,until:command.type==='pause'?now:now+heartbeatWindowMs,paused:command.type==='pause'};
 return {state:s,complete:result.complete,controlled:true,changed:true};
}
