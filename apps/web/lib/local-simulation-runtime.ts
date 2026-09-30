import {isContentPending,resolveContent,contentStats,beginContentScope,endContentScope} from '../../../packages/game-domain/src/rules/runtime-content.js';
import type {CombatPolicyRequest} from '../../../packages/contracts/src/combat-policy.ts';
import {CombatStreamSender,eventBatch} from '../../../packages/sim-core/src/combat-stream.js';
import {setCombatPolicyHost,receiveCombatIntent} from '../../../packages/game-domain/src/rules/combat-policy.js';
import {projectCombatObservation} from '../../../packages/game-domain/src/rules/combat-observation.js';
import {combatCommandView} from '../../../packages/game-domain/src/rules/combat-command.js';
import {act, advanceOwned, view} from '../../../packages/game-domain/src/rules/engine.js';
import {raidCommandView} from '../../../packages/game-domain/src/rules/raid-command.js';
import {arenaView} from '../../../packages/game-domain/src/rules/arena.js';
import {battlegroundView} from '../../../packages/game-domain/src/rules/battleground.js';
import {battlePresentation} from '../../../packages/game-domain/src/rules/battle-presentation.js';
import {goldRaidView} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {projectClientSnapshot, createCombatFrameProjector} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import manifest from '../../../packages/game-data/manifest.json';
import {remapItemReferences} from '../../../packages/sim-core/src/item-identities.js';
import {projectLocalCheckpoint} from '../../../packages/game-domain/src/rules/local-checkpoint.js';
import {isLocalCombatAction} from './local-combat-actions';

