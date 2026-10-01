import type {PublishedInputReceipt,PublicFrame,SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import {validateServiceRequest,type SimulationServiceRequest} from '../../../packages/protocol/src/simulation-service.ts';
import type {GameResponse} from '../../../packages/contracts/src/game.ts';

type Admission=Extract<SimulationServiceRequest,{operation:'open'}>['admission'];
/** Server-only transport. Accounts come from authenticated sessions; browsers
 * cannot supply admissions, service credentials or another account's identity.
 * Timeouts are uncertain outcomes, never permission to switch execution owner.
 */
export class SimulationClient {
 private readonly endpoint:string;
 private readonly token:string;
 private readonly timeoutMs:number;
 private readonly maxPending:number;
 private pending=0;
 constructor(options:{url:string;token:string;timeoutMs?:number;maxPending?:number}){
  const url=new URL(options.url);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Invalid simulation service URL');
  if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Remote simulation service requires HTTPS');
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(options.token))throw new Error('Invalid simulation service token');
  this.endpoint=new URL('/rpc',url).href;this.token=options.token;
  this.timeoutMs=options.timeoutMs??10_000;this.maxPending=options.maxPending??64;
  if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<1||!Number.isSafeInteger(this.maxPending)||this.maxPending<1)throw new Error('Invalid simulation client limits');
 }
 deleteSave(userId:string,saveId:string){return this.call<{deleted:true}>({operation:'deleteSave',userId,saveId});}
 open(admission:Admission){return this.call<{instanceId:string;ownerEpoch:number}>({operation:'open',admission});}
 openCharacter(accountId:string,characterId:string){return this.call<{instanceId:string;ownerEpoch:number}>({operation:'openCharacter',accountId,characterId});}
 presentation(instanceId:string,accountId:string,actorId:string,scope:'full'|'combat'='full',online=false){return this.call<GameResponse>({operation:'presentation',instanceId,accountId,actorId,scope,online});}
 input(accountId:string,input:SimulationInput){return this.call<PublishedInputReceipt>({operation:'input',accountId,input});}
 enterDungeon(accountId:string,input:SimulationInput){return this.call<{instanceId:string;ownerEpoch:number;receipt:PublishedInputReceipt}>({operation:'enterDungeon',accountId,input});}
 leaveDungeon(accountId:string,input:SimulationInput){return this.call<{instanceId:string;ownerEpoch:number;receipt:PublishedInputReceipt}>({operation:'leaveDungeon',accountId,input});}
 project(instanceId:string,full=false){return this.call<PublicFrame>({operation:'project',instanceId,full});}
 checkpoint(instanceId:string){return this.call<{sequence:number;ownerEpoch:number}>({operation:'checkpoint',instanceId});}
 remove(instanceId:string){return this.call<{removed:true}>({operation:'remove',instanceId});}
 inspect(){return this.call<{version:{rulesetVersion:string;contentHash:string};instances:number;shards:{worker:number;instances:number;pending:number;ready:boolean;failed:boolean}[]}>({operation:'inspect'},Math.min(this.timeoutMs,1500));}
 private async call<T>(request:SimulationServiceRequest,timeoutMs=this.timeoutMs):Promise<T>{
  validateServiceRequest(request);
  if(this.pending>=this.maxPending)throw new Error('Simulation gateway queue full');
  this.pending++;
  try{
   const response=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.token}`},
    body:JSON.stringify(request),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
   const body=await response.json() as {result?:T;error?:string;code?:string};
   if(!response.ok)throw Object.assign(new Error(body.error??`Simulation service failed (${response.status})`),{status:response.status,code:body.code});
   if(!Object.hasOwn(body,'result'))throw new Error('Invalid simulation response');
   return body.result as T;
  }finally{this.pending--;}
 }
}
