import {CombatStreamReceiver,hydrateCombatFrame} from '../../../packages/sim-core/src/combat-stream.js';
import {saveFetch} from './save-fetch';
import {publishLocalCombat} from './local-combat-store';
import {remapItemReferences} from '../../../packages/sim-core/src/item-identities.js';
import {isLocalCombatAction} from './local-combat-actions';
import {syncErrorMessage} from './game-response.js';
import {usePolicyWorker,SIMULATION_STARTUP_TIMEOUT_MS} from './simulation-resources.js';

type Options = {onFull:(snapshot:any)=>void;onStatus:(message:string)=>void;refresh:()=>Promise<unknown>};
/** One owner, one worker, one in-flight mutation. Routine checkpoints reconcile
 * canonical item IDs without pausing the running simulation. Failed uploads
 * retain the exact request body and requestId for an idempotent retry. */
export class LocalSimulationClient {
  private worker:Worker|undefined;
  private policyWorker:Worker|undefined;
  private workerReady=false;
  private frames=new CombatStreamReceiver();
  private combatEvents:any[]=[];
  private presentation={visible:true,watching:false};
  private clientId=crypto.randomUUID();
  private desired:any=null;
  private session:any=null;
  private pending:any=null;
  private snapshot:any=null;
  private behindMs=0;
  private syncStatus='';
  private itemIds=new Map<string,string>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private tail:Promise<any>=Promise.resolve();
  private stopped=false;
  private commandPending=0;
  private capture:((state:any)=>void)|null=null;
  private captureReject:((reason:Error)=>void)|null=null;
  private captureId:string|null=null;
  private captureProgress:((wallAt:number,loading?:boolean)=>void)|null=null;
  private failure:Error|null=null;
  private failed=false;
  private suspended=false;
  private observedSession:string|null=null;
  private workerFailure:Error|null=null;
  private recoveryAttempts=0;
  private starting:{resolve:()=>void;reject:(error:Error)=>void}|null=null;
  private reconcileNeeded=false;
  private reconciling=false;
  private backgroundQueued=false;
  private actions=new Map<string,{resolve:()=>void;reject:(error:Error)=>void;progress:(wallAt:number,loading?:boolean)=>void}>();
  constructor(private options:Options) {}
  private prepareWorker() {
    if(this.worker)return;
    this.options.onStatus('正在准备冒险，首次加载可能需要一些时间…');
    const worker=this.worker=new Worker(new URL('./local-simulation.worker.ts',import.meta.url),{type:'module'});
    this.workerReady=false;
    this.frames.reset();this.combatEvents=[];
    if(usePolicyWorker()&&typeof MessageChannel!=='undefined'){
      try{
        const policy=this.policyWorker=new Worker(new URL('./combat-policy.worker.ts',import.meta.url),{type:'module'});
        const channel=new MessageChannel();
        worker.postMessage({type:'policyPort',port:channel.port1},[channel.port1]);
        policy.postMessage({type:'connect',port:channel.port2},[channel.port2]);
        policy.onerror=()=>{policy.terminate();if(this.policyWorker===policy)this.policyWorker=undefined;worker.postMessage({type:'policyUnavailable'});};
      }catch{worker.postMessage({type:'policyUnavailable'});}
    }
    worker.onmessage=({data})=>{
      if (worker!==this.worker || data.generation!==this.session?.session.id || this.suspended) return;
      if(data.type==='contentLoading'){this.options.onStatus('正在加载当前冒险所需的资料…');this.captureProgress?.(0,true);for(const action of this.actions.values())action.progress(0,true);}
      if (data.type==='ready') {
        this.workerReady=true;
        this.starting?.resolve();
        this.options.onStatus(this.syncStatus);
      }
      if (data.type==='frame') {
        this.behindMs=data.behindMs;
        try{
          const decoded=this.frames.apply(data.packet);
          if(decoded.status==='baseline-required'){worker.postMessage({type:'frameBaseline',generation:data.generation});return;}
          if(decoded.status==='applied'){
            if(data.events?.gap)this.combatEvents=[];
            const after=this.combatEvents.at(-1)?.id||0;
            this.combatEvents=[...this.combatEvents,...(data.events?.events||[]).filter((event:any)=>event.id>after)].slice(-2000);
            const snapshot=hydrateCombatFrame(decoded.snapshot);
            publishLocalCombat({...snapshot,player:{...snapshot.player,logs:this.combatEvents}});
          }
          const buffer=data.packet.buffer;
          worker.postMessage({type:'frameAck',generation:data.generation,sequence:data.packet.sequence,buffer},buffer?[buffer]:[]);
        }catch{worker.postMessage({type:'frameBaseline',generation:data.generation});}
        this.options.onStatus(data.behindMs>2000?(this.commandPending?'正在结算离线冒险，完成后自动执行操作…':'正在结算离线冒险…'):this.syncStatus);
      }
      if (data.type==='full') {
        this.behindMs=data.behindMs;
        this.snapshot=data.snapshot;this.options.onFull(data.snapshot);
        this.options.onStatus(data.behindMs>2000?(this.commandPending?'正在结算离线冒险，完成后自动执行操作…':'正在结算离线冒险…'):this.syncStatus);
      }
      if (data.requestId===this.captureId) {
        if (data.type==='checkpointProgress')this.captureProgress?.(data.wallAt);
        if (data.type==='checkpoint')this.capture?.(data.state);
      }
      if (data.type==='boundary') this.schedule(500);
      const action=this.actions.get(data.requestId);
      if(data.type==='commandProgress')action?.progress(data.wallAt);
      if(data.type==='commandResult') {
        if(data.error)action?.reject(new Error(data.error));else action?.resolve();
      }
      if (data.type==='error') {
        if(data.code==='LOCAL_CONTENT_NETWORK')this.breakWorker('冒险资料下载暂时中断');
        else this.fail(Object.assign(new Error(data.error),{code:data.code}));
      }
    };
    worker.onerror=(event)=>{
      if(worker!==this.worker)return;
      console.error('Local simulation worker failed',event.message,event.filename,event.lineno);
      this.breakWorker('本地战斗引擎加载失败');
    };
    worker.onmessageerror=()=>{if(worker===this.worker)this.breakWorker('本地战斗引擎消息读取失败');};
    worker.postMessage({type:'visibility',...this.presentation});
  }
  private breakWorker(message:string) {
    const error=Object.assign(new Error(`${message}，正在恢复已保存进度，请稍后重试操作。`),{code:'LOCAL_WORKER'});
    this.workerFailure=error;
    this.worker?.terminate();this.policyWorker?.terminate();this.policyWorker=undefined;this.worker=undefined;
    this.starting?.reject(error);this.captureReject?.(error);
    for(const action of this.actions.values())action.reject(error);
    this.snapshot=null;publishLocalCombat(null);
    this.options.onStatus(error.message);
    this.schedule(1000);
    return error;
  }
  private async recoverWorker() {
    if(!this.workerFailure)return;
    if(this.recoveryAttempts>=2){
      const error=Object.assign(new Error('冒险引擎恢复失败，已停止重试。请刷新页面重新加载。'),{code:'LOCAL_WORKER_FAILED'});
      this.fail(error);throw error;
    }
    // A lost upload ACK may already have committed. Retry its exact receipt
    // before reclaiming; never discard or submit the same rewards a second time.
    if(this.pending)await this.checkpoint();
    this.recoveryAttempts++;
    this.clear();this.workerFailure=null;
    this.syncStatus='正在恢复已保存的冒险进度…';this.options.onStatus(this.syncStatus);
    await this.claim();
  }
  private fail(error:Error) {
    this.failed=true;this.failure=error;clearTimeout(this.timer);this.captureReject?.(error);
    this.starting?.reject(error);this.worker?.terminate();this.policyWorker?.terminate();this.policyWorker=undefined;this.worker=undefined;
    for(const action of this.actions.values())action.reject(error);
    this.options.onStatus(error.message);
  }
  get active() {return !!this.session;}
  get blocked() {return this.failed||!!this.workerFailure||this.reconcileNeeded;}
  get presenting() {return !!this.session&&!this.commandPending&&!this.blocked;}
  get latest() {return this.presenting?this.snapshot:null;}
  get ownerId() {return this.session?.ownerId;}
  canAct(command:any) {
    return !!this.session && !this.stopped && !this.suspended && !this.blocked && !this.starting && !this.commandPending &&
      (!command.characterId||command.characterId===this.session.state.id) && isLocalCombatAction(command);
  }
  async act(command:any):Promise<boolean> {
    if(!this.canAct(command))return false;
    // Live input bypasses the upload queue. A slow checkpoint ACK must not add
    // network latency to a cast, interrupt, focus target or battleground order.
    const requestId=crypto.randomUUID(),generation=this.session.session.id;
    await new Promise<void>((resolve,reject)=>{
      let timeout:ReturnType<typeof setTimeout>,lastProgress=-Infinity;
      const finish=(error?:Error)=>{clearTimeout(timeout);this.actions.delete(requestId);if(error)reject(error);else resolve();};
      const arm=(loading=false)=>{clearTimeout(timeout);timeout=setTimeout(()=>this.breakWorker('本地战斗操作响应超时'),loading?SIMULATION_STARTUP_TIMEOUT_MS:15000);};
      this.actions.set(requestId,{resolve:()=>finish(),reject:finish,progress:(wallAt,loading)=>{if(loading||wallAt>lastProgress){if(!loading)lastProgress=wallAt;arm(loading);}}});
      arm();this.worker!.postMessage({type:'command',generation,requestId,command});
    });
    return true;
  }
  observe(manifest:any, contentVersion:string, characterId:string) {
    if(this.stopped)return;
    const changed=this.desired?.ownerId!==manifest?.ownerId || this.desired?.characterId!==characterId || this.desired?.contentVersion!==contentVersion;
    this.desired=manifest?{...manifest,contentVersion,characterId}:null;
    if(this.reconciling)return;
    // Ignore a poll which started before our claim. A different non-null token
    // means another client/command won; reacquire from persisted state.
    if(manifest?.sessionId && this.session && manifest.sessionId!==this.session.session.id && manifest.sessionId!==this.observedSession){
      this.observedSession=manifest.sessionId;
      void this.enqueue(async()=>{this.clear();await this.claim();}).catch(error=>this.report(error));
    } else if(changed && !this.commandPending) {
      void this.enqueue(async()=>{
        // An authoritative snapshot can end an expired activity. Do not upload
        // its discarded timeline or let that rejection block the fresh state.
        if(this.session&&!this.blocked&&this.session.contentVersion===contentVersion&&
          (manifest||this.session.characterId!==characterId))await this.checkpoint();
        this.clear();this.failed=false;this.failure=null;this.workerFailure=null;this.recoveryAttempts=0;this.reconcileNeeded=false;
        await this.claim();
      }).catch(error=>this.report(error));
    }
  }
  visibility(visible:boolean,watching:boolean) {
    this.presentation={visible,watching};
    this.worker?.postMessage({type:'visibility',visible,watching});
    if(visible&&this.suspended){this.suspended=false;this.clear();this.schedule(0);}
  }
  release() {
    if(!this.session||this.suspended)return;
    for(const action of this.actions.values())action.reject(new Error('本地会话已关闭'));
    this.suspended=true;clearTimeout(this.timer);this.worker?.postMessage({type:'stop'});
    const error=new Error('本地会话已关闭');this.starting?.reject(error);this.captureReject?.(error);
    const input={type:'release',ownerId:this.session.ownerId,characterId:this.session.characterId,contentVersion:this.session.contentVersion,
      clientId:this.clientId,sessionId:this.session.session.id,requestId:crypto.randomUUID()};
    void saveFetch('/api/game/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),keepalive:true}).catch(()=>{});
  }
  private enqueue<T>(work:()=>Promise<T>):Promise<T> {
    const result=this.tail.then(work);this.tail=result.catch(()=>{});return result;
  }
  private async request(input:any) {
    const response=await saveFetch('/api/game/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'无法保存本地进度'),{status:response.status,code:data.code});
    return data;
  }
  private async claim() {
    if(!this.desired||this.stopped||this.failed)return;
    const desired=this.desired;
    const result=await this.request({...desired,type:'claim',clientId:this.clientId,requestId:crypto.randomUUID()});
    if(this.stopped)return;
    if(result.recovered){this.clear();await this.options.refresh();return;}
    this.syncStatus='';this.session={...result,characterId:desired.characterId};this.observedSession=result.session.id;this.snapshot=null;this.behindMs=result.serverNow-result.state.wallAt;
    await this.start();
  }
  private async reconcileCommand() {
    if(!this.reconcileNeeded)return;
    // The combined request may have committed even if its response was lost.
    // Its checkpoint receipt resolves that uncertainty before a fresh snapshot.
    if(this.pending)await this.checkpoint();
    this.clear();this.reconciling=true;
    try {await this.options.refresh();this.reconcileNeeded=false;}
    finally {this.reconciling=false;}
    await this.claim();
  }
  private async start() {
    if(!this.session||this.stopped||this.failed||this.suspended)return;
    try {this.prepareWorker();}catch{throw this.breakWorker('本地战斗引擎无法启动');}
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>this.breakWorker('本地战斗引擎启动超时'),this.workerReady?15000:SIMULATION_STARTUP_TIMEOUT_MS);
      const finish=(error?:Error)=>{clearTimeout(timeout);this.starting=null;if(error)reject(error);else resolve();};
      this.starting={resolve:()=>finish(),reject:finish};
      this.frames.reset();this.combatEvents=[];
      this.worker!.postMessage({type:'start',...this.session,sentAt:performance.timeOrigin+performance.now(),generation:this.session.session.id});
    });
    this.schedule(10000);
  }
  private resume() {
    if(!this.session||this.stopped||this.blocked||this.suspended)return;
    this.worker?.postMessage({type:'resume',generation:this.session.session.id});this.schedule(10000);
  }
  private schedule(ms:number) {
    if(this.stopped||this.commandPending||this.failed||this.suspended||this.backgroundQueued)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>{
      this.backgroundQueued=true;
      void this.enqueue(async()=>{
        await this.reconcileCommand();
        if(this.workerFailure)await this.recoverWorker();
        if(this.session)await this.checkpoint();else await this.claim();
      }).then(()=>{
        this.backgroundQueued=false;
        if(this.workerFailure)this.schedule(1000);
        else if(this.session)this.resume();
      },error=>{this.backgroundQueued=false;this.report(error);});
    },ms);
  }
  private clear() {
    this.starting?.reject(new Error('本地会话已更新，请重试操作'));
    for(const action of this.actions.values())action.reject(new Error('本地会话已更新，请重试操作'));
    this.captureReject?.(new Error('本地会话已更新，请重试操作'));
    clearTimeout(this.timer);this.worker?.postMessage({type:'stop'});this.session=null;this.snapshot=null;this.pending=null;publishLocalCombat(null);
    this.syncStatus='';if(!this.stopped)this.options.onStatus('');
  }
  private async checkpoint(pause=false,deferUpload=false):Promise<void> {
    if(!this.session)return;
    // Finish a previous uncertain upload before capturing the state at this
    // command's arrival. The combined request must carry the latest checkpoint.
    if(deferUpload&&this.pending){await this.checkpoint();if(!this.session)return;}
    const retry=!!this.pending;
    const selected=this.session.characterId;
    clearTimeout(this.timer);
    if(!this.pending) {
      if(this.workerFailure)throw this.workerFailure;
      const state=await new Promise<any>((resolve,reject)=>{
        if(this.failed){reject(this.failure||new Error('本地战斗引擎已停止，请刷新页面'));return;}
        const requestId=crypto.randomUUID();let lastProgress=-Infinity;
        let timeout:ReturnType<typeof setTimeout>;
        const cleanup=()=>{clearTimeout(timeout);this.capture=null;this.captureReject=null;this.captureProgress=null;this.captureId=null;};
        const arm=(loading=false)=>{clearTimeout(timeout);timeout=setTimeout(()=>this.breakWorker('本地战斗引擎响应超时'),loading?SIMULATION_STARTUP_TIMEOUT_MS:15000);};
        this.captureId=requestId;
        this.capture=s=>{cleanup();resolve(s);};this.captureReject=e=>{cleanup();reject(e);};
        // Long offline fights may take several slices. Renew only on actual
        // simulation progress, so a hung Worker still times out.
        this.captureProgress=(wallAt,loading)=>{if(loading||wallAt>lastProgress){if(!loading)lastProgress=wallAt;arm(loading);}};
        arm();this.worker!.postMessage({type:'checkpoint',pause,requestId,generation:this.session.session.id});
      });
      this.pending={type:'checkpoint',ownerId:this.session.ownerId,characterId:this.session.characterId,contentVersion:this.session.contentVersion,
        clientId:this.clientId,sessionId:this.session.session.id,sequence:this.session.session.sequence+1,state,requestId:crypto.randomUUID()};
    }
    if(deferUpload)return;
    const submitted=this.pending;
    const result=await this.request(submitted);
    if(this.pending!==submitted)return;
    if(result.recovered){this.clear();await this.options.refresh();return;}
    for(const [from,to] of result.itemIds)this.itemIds.set(from,to);
    while(this.itemIds.size>4096)this.itemIds.delete(this.itemIds.keys().next().value!);
    this.pending=null;
    if(!this.workerFailure)this.recoveryAttempts=0;
    this.syncStatus='';
    if(this.stopped||this.suspended)return;
    this.session={...this.session,...result,characterId:selected};
    this.worker?.postMessage({type:'ack',generation:result.session.id,itemIds:result.itemIds,deadline:result.deadline});
    if(!result.active){this.clear();await this.options.refresh();}
    else if(retry&&pause)await this.checkpoint(true);
  }
  async command<T>(execute:(credentials:any,prepare:(command:any)=>any)=>Promise<T>,combineCheckpoint=false):Promise<T> {
    this.commandPending++;
    try{return await this.enqueue(async()=>{
      clearTimeout(this.timer);
      await this.reconcileCommand();
      if(this.workerFailure)await this.recoverWorker();
      if(!this.session&&this.desired)await this.claim();
      if(this.failed)throw this.failure||new Error('本地战斗引擎已停止，请刷新页面');
      if(this.session&&this.behindMs>2000)this.options.onStatus('正在结算离线冒险，完成后自动执行操作…');
      await this.checkpoint(true,combineCheckpoint);
      const credentials={localClientId:this.clientId,...(this.session?{localSessionId:this.session.session.id}:{}),...(combineCheckpoint&&this.pending?{localCheckpoint:this.pending}:{})};
      try {
        const result=await execute(credentials,command=>remapItemReferences(structuredClone(command),this.itemIds));
        this.clear();return result;
      } catch(error) {
        if(combineCheckpoint&&this.pending){
          this.reconcileNeeded=true;this.syncStatus='正在确认上次操作结果…';this.options.onStatus(this.syncStatus);
        }
        else this.clear();
        throw error;
      }
    });}finally{
      this.commandPending--;
      if(!this.commandPending&&!this.stopped){
        if(this.workerFailure||this.reconcileNeeded)this.schedule(1000);
        else if(this.pending)this.schedule(2000);
        else if(this.session)this.resume();
        else void this.enqueue(()=>this.claim()).catch(error=>this.report(error));
      }
    }
  }
  private report(error:any) {
    if(this.stopped||this.suspended)return;
    if(this.failed){this.options.onStatus(this.failure?.message||error.message);return;}
    if(error.code==='LOCAL_WORKER') {this.options.onStatus(error.message);this.schedule(1000);return;}
    // Network retries preserve the running local timeline and its live inputs.
    // Ownership/content failures still fence the Worker immediately.
    if(error.code==='CONTENT_VERSION'||['LOCAL_STATE','LOCAL_ROSTER'].includes(error.code)||error.status===401||error.status===403){this.fail(error);return;}
    if(error.code==='LOCAL_HELD')this.clear();
    if(['LOCAL_STALE','LOCAL_UNAVAILABLE','LOCAL_TIME','LOCAL_SEQUENCE'].includes(error.code)) {
      this.clear();void this.options.refresh().catch(()=>{});
    }
    this.syncStatus=`冒险进度暂未同步：${syncErrorMessage(error)}`;
    this.options.onStatus(this.syncStatus);
    if(error.code!=='CONTENT_VERSION')this.schedule(error.code==='LOCAL_HELD'?5000:2000);
  }
  dispose() {
    this.release();
    this.stopped=true;clearTimeout(this.timer);this.worker?.terminate();this.policyWorker?.terminate();this.policyWorker=undefined;this.captureReject?.(new Error('本地会话已关闭'));
    for(const action of this.actions.values())action.reject(new Error('本地会话已关闭'));
    publishLocalCombat(null);
  }
}