let state:any, timer:ReturnType<typeof setTimeout>|undefined, origin=0, started=0, deadline=0;
let lastFull=0, lastFrame=0, lastRaid=0, running=false, visible=true, watching=true, generation='';
const projectFrame=createCombatFrameProjector();
const displayStream=new CombatStreamSender(),policyStream=new CombatStreamSender();
let displayBaseline=true,eventThrough=0,eventSentThrough=0,policyPort:MessagePort|null=null,policyReady=false;
let policyRequests=new Map<string,CombatPolicyRequest>(),policyCpuMs=0,profile=false,policyErrors=0,policyTimeouts=0,lastPolicyError='';
const policyTransfers={packets:0,numericBytes:0,maxNumericBytes:0};
const policyHost={
 available:()=>policyReady&&policyStream.ready,
 request:(_state:any,request:CombatPolicyRequest)=>{policyRequests.set(request.actorId,request);},
 timeout:()=>{policyTimeouts++;policyReady=false;policyRequests.clear();},
};
function publishPolicy(){
 if(!state?.combat||!policyReady||!policyStream.ready||!policyRequests.size)return;
 const requests=[...policyRequests.values()];policyRequests.clear();
 const observation=projectCombatObservation(state);
 const packet=policyStream.encode(observation);
 if(profile&&packet?.buffer){policyTransfers.packets++;policyTransfers.numericBytes+=packet.buffer.byteLength;policyTransfers.maxNumericBytes=Math.max(policyTransfers.maxNumericBytes,packet.buffer.byteLength);}
 emit(policyPort!,{type:'observation',generation,packet,requests},packet?.buffer?[packet.buffer]:[]);
}
let overview:any=null;
let raidView:any=null;
let commandCheckpoint:{requestId:string;target:number}|null=null;
let actions:{requestId:string;target:number;command:any}[]=[];
const host = globalThis as unknown as {postMessage:(message:unknown,transfer?:Transferable[])=>void;onmessage:((event:MessageEvent)=>void)|null};
let batch:{target:{postMessage:Function};message:unknown;transfer?:Transferable[]}[]|null=null,loading=false;
function emit(target:{postMessage:Function},message:unknown,transfer?:Transferable[]){if(batch)batch.push({target,message,transfer});else target.postMessage(message,transfer);}
const scope={postMessage:(message:unknown,transfer?:Transferable[])=>emit(host,message,transfer)};
function currentTarget(){return Math.max(state.wallAt,Math.min(deadline,Math.floor(origin+performance.now()-started)));}
function checkpoint(requestId:string){
  scope.postMessage({type:'checkpoint',generation,requestId,state:projectLocalCheckpoint(state)});
}
// A periodic capture can also encounter a newly acquired content reference.
// Its projection is read-only; retry against the latest committed state.
function captureCurrent(requestId:string,requestedGeneration=generation){
  if(generation!==requestedGeneration||!state)return;
  try{checkpoint(requestId);}catch(error){
    if(isContentPending(error)){
      scope.postMessage({type:'contentLoading',generation});
      resolveContent(error).then(()=>captureCurrent(requestId,requestedGeneration)).catch(failure=>{
        if(generation===requestedGeneration)scope.postMessage({type:'error',generation,code:(failure as {code?:string})?.code||'LOCAL_CONTENT',error:failure instanceof Error?failure.message:'冒险资料加载失败'});
      });
    }else scope.postMessage({type:'error',generation,error:error instanceof Error?error.message:'保存冒险进度失败'});
  }
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
  if (watching && visible && displayStream.ready && (force || command || now-lastFrame>=95)) {
    lastFrame=now;
    const snapshot:any=projectFrame(state,battlePresentation(state),state.wallAt,force);
    if(state.arena)snapshot.view.arena=arenaView(state);
    if(state.battleground)snapshot.view.battleground=battlegroundView(state);
    if(force||command||!raidView||now-lastRaid>=1000){
      lastRaid=now;raidView={combatCommand:combatCommandView(state),raidCommand:raidCommandView(state)};
      if(state.goldRaid)raidView.goldRaid=goldRaidView(state);
    }
    Object.assign(snapshot.view,raidView);
    const events=eventBatch(state.logs,eventThrough);eventSentThrough=events.through;
    if(snapshot.player)delete snapshot.player.logs;
    const packet=displayStream.encode(snapshot,{baseline:displayBaseline||force});displayBaseline=false;
    scope.postMessage({type:'frame',generation,packet,events,behindMs:Math.max(0,origin+performance.now()-started-state.wallAt)},packet?.buffer?[packet.buffer]:[]);
  }
}
function tick() {
  if (!running || loading) return;
  beginContentScope();
  const previous=state,previousActions=[...actions],previousCheckpoint=commandCheckpoint;
  const previousGeneration=generation;
  const tickStarted=performance.now();
  try {
    state={...structuredClone({...state,battleHistory:[]}),battleHistory:[...(state.battleHistory||[])]};batch=[];
    // A manual command waits for one fixed instant, not a moving wall clock.
    // Continue bounded catch-up even when the tab is hidden or a retry stopped it.
    const action=actions[0];
    const target=action?.target??commandCheckpoint?.target??currentTarget();
    const before=boundaryKey();
    // Bounded slices yield to messages and checkpoints during offline catch-up.
    setCombatPolicyHost(state,policyReady?policyHost:null);
    const result=advanceOwned(state,target,{maxTicks:policyReady?1:20});
    state=result.state;publishPolicy();
    if(action){
      scope.postMessage({type:'commandProgress',generation,requestId:action.requestId,wallAt:state.wallAt});
      if(result.complete){
        actions.shift();
        try {
          // act clones before applying the shared rule validation. A rejected
          // command cannot partially mutate the running simulation.
          state=act(state,action.command,state.wallAt);
          // Boundaries are published below; live orders only need a small frame.
          scope.postMessage({type:'commandResult',generation,requestId:action.requestId});
          if(before===boundaryKey())publish(!watching,true);
        } catch(error) {
          if(isContentPending(error))throw error;
          scope.postMessage({type:'commandResult',generation,requestId:action.requestId,error:error instanceof Error?error.message:'操作失败'});
        }
      }
    }
    if(commandCheckpoint){
      scope.postMessage({type:'checkpointProgress',generation,requestId:commandCheckpoint.requestId,wallAt:state.wallAt});
      if(result.complete && !actions.length && state.wallAt>=commandCheckpoint.target){
        const requestId=commandCheckpoint.requestId;commandCheckpoint=null;running=false;
        publish(true);checkpoint(requestId);flush();return;
      }
    }
    const boundary=before!==boundaryKey();
    publish(boundary);
    if(profile)scope.postMessage({content:contentStats(),type:'diagnostics',generation,clock:state.clock,active:!!state.combat,policyReady,policyCpuMs,policyTransfers,policyErrors,policyTimeouts,lastPolicyError,tickMs:performance.now()-tickStarted,behindMs:Math.max(0,currentTarget()-state.wallAt),metrics:state.combat?.policy?.metrics,alive:[state,...(state.party||[])].filter(c=>c.hp>0).length});
    if (boundary) scope.postMessage({type:'boundary',generation});
    // Include computation in the cadence instead of adding another 50 ms after
    // every slice; otherwise busy fights stretch 100 ms playback to 150–200 ms.
    flush();
    timer=setTimeout(tick,result.complete&&!actions.length?(visible?Math.max(0,50-(performance.now()-tickStarted)):1000):0);
  } catch(error) {
    batch=null;state=previous;actions=previousActions;commandCheckpoint=previousCheckpoint;
    overview=raidView=null;lastFull=lastFrame=lastRaid=0;displayStream.rebase();policyStream.rebase();displayBaseline=true;policyRequests.clear();
    if(isContentPending(error)){
      running=true;loading=true;scope.postMessage({type:'contentLoading',generation});
      resolveContent(error).then(()=>{loading=false;if(generation===previousGeneration&&running)tick();else if(running)tick();}).catch(failure=>{
        endContentScope();loading=false;if(generation!==previousGeneration){if(running)tick();return;}running=false;
        scope.postMessage({type:'error',generation,code:(failure as {code?:string})?.code||'LOCAL_CONTENT',error:failure instanceof Error?failure.message:'冒险资料加载失败'});
      });return;
    }
    endContentScope();running=false;
    scope.postMessage({type:'error',generation,error:error instanceof Error?error.message:'本地模拟失败'});
  }
}
function flush(){endContentScope();const messages=batch;batch=null;for(const {target,message,transfer}of messages||[])target.postMessage(message,transfer);}
host.onmessage=({data})=>{
  if(data.type==='policyPort'){
    policyPort?.close();policyPort=data.port;
    policyPort!.onmessage=({data:message})=>{
      if(message.type==='ready'){policyReady=true;return;}
      if(message.generation!==generation)return;
      if(message.type==='baseline'){policyStream.rebase();policyRequests.clear();return;}
      if(message.type==='policyError'){policyErrors++;lastPolicyError=message.error;policyReady=false;policyRequests.clear();return;}
      if(message.type==='intents'){
        if(!policyStream.acknowledge(message.sequence,message.buffer))return;
        policyCpuMs+=message.computeMs||0;
        if(running&&state?.combat)for(const envelope of message.results)receiveCombatIntent(state,envelope);
      }
    };policyPort!.start();return;
  }
  if(data.type==='policyUnavailable'){policyReady=false;policyRequests.clear();return;}
  if(data.type==='frameAck'&&data.generation===generation){if(displayStream.acknowledge(data.sequence,data.buffer))eventThrough=eventSentThrough;return;}
  if(data.type==='frameBaseline'&&data.generation===generation){displayStream.rebase();displayBaseline=true;lastFrame=-Infinity;return;}
  if (data.type==='start') {
    clearTimeout(timer);commandCheckpoint=null;actions=[];
    if (data.contentVersion!==manifest.contentVersion) {
      scope.postMessage({type:'error',generation:data.generation,code:'CONTENT_VERSION',error:'游戏规则已更新，请刷新页面'});return;
    }
    displayStream.reset();policyStream.reset();displayBaseline=true;eventThrough=0;policyRequests.clear();policyPort?.postMessage({type:'reset'});
    policyCpuMs=policyErrors=policyTimeouts=0;lastPolicyError='';policyTransfers.packets=policyTransfers.numericBytes=policyTransfers.maxNumericBytes=0;
    profile=!!data.profile;generation=data.generation;state=data.state;deadline=data.deadline;started=performance.now();
    // Messages can wait for a cold Worker to download and initialize. Include
    // that delay in the server-anchored clock, without using the device clock.
    const startupDelay=Number.isFinite(data.sentAt)?Math.max(0,performance.timeOrigin+started-data.sentAt):0;
    origin=data.serverNow+startupDelay;
    lastFull=lastFrame=lastRaid=0;overview=raidView=null;running=true;
    // Startup acknowledgement does not depend on visibility or expensive views.
    scope.postMessage({type:'ready',generation});tick();
  } else if (data.type==='command' && data.generation===generation) {
    const command=data.command;
    const authorized=state && (!command.characterId||command.characterId===state.id) &&
      (!command.actorId||command.actorId===state.id) && (!command.casterId||command.casterId===state.id);
    const goldAllowed=!state?.goldRaid?.active||['cast','combatCommand','raidOrder','abandonCombat'].includes(command.type);
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
    captureCurrent(data.requestId);
  } else if (data.type==='ack' && data.generation===generation) {
    remapItemReferences(state,new Map(data.itemIds));deadline=data.deadline;
    if(data.serverBuffs){
      for(const actor of [state,...state.party||[]])actor.serverBuffs=data.serverBuffs[actor.id]||[];
      lastFull=-Infinity;
    }
  } else if (data.type==='resume' && state && data.generation===generation) {
    if(!running){running=true;tick();}
  } else if (data.type==='visibility') {
    if(data.visible&&(!visible||watching&&!data.watching))lastFull=-Infinity;
    visible=data.visible;watching=data.watching;
  } else if (data.type==='stop') {clearTimeout(timer);running=false;commandCheckpoint=null;actions=[];}
};
