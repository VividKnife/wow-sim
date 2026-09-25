import {combatCommandView} from '../../../packages/game-domain/src/rules/combat-command.js';
import {advance, view} from '../../../packages/game-domain/src/rules/engine.js';
import {arenaView} from '../../../packages/game-domain/src/rules/arena.js';
import {battlegroundView} from '../../../packages/game-domain/src/rules/battleground.js';
import {battlePresentation} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {guildRaidView} from '../../../packages/game-domain/src/rules/guild-raid.js';
import {goldRaidView} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {projectClientSnapshot, projectCombatPlayback} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import manifest from '../../../packages/game-data/manifest.json';
import {reconcileItemIdentities} from './local-item-identities.js';

let state:any, timer:ReturnType<typeof setTimeout>|undefined, origin=0, started=0, deadline=0;
let lastFull=0, lastFrame=0, lastRaid=0, running=false, visible=true, watching=true, generation='';
let overview:any=null;
let raidView:any=null;
let submitted:any=null;
let commandCheckpoint:{requestId:string;target:number}|null=null;
const scope = globalThis as unknown as {postMessage:(message:unknown)=>void;onmessage:((event:MessageEvent)=>void)|null};
function currentTarget(){return Math.max(state.wallAt,Math.min(deadline,Math.floor(origin+performance.now()-started)));}
function checkpoint(requestId:string){
  submitted=state;
  scope.postMessage({type:'checkpoint',generation,requestId,state});
}
function publish(force=false) {
  const now=performance.now();
  const observingCombat=watching&&(state.combat||['countdown','combat'].includes(state.arena?.phase)||['countdown','combat'].includes(state.battleground?.phase));
  // A full view includes trainers, inventory, every PvP build and all skills.
  // The battle UI discards it during a fight. Keep that work off the frame path;
  // publish it on encounter boundaries and as soon as the overview is visible.
  if (visible && (force || !overview || !observingCombat&&now-lastFull>=1000)) {
    lastFull=now;
    overview=projectClientSnapshot(state,view(state));
    scope.postMessage({type:'full',generation,snapshot:overview,behindMs:Math.max(0,origin+now-started-state.wallAt)});
  }
  if (watching && visible && (force || now-lastFrame>=95)) {
    lastFrame=now;
    const snapshot:any=projectCombatPlayback(state,battlePresentation(state),state.wallAt);
    if(state.arena)snapshot.view.arena=arenaView(state);
    if(state.battleground)snapshot.view.battleground=battlegroundView(state);
    if(force||!raidView||now-lastRaid>=1000){
      lastRaid=now;raidView={combatCommand:combatCommandView(state)};
      if(state.guildRaid)raidView.guildRaid=guildRaidView(state);
      if(state.goldRaid)raidView.goldRaid=goldRaidView(state);
    }
    Object.assign(snapshot.view,raidView);
    scope.postMessage({type:'frame',generation,snapshot,behindMs:Math.max(0,origin+performance.now()-started-state.wallAt)});
  }
}
function tick() {
  if (!running) return;
  const tickStarted=performance.now();
  try {
    // A manual command waits for one fixed instant, not a moving wall clock.
    // Continue bounded catch-up even when the tab is hidden or a retry stopped it.
    const target=commandCheckpoint?.target??currentTarget();
    const encounter=state.combat?.id, activity=state.activity.type;
    // Bounded slices yield to messages and checkpoints during offline catch-up.
    const result=advance(state,target,{maxTicks:20});
    state=result.state;
    if(commandCheckpoint){
      scope.postMessage({type:'checkpointProgress',generation,requestId:commandCheckpoint.requestId,wallAt:state.wallAt});
      if(result.complete){
        const requestId=commandCheckpoint.requestId;commandCheckpoint=null;running=false;
        publish(true);checkpoint(requestId);return;
      }
    }
    const boundary=encounter!==state.combat?.id || activity!==state.activity.type;
    publish(boundary);
    if (boundary) scope.postMessage({type:'boundary',generation});
    // Include computation in the cadence instead of adding another 50 ms after
    // every slice; otherwise busy fights stretch 100 ms playback to 150–200 ms.
    timer=setTimeout(tick,result.complete?(visible?Math.max(0,50-(performance.now()-tickStarted)):1000):0);
  } catch(error) {
    running=false;
    scope.postMessage({type:'error',generation,error:error instanceof Error?error.message:'本地模拟失败'});
  }
}
scope.onmessage=({data})=>{
  if (data.type==='start') {
    clearTimeout(timer);commandCheckpoint=null;submitted=null;
    if (data.contentVersion!==manifest.contentVersion) {
      scope.postMessage({type:'error',generation:data.generation,error:'游戏规则已更新，请刷新页面'});return;
    }
    generation=data.generation;state=data.state;origin=data.serverNow;deadline=data.deadline;started=performance.now();
    lastFull=lastFrame=lastRaid=0;overview=raidView=null;running=true;tick();
  } else if (data.type==='checkpoint') {
    if(data.generation!==generation||!state)return;
    if(data.pause){
      clearTimeout(timer);commandCheckpoint={requestId:data.requestId,target:currentTarget()};running=true;tick();return;
    }
    // advance returns a new state; this checkpoint remains immutable while the
    // next ticks run. Saving over the network never stalls the combat animation.
    checkpoint(data.requestId);
  } else if (data.type==='ack' && data.generation===generation) {
    state=reconcileItemIdentities(state,submitted,data.state);submitted=null;deadline=data.deadline;
  } else if (data.type==='resume' && state && data.generation===generation) {
    if(!running){running=true;tick();}
  } else if (data.type==='visibility') {
    if(data.visible&&(!visible||watching&&!data.watching))lastFull=-Infinity;
    visible=data.visible;watching=data.watching;
  } else if (data.type==='stop') {clearTimeout(timer);running=false;commandCheckpoint=null;}
};
