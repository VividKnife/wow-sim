import {saveFetch} from './save-fetch';
import {publishLocalCombat} from './local-combat-store';
import {itemIdentityChanges,remapItemReferences} from './local-item-identities.js';

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
        this.options.onStatus(data.behindMs>2000?(this.commandPending?'正在结算离线冒险，完成后自动执行操作…':'正在结算离线冒险…'):'');
      }
      if (data.type==='full') {
        this.behindMs=data.behindMs;
        this.snapshot=data.snapshot;this.options.onFull(data.snapshot);
        this.options.onStatus(data.behindMs>2000?(this.commandPending?'正在结算离线冒险，完成后自动执行操作…':'正在结算离线冒险…'):'');
      }
      if (data.requestId===this.captureId) {
        if (data.type==='checkpointProgress')this.captureProgress?.(data.wallAt);
        if (data.type==='checkpoint')this.capture?.(data.state);
      }
      if (data.type==='boundary') this.schedule(500);
      if (data.type==='error') this.fail(new Error(data.error));
    };
    this.worker.onerror=()=>this.fail(new Error('本地战斗引擎加载失败，请刷新页面重试'));
    this.worker.postMessage({type:'visibility',...this.presentation});
  }
  private fail(error:Error) {
    this.failed=true;this.failure=error;clearTimeout(this.timer);this.captureReject?.(error);
    this.options.onStatus(error.message);
  }
  get active() {return !!this.session;}
  get latest() {return this.snapshot;}
  get ownerId() {return this.session?.ownerId;}
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
    this.session={...result,characterId:desired.characterId};this.observedSession=result.session.id;this.snapshot=null;this.behindMs=result.serverNow-result.state.wallAt;
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
    this.captureReject?.(new Error('本地会话已更新，请重试操作'));
    clearTimeout(this.timer);this.worker?.postMessage({type:'stop'});this.session=null;this.snapshot=null;this.pending=null;publishLocalCombat(null);
    if(!this.stopped)this.options.onStatus('');
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
    for(const [from,to] of itemIdentityChanges(submitted.state,result.state))this.itemIds.set(from,to);
    while(this.itemIds.size>4096)this.itemIds.delete(this.itemIds.keys().next().value!);
    this.pending=null;
    if(this.stopped||this.suspended)return;
    this.session={...result,characterId:selected};
    this.worker?.postMessage({type:'ack',generation:result.session.id,state:result.state,deadline:result.deadline});
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
      const credentials=this.session?{localClientId:this.clientId,localSessionId:this.session.session.id}:{};
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
    this.worker?.postMessage({type:'stop'});
    if(error.code==='LOCAL_STALE'||error.code==='LOCAL_UNAVAILABLE'||error.code==='LOCAL_TIME') {
      this.clear();void this.options.refresh().catch(()=>{});
    }
    this.options.onStatus(error.code==='LOCAL_HELD'?error.message:error.code==='CONTENT_VERSION'?error.message:'冒险进度暂未同步，正在重试…');
    if(error.code!=='CONTENT_VERSION')this.schedule(error.code==='LOCAL_HELD'?5000:2000);
  }
  dispose() {
    this.release();
    this.stopped=true;clearTimeout(this.timer);this.worker?.terminate();this.captureReject?.(new Error('本地会话已关闭'));publishLocalCombat(null);
  }
}
