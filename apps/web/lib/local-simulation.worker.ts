import {combatCommandView} from '../../../packages/game-domain/src/rules/combat-command.js';
import {act, advanceOwned, view} from '../../../packages/game-domain/src/rules/engine.js';
import {raidCommandView} from '../../../packages/game-domain/src/rules/raid-command.js';
import {arenaView} from '../../../packages/game-domain/src/rules/arena.js';
import {battlegroundView} from '../../../packages/game-domain/src/rules/battleground.js';
import {battlePresentation} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {goldRaidView} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {projectClientSnapshot, projectCombatPlayback} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import manifest from '../../../packages/game-data/manifest.json';
import {remapItemReferences} from './local-item-identities.js';
import {projectLocalCheckpoint} from '../../../packages/game-domain/src/rules/local-checkpoint.js';
import {isLocalCombatAction} from './local-combat-actions';

let state:any, timer:ReturnType<typeof setTimeout>|undefined, origin=0, started=0, deadline=0;
let lastFull=0, lastFrame=0, lastRaid=0, running=false, visible=true, watching=true, generation='';
let overview:any=null;
let raidView:any=null;
let commandCheckpoint:{requestId:string;target:number}|null=null;
let actions:{requestId:string;target:number;command:any}[]=[];
const scope = globalThis as unknown as {postMessage:(message:unknown)=>void;onmessage:((event:MessageEvent)=>void)|null};
function currentTarget(){return Math.max(state.wallAt,Math.min(deadline,Math.floor(origin+performance.now()-started)));}
function checkpoint(requestId:string){
  scope.postMessage({type:'checkpoint',generation,requestId,state:projectLocalCheckpoint(state)});
}
function boundaryKey(){return [state.combat?.id,state.activity.type,state.arena?.id,state.arena?.phase,state.battleground?.id,state.battleground?.phase].join(':');}
function publish(force=false, command=false) {
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
  if (watching && visible && (force || command || now-lastFrame>=95)) {
    lastFrame=now;
    const snapshot:any=projectCombatPlayback(state,battlePresentation(state),state.wallAt);
    if(state.arena)snapshot.view.arena=arenaView(state);
    if(state.battleground)snapshot.view.battleground=battlegroundView(state);
    if(force||command||!raidView||now-lastRaid>=1000){
      lastRaid=now;raidView={combatCommand:combatCommandView(state),raidCommand:raidCommandView(state)};
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
    const action=actions[0];
    const target=action?.target??commandCheckpoint?.target??currentTarget();
    const before=boundaryKey();
    // Bounded slices yield to messages and checkpoints during offline catch-up.
    const result=advanceOwned(state,target,{maxTicks:20});
    state=result.state;
    if(action){
      scope.postMessage({type:'commandProgress',generation,requestId:action.requestId,wallAt:state.wallAt});
      if(result.complete){
        actions.shift();
        try {
          // act clones before applying the shared rule validation. A rejected
          // command cannot partially mutate the running simulation.
          state=act(state,action.command,state.wallAt);
          // Boundaries are published below; live orders only need a small frame.
          if(before===boundaryKey())publish(!watching,true);
          scope.postMessage({type:'commandResult',generation,requestId:action.requestId});
        } catch(error) {
          scope.postMessage({type:'commandResult',generation,requestId:action.requestId,error:error instanceof Error?error.message:'操作失败'});
        }
      }
    }
    if(commandCheckpoint){
      scope.postMessage({type:'checkpointProgress',generation,requestId:commandCheckpoint.requestId,wallAt:state.wallAt});
      if(result.complete && !actions.length && state.wallAt>=commandCheckpoint.target){
        const requestId=commandCheckpoint.requestId;commandCheckpoint=null;running=false;
        publish(true);checkpoint(requestId);return;
      }
    }
    const boundary=before!==boundaryKey();
    publish(boundary);
    if (boundary) scope.postMessage({type:'boundary',generation});
    // Include computation in the cadence instead of adding another 50 ms after
    // every slice; otherwise busy fights stretch 100 ms playback to 150–200 ms.
    timer=setTimeout(tick,result.complete&&!actions.length?(visible?Math.max(0,50-(performance.now()-tickStarted)):1000):0);
  } catch(error) {
    running=false;
    scope.postMessage({type:'error',generation,error:error instanceof Error?error.message:'本地模拟失败'});
  }
}
scope.onmessage=({data})=>{
  if (data.type==='start') {
    clearTimeout(timer);commandCheckpoint=null;actions=[];
    if (data.contentVersion!==manifest.contentVersion) {
      scope.postMessage({type:'error',generation:data.generation,error:'游戏规则已更新，请刷新页面'});return;
    }
    generation=data.generation;state=data.state;origin=data.serverNow;deadline=data.deadline;started=performance.now();
    lastFull=lastFrame=lastRaid=0;overview=raidView=null;running=true;tick();
  } else if (data.type==='command' && data.generation===generation) {
    const command=data.command;
    const authorized=state && (!command.characterId||command.characterId===state.id) &&
      (!command.actorId||command.actorId===state.id) && (!command.casterId||command.casterId===state.id);
    const goldAllowed=!state?.goldRaid?.active||['cast','raidOrder','abandonCombat'].includes(command.type);
    if(!running||commandCheckpoint||!authorized||!goldAllowed||!isLocalCombatAction(command)||actions.length>=32){
      scope.postMessage({type:'commandResult',generation,requestId:data.requestId,error:'当前状态不能执行此本地战斗操作'});return;
    }
    actions.push({requestId:data.requestId,command,target:currentTarget()});
    clearTimeout(timer);tick();
  } else if (data.type==='checkpoint') {
    if(data.generation!==generation||!state)return;
    if(data.pause){
      clearTimeout(timer);commandCheckpoint={requestId:data.requestId,target:currentTarget()};running=true;tick();return;
    }
    // Capture an immutable copy while the exclusively owned state keeps moving.
    checkpoint(data.requestId);
  } else if (data.type==='ack' && data.generation===generation) {
    remapItemReferences(state,new Map(data.itemIds));deadline=data.deadline;
  } else if (data.type==='resume' && state && data.generation===generation) {
    if(!running){running=true;tick();}
  } else if (data.type==='visibility') {
    if(data.visible&&(!visible||watching&&!data.watching))lastFull=-Infinity;
    visible=data.visible;watching=data.watching;
  } else if (data.type==='stop') {clearTimeout(timer);running=false;commandCheckpoint=null;actions=[];}
};
