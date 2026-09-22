import {advance, view} from '../../../packages/game-domain/src/rules/engine.js';
import {arenaView} from '../../../packages/game-domain/src/rules/arena.js';
import {battlePresentation} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {projectClientSnapshot, projectCombatPlayback} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import manifest from '../../../packages/game-data/manifest.json';
import {reconcileItemIdentities} from './local-item-identities.js';

let state:any, timer:ReturnType<typeof setTimeout>|undefined, origin=0, started=0, deadline=0;
let lastFull=0, lastFrame=0, running=false, visible=true, watching=true, generation='';
let overview:any=null;
let submitted:any=null;
const scope = globalThis as unknown as {postMessage:(message:unknown)=>void;onmessage:((event:MessageEvent)=>void)|null};
function publish(force=false) {
  const now=performance.now();
  if (visible && (force || now-lastFull>=1000)) {
    lastFull=now;
    overview=projectClientSnapshot(state,view(state));
    scope.postMessage({type:'full',generation,snapshot:overview,behindMs:Math.max(0,origin+now-started-state.wallAt)});
  }
  if (watching && visible && (force || now-lastFrame>=95)) {
    lastFrame=now;
    const snapshot:any=projectCombatPlayback(state,battlePresentation(state),state.wallAt);
    if(state.arena)snapshot.view.arena=arenaView(state);
    if(overview?.view.guildRaid)snapshot.view.guildRaid=overview.view.guildRaid;
    scope.postMessage({type:'frame',generation,snapshot});
  }
}
function tick() {
  if (!running) return;
  try {
    const now=performance.now(), target=Math.max(state.wallAt,Math.min(deadline,Math.floor(origin+now-started)));
    const encounter=state.combat?.id, activity=state.activity.type;
    // Bounded slices yield to messages and checkpoints during offline catch-up.
    const result=advance(state,target,{maxTicks:20});
    state=result.state;
    const boundary=encounter!==state.combat?.id || activity!==state.activity.type;
    publish(boundary);
    if (boundary) scope.postMessage({type:'boundary',generation});
    timer=setTimeout(tick,result.complete?(visible?50:1000):0);
  } catch(error) {
    running=false;
    scope.postMessage({type:'error',generation,error:error instanceof Error?error.message:'本地模拟失败'});
  }
}
scope.onmessage=({data})=>{
  if (data.type==='start') {
    clearTimeout(timer);
    if (data.contentVersion!==manifest.contentVersion) {
      scope.postMessage({type:'error',generation:data.generation,error:'游戏规则已更新，请刷新页面'});return;
    }
    generation=data.generation;state=data.state;origin=data.serverNow;deadline=data.deadline;started=performance.now();
    lastFull=lastFrame=0;running=true;tick();
  } else if (data.type==='checkpoint') {
    if(data.pause){clearTimeout(timer);running=false;}
    // advance returns a new state; this checkpoint remains immutable while the
    // next ticks run. Saving over the network never stalls the combat animation.
    submitted=state;
    scope.postMessage({type:'checkpoint',generation,requestId:data.requestId,state});
  } else if (data.type==='ack' && data.generation===generation) {
    state=reconcileItemIdentities(state,submitted,data.state);submitted=null;deadline=data.deadline;
  } else if (data.type==='resume' && state && data.generation===generation) {
    if(!running){running=true;tick();}
  } else if (data.type==='visibility') {
    visible=data.visible;watching=data.watching;
  } else if (data.type==='stop') {clearTimeout(timer);running=false;}
};
