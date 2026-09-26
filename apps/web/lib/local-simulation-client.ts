import {saveFetch} from './save-fetch';
import {publishLocalCombat} from './local-combat-store';
import {remapItemReferences} from './local-item-identities.js';
import {isLocalCombatAction} from './local-combat-actions';

type Options = {onFull:(snapshot:any)=>void;onStatus:(message:string)=>void;refresh:()=>Promise<unknown>};
/** One owner, one worker, one in-flight mutation. Routine checkpoints reconcile
 * canonical item IDs without pausing the running simulation. Failed uploads
 * retain the exact request body and requestId for an idempotent retry. */
export class LocalSimulationClient {
  private worker:Worker|undefined;
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
  private captureProgress:((wallAt:number)=>void)|null=null;
  private failure:Error|null=null;
  private failed=false;
  private suspended=false;
  private observedSession:string|null=null;
  private actions=new Map<string,{resolve:()=>void;reject:(error:Error)=>void;progress:(wallAt:number)=>void}>();
  constructor(private options:Options) {}
  private prepareWorker() {
    if(this.worker)return;
    this.options.onStatus('正在准备冒险…');
    this.worker=new Worker(new URL('./local-simulation.worker.ts',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      if (data.generation!==this.session?.session.id || this.suspended) return;
      if (data.type==='frame') {
        this.behindMs=data.behindMs;
        publishLocalCombat(data.snapshot);
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
      if (data.type==='error') this.fail(new Error(data.error));
    };
    this.worker.onerror=()=>this.fail(new Error('本地战斗引擎加载失败，请刷新页面重试'));
    this.worker.postMessage({type:'visibility',...this.presentation});
  }
  private fail(error:Error) {
    this.failed=true;this.failure=error;clearTimeout(this.timer);this.captureReject?.(error);
    this.worker?.postMessage({type:'stop'});
    for(const action of this.actions.values())action.reject(error);
    this.options.onStatus(error.message);
  }
  get active() {return !!this.session;}
  get latest() {return this.snapshot;}
  get ownerId() {return this.session?.ownerId;}
  canAct(command:any) {
    return !!this.session && !this.stopped && !this.suspended && !this.failed && !this.commandPending &&
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
      const arm=()=>{clearTimeout(timeout);timeout=setTimeout(()=>this.fail(new Error('本地战斗操作响应超时，请刷新页面')),15000);};
      this.actions.set(requestId,{resolve:()=>finish(),reject:finish,progress:wallAt=>{if(wallAt>lastProgress){lastProgress=wallAt;arm();}}});
      arm();this.worker!.postMessage({type:'command',generation,requestId,command});
    });
    return true;
  }
  observe(manifest:any, contentVersion:string, characterId:string) {
    if(this.stopped)return;
    const changed=this.desired?.ownerId!==manifest?.ownerId || this.desired?.characterId!==characterId || this.desired?.contentVersion!==contentVersion;
    this.desired=manifest?{...manifest,contentVersion,characterId}:null;
    // Ignore a poll which started before our claim. A different non-null token
    // means another client/command won; reacquire from persisted state.
    if(manifest?.sessionId && this.session && manifest.sessionId!==this.session.session.id && manifest.sessionId!==this.observedSession){
      this.observedSession=manifest.sessionId;
      void this.enqueue(async()=>{this.clear();await this.claim();}).catch(error=>this.report(error));
    } else if(changed && !this.commandPending) {
      void this.enqueue(async()=>{if(this.session)await this.checkpoint();this.clear();await this.claim();}).catch(error=>this.report(error));
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
    this.syncStatus='';this.session={...result,characterId:desired.characterId};this.observedSession=result.session.id;this.snapshot=null;this.behindMs=result.serverNow-result.state.wallAt;
    this.start();
  }
  private start() {
    if(!this.session||this.stopped||this.failed||this.suspended)return;
    this.prepareWorker();
    this.worker!.postMessage({type:'start',...this.session,generation:this.session.session.id});
    this.schedule(10000);
  }
  private resume() {
    if(!this.session||this.stopped||this.failed||this.suspended)return;
    this.worker?.postMessage({type:'resume',generation:this.session.session.id});this.schedule(10000);
  }
  private schedule(ms:number) {
    if(this.stopped||this.commandPending||this.failed||this.suspended)return;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>void this.enqueue(async()=>{
      if(this.session)await this.checkpoint();else await this.claim();
      if(this.session)this.resume();
    }).catch(error=>this.report(error)),ms);
  }
  private clear() {
    for(const action of this.actions.values())action.reject(new Error('本地会话已更新，请重试操作'));
    this.captureReject?.(new Error('本地会话已更新，请重试操作'));
    clearTimeout(this.timer);this.worker?.postMessage({type:'stop'});this.session=null;this.snapshot=null;this.pending=null;publishLocalCombat(null);
    this.syncStatus='';if(!this.stopped)this.options.onStatus('');
  }
  private async checkpoint(pause=false):Promise<void> {
    if(!this.session)return;
    const retry=!!this.pending;
    const selected=this.session.characterId;
    clearTimeout(this.timer);
    if(!this.pending) {
      const state=await new Promise<any>((resolve,reject)=>{
        if(this.failed){reject(this.failure||new Error('本地战斗引擎已停止，请刷新页面'));return;}
        const requestId=crypto.randomUUID();let lastProgress=-Infinity;
        let timeout:ReturnType<typeof setTimeout>;
        const cleanup=()=>{clearTimeout(timeout);this.capture=null;this.captureReject=null;this.captureProgress=null;this.captureId=null;};
        const arm=()=>{clearTimeout(timeout);timeout=setTimeout(()=>{cleanup();reject(new Error('本地战斗引擎响应超时，请刷新页面'));},15000);};
        this.captureId=requestId;
        this.capture=s=>{cleanup();resolve(s);};this.captureReject=e=>{cleanup();reject(e);};
        // Long offline fights may take several slices. Renew only on actual
        // simulation progress, so a hung Worker still times out.
        this.captureProgress=wallAt=>{if(wallAt>lastProgress){lastProgress=wallAt;arm();}};
        arm();this.worker!.postMessage({type:'checkpoint',pause,requestId,generation:this.session.session.id});
      });
      this.pending={type:'checkpoint',ownerId:this.session.ownerId,characterId:this.session.characterId,contentVersion:this.session.contentVersion,
        clientId:this.clientId,sessionId:this.session.session.id,sequence:this.session.session.sequence+1,state,requestId:crypto.randomUUID()};
    }
    const submitted=this.pending;
    const result=await this.request(submitted);
    if(this.pending!==submitted)return;
    for(const [from,to] of result.itemIds)this.itemIds.set(from,to);
    while(this.itemIds.size>4096)this.itemIds.delete(this.itemIds.keys().next().value!);
    this.pending=null;
    this.syncStatus='';
    if(this.stopped||this.suspended)return;
    this.session={...this.session,...result,characterId:selected};
    this.worker?.postMessage({type:'ack',generation:result.session.id,itemIds:result.itemIds,deadline:result.deadline});
    if(!result.active){this.clear();await this.options.refresh();}
    else if(retry&&pause)await this.checkpoint(true);
  }
  async command<T>(execute:(credentials:any,prepare:(command:any)=>any)=>Promise<T>):Promise<T> {
    this.commandPending++;
    try{return await this.enqueue(async()=>{
      clearTimeout(this.timer);
      if(!this.session&&this.desired)await this.claim();
      if(this.failed)throw this.failure||new Error('本地战斗引擎已停止，请刷新页面');
      if(this.session&&this.behindMs>2000)this.options.onStatus('正在结算离线冒险，完成后自动执行操作…');
      await this.checkpoint(true);
      const credentials={localClientId:this.clientId,...(this.session?{localSessionId:this.session.session.id}:{})};
      try{return await execute(credentials,command=>remapItemReferences(structuredClone(command),this.itemIds));}finally{this.clear();}
    });}finally{
      this.commandPending--;
      if(!this.commandPending&&!this.stopped){
        if(this.pending)this.schedule(2000);
        else if(this.session)this.resume();
        else void this.enqueue(()=>this.claim()).catch(error=>this.report(error));
      }
    }
  }
  private report(error:any) {
    if(this.stopped)return;
    // Network retries preserve the running local timeline and its live inputs.
    // Ownership/content failures still fence the Worker immediately.
    if(error.code==='CONTENT_VERSION'||['LOCAL_STATE','LOCAL_ROSTER'].includes(error.code)||error.status===401||error.status===403){this.fail(error);return;}
    if(error.code==='LOCAL_HELD')this.worker?.postMessage({type:'stop'});
    if(error.code==='LOCAL_STALE'||error.code==='LOCAL_UNAVAILABLE'||error.code==='LOCAL_TIME') {
      this.clear();void this.options.refresh().catch(()=>{});
    }
    this.syncStatus=error.code==='LOCAL_HELD'?error.message:'冒险进度暂未同步，正在重试…';
    this.options.onStatus(this.syncStatus);
    if(error.code!=='CONTENT_VERSION')this.schedule(error.code==='LOCAL_HELD'?5000:2000);
  }
  dispose() {
    this.release();
    this.stopped=true;clearTimeout(this.timer);this.worker?.terminate();this.captureReject?.(new Error('本地会话已关闭'));
    for(const action of this.actions.values())action.reject(new Error('本地会话已关闭'));
    publishLocalCombat(null);
  }
}
