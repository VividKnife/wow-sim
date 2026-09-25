import {act,advance} from '../../../../packages/game-domain/src/rules/engine.js';
import {createJourneyState,journeySnapshot} from './journey-ui-state.mjs';
let state=createJourneyState(),active=true,paused=false,speed=1,last=performance.now();
function publish(requestId?:number,error='',result=''){
 postMessage({snapshot:journeySnapshot(state),requestId,error,result,paused,speed});
}
self.onmessage=event=>{
 const {type,requestId,action}=event.data;
 try{
  if(type==='visibility'){active=event.data.active;last=performance.now();return;}
  if(type==='reset'){state=createJourneyState();paused=false;last=performance.now();publish(requestId,'','试玩已重置。');return;}
  if(type==='pause'){paused=!paused;last=performance.now();publish(requestId);return;}
  if(type==='speed'){speed=event.data.speed===4?4:1;last=performance.now();publish(requestId);return;}
  if(type==='action'){
   const xp=state.totals.xp,money=state.money;
   state=act(state,action,state.wallAt);
   const labels:Record<string,string>={accept:'已接受委托。',navigateQuest:'已规划路线，准备出发。',hunt:'已开始自动狩猎。',stop:state.combat?'已申请本场结束后停止。':'已停止当前活动。',mount:'正在召唤坐骑。',dismount:'已下马。',equip:'装备已更新。',loot:'已拾取可容纳的物品。'};
   publish(requestId,'',action.type==='turnin'?`任务已交付 · 获得 ${state.totals.xp-xp} 经验、${state.money-money} 铜币。`:labels[action.type]||'操作已完成。');return;
  }
 }catch(error){publish(requestId,(error as Error).message);}
};
function tick(){
 const now=performance.now(),elapsed=Math.max(0,Math.round(now-last));last=now;
 if(active&&!paused&&(state.combat||state.activity.type!=='idle'||('rest' in state&&state.rest))){
  try{state=advance(state,state.wallAt+elapsed*speed).state;publish();}
  catch(error){paused=true;publish(undefined,(error as Error).message);}
 }
 setTimeout(tick,state.combat?200:500);
}
publish();last=performance.now();setTimeout(tick,500);
