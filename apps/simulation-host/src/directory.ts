import {publicRaidBoundary,publicRaidTransferId} from './public-raid-transfer.ts';
import {goldRaidContents} from '../../../packages/game-domain/src/rules/gold-raid.js';
import {dungeonDepartureTransferId,dungeonDepartureBoundary} from './dungeon-departure-transfer.ts';
import {DEFAULT_IDLE_RETIRE_MS,idleRetireDelay} from './retirement-policy.ts';
import {runtimeVersion} from './version.ts';
import {createHash,randomUUID} from 'node:crypto';
import {SimulationHost,type HostOptions} from './host.ts';
import {SimulationSession} from './session.ts';
import type {Admission} from './instance.ts';
import type {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';
import type {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {DomainError} from '../../../packages/game-domain/src/model.ts';
import type {DungeonAdmissions} from '../../../packages/game-domain/src/dungeon-admissions.ts';
import {dungeonEntryTransferId,dungeonTransferBoundary} from './dungeon-transfer.ts';
import type {PublishedInputReceipt} from '../../../packages/protocol/src/simulation.ts';

type Entry={fingerprint:string;session:Promise<SimulationSession>};
export type ResidentAdmission=Omit<Admission,'ownerEpoch'>;
/** One service owns the directory and its fixed Worker pool. Admissions are
 * supplied by the authenticated game gateway, never by public clients. */
export class SimulationDirectory {
 private readonly host:SimulationHost;
 private readonly repository:SimulationRepository;
 private readonly ownerId:string;
 private readonly maximum:number;
 private readonly checkpointMs:number;
 private readonly idleRetireMs:number;
 private readonly entries=new Map<string,Entry>();
 private readonly characterOpens=new Map<string,Promise<{instanceId:string;ownerEpoch:number}>>();
 private reservedAdmissions=0;
 private closed=false;
 private readonly characters?:ResidentCharacters;
 private readonly dungeons?:DungeonAdmissions;
 private readonly dungeonEntries=new Map<string,{fingerprint:string;work:Promise<{instanceId:string;ownerEpoch:number;receipt:PublishedInputReceipt}>}>();
 private readonly onError:(instanceId:string,error:unknown)=>void;
 constructor(repository:SimulationRepository,options:HostOptions&{checkpointMs?:number;idleRetireMs?:number;ownerId?:string;characters?:ResidentCharacters;dungeons?:DungeonAdmissions;onError?:(instanceId:string,error:unknown)=>void}={}){
  const {ownerId,onError,characters,dungeons,checkpointMs=5000,idleRetireMs=DEFAULT_IDLE_RETIRE_MS,...hostOptions}=options;
  if(!Number.isSafeInteger(checkpointMs)||checkpointMs<100||checkpointMs>10_000)throw new Error('Invalid checkpoint interval');
  this.checkpointMs=checkpointMs;
  this.idleRetireMs=idleRetireDelay(idleRetireMs);
  this.characters=characters;
  this.dungeons=dungeons;
  this.repository=repository;this.host=new SimulationHost(hostOptions);
  this.ownerId=options.ownerId??randomUUID();this.maximum=options.maxInstances??128;
  this.onError=options.onError??((id,error)=>console.error('Simulation instance stopped',id,error));
 }
 async openCharacter(accountId:string,characterId:string){
  const characters=this.characters;
  if(!characters)throw new Error('Character residency is unavailable');
  if(this.closed)throw new Error('Directory closed');
  const key=JSON.stringify([accountId,characterId]),previous=this.characterOpens.get(key);
  if(previous)return previous;
  const work=(async()=>{
   let existing;
   try{existing=await characters.find(accountId,characterId);}
   catch(error){
    if(!(error instanceof DomainError)||error.code!=='SIMULATION_VERSION')throw error;
    await characters.retireIncompatiblePersonal(accountId,characterId);
    existing=await characters.find(accountId,characterId);
   }
   if(existing&&this.entries.has(existing.instanceId))return this.open(existing);
   // Reserve capacity before creating a durable character claim. Account for
   // other in-flight character opens while their SQL admission is pending.
   if(this.entries.size+this.reservedAdmissions>=this.maximum)throw new Error('Instance capacity reached');
   this.reservedAdmissions++;
   try{return await this.openReserved(existing??await characters.admission(accountId,characterId),true);}
   finally{this.reservedAdmissions--;}
  })();
  this.characterOpens.set(key,work);
  try{return await work;}finally{if(this.characterOpens.get(key)===work)this.characterOpens.delete(key);}
 }
 open(admission:ResidentAdmission){return this.openReserved(admission,false);}
 private async openReserved(admission:ResidentAdmission,reserved:boolean){
  if(this.closed)throw new Error('Directory closed');
  if(!admission||typeof admission.instanceId!=='string'||!admission.instanceId||admission.instanceId.length>120)throw new Error('Invalid instance ID');
  const fingerprint=createHash('sha256').update(JSON.stringify(admission)).digest('hex');
  for(;;){
   const previous=this.entries.get(admission.instanceId);if(!previous)break;
   if(previous.fingerprint!==fingerprint)throw new Error('Admission reused with different state');
   const session=await previous.session;
   if(session.active)return session.identity();
   await session.whenStopped();
   if(this.closed)throw new Error('Directory closed');
   if(this.entries.get(admission.instanceId)===previous)this.entries.delete(admission.instanceId);
   // Another opener may have installed a replacement while we were waiting.
  }
  if(this.entries.size+this.reservedAdmissions-(reserved?1:0)>=this.maximum)throw new Error('Instance capacity reached');
  // Reserve before the first await: concurrent opens cannot create two owners.
  const entry={} as Entry;
  const forget=()=>{if(this.entries.get(admission.instanceId)===entry)this.entries.delete(admission.instanceId);};
  entry.fingerprint=fingerprint;
  entry.session=SimulationSession.open(this.host,this.repository,this.ownerId,admission,{checkpointMs:this.checkpointMs,idleRetireMs:this.idleRetireMs,onRetired:forget,onError:error=>{
   forget();this.onError(admission.instanceId,error);
  }}).catch(error=>{forget();throw error;});
  this.entries.set(admission.instanceId,entry);
  return (await entry.session).identity();
 }
 async input(accountId:string,input:SimulationInput){return this.withActorSession(input.instanceId,accountId,input.actorId,session=>session.input(accountId,input));}
 async enterDungeon(accountId:string,input:SimulationInput){
  if(input.command.kind==='action'&&(input.command.action.type==='goldLeave'||Object.hasOwn(goldRaidContents,input.command.action.contentId as string)))return this.publicRaid(accountId,input);
  if(input.command.kind!=='action'||input.command.action.type!=='enterDungeon')throw new Error('Invalid arrival command');
  if(this.closed||!this.characters||!this.dungeons)throw new Error('Dungeon admission is unavailable');
  const plan=await this.dungeons.plan(accountId,input);
  if(plan.receipt)return {...await this.openCharacter(accountId,input.actorId),receipt:{...plan.receipt,durable:true,confirmation:'durable' as const}};
  const {request,group,existing,npcSources}=plan,fingerprint=JSON.stringify([accountId,input]);
  const pending=this.dungeonEntries.get(group.id);
  if(pending){if(pending.fingerprint!==fingerprint)throw new Error('队伍正在交接实例，请稍后重试');return pending.work;}
  if(this.dungeonEntries.size>=16)throw new Error('Dungeon admission queue full');
  const work=(async()=>{
   const identity=await this.openCharacter(accountId,input.actorId);
   if(identity.instanceId!==input.instanceId)throw new Error('Controller fenced');
   const sessions:SimulationSession[]=[];
   if(existing){
    const room=await this.openCharacter(existing.accountId,existing.characterId);
    if(room.instanceId!==group.instanceId)throw new Error('Dungeon instance changed');
    sessions.push(await this.entries.get(room.instanceId)!.session);
   }
   if(sessions.some(s=>s.identity().instanceId===identity.instanceId))throw new Error('你已经在队伍副本中');
   sessions.push(await this.entries.get(identity.instanceId)!.session);
   const visitors=sessions.length;
   for(const source of npcSources){
    const room=await this.openCharacter(source.accountId,source.characterId);
    if(!sessions.some(s=>s.identity().instanceId===room.instanceId))sessions.push(await this.entries.get(room.instanceId)!.session);
   }
   const transferId=dungeonEntryTransferId(request),destinationId='dungeon:'+transferId.slice(6);
   try{
    const prepared=sessions.length===1?[await sessions[0].prepareTransfer(transferId,async checkpoint=>Math.max(checkpoint.state.wallAt,...checkpoint.recentInputs.filter(row=>row.receipt.status==='queued').map(row=>row.receipt.effectiveWallAt)))]:
      await SimulationSession.prepareGroupTransfer(sessions,transferId);
    await this.repository.transfer(transferId,prepared.map(p=>p.owner),[destinationId,...sessions.slice(visitors).map((_,i)=>'npc-home:'+transferId.slice(6)+':'+i)],dungeonTransferBoundary(request,Date.now,input));
    await Promise.all(sessions.map(s=>s.discard()));
    // Free source capacity before recovering the committed destination. No
    // in-memory state handoff is needed, including after a lost acknowledgement.
    for(const source of prepared)this.entries.delete(source.owner.id);
    for(const source of prepared.slice(visitors)){
     const controller=source.checkpoint.controllers.find(c=>c.actorId===source.checkpoint.state.id)!;
     await this.openCharacter(controller.accountId,controller.actorId);
    }
    const receipt=(await this.dungeons!.plan(accountId,input)).receipt;
    if(!receipt)throw new Error('Dungeon arrival receipt missing');
    return {...await this.openCharacter(accountId,input.actorId),receipt:{...receipt,durable:true,confirmation:'durable' as const}};
   }catch(error){
    // Unseal only with the original fence. A committed or uncertain transfer
    // cannot revive its old owner; abortTransfer stops that local session.
    await Promise.allSettled(sessions.map(s=>s.abortTransfer(transferId)));
    throw error;
   }
  })();
  this.dungeonEntries.set(group.id,{fingerprint,work});
  try{return await work;}finally{if(this.dungeonEntries.get(group.id)?.work===work)this.dungeonEntries.delete(group.id);}
 }
 private async publicRaid(accountId:string,input:SimulationInput){
  if(this.closed||!this.characters||!this.dungeons)throw new Error('Raid admission unavailable');
  const previous=await this.dungeons.raidReceipt(accountId,input);
  if(previous)return {...await this.openCharacter(accountId,input.actorId),receipt:{...previous,durable:true,confirmation:'durable' as const}};
  const key='raid:'+input.actorId,fingerprint=JSON.stringify([accountId,input]),pending=this.dungeonEntries.get(key);
  if(pending){if(pending.fingerprint!==fingerprint)throw new Error('角色正在交接实例');return pending.work;}
  const work=(async()=>{
   const identity=await this.openCharacter(accountId,input.actorId);if(identity.instanceId!==input.instanceId)throw new Error('Controller fenced');
   const session=await this.entries.get(identity.instanceId)!.session,transferId=publicRaidTransferId(accountId,input);
   try{
    const prepared=await session.prepareTransfer(transferId,async cp=>Math.max(cp.state.wallAt,...cp.recentInputs.filter(r=>r.receipt.status==='queued').map(r=>r.receipt.effectiveWallAt)));
    await this.repository.transfer(transferId,[prepared.owner],['personal:'+transferId],publicRaidBoundary(accountId,input));
    await session.discard();this.entries.delete(prepared.owner.id);
    const receipt=await this.dungeons!.raidReceipt(accountId,input);if(!receipt)throw new Error('Raid receipt missing');
    return {...await this.openCharacter(accountId,input.actorId),receipt:{...receipt,durable:true,confirmation:'durable' as const}};
   }catch(error){await session.abortTransfer(transferId);throw error;}
  })();
  this.dungeonEntries.set(key,{fingerprint,work});try{return await work;}finally{this.dungeonEntries.delete(key);}
 }
 async leaveDungeon(accountId:string,input:SimulationInput){
  if(input.command.kind!=='action'||input.command.action.type!=='leaveDungeon')throw new Error('Invalid departure command');
  if(this.closed||!this.characters||!this.dungeons)throw new Error('Dungeon admission is unavailable');
  const plan=await this.dungeons.plan(accountId,input);
  if(plan.receipt)return {...await this.openCharacter(accountId,input.actorId),receipt:{...plan.receipt,durable:true,confirmation:'durable' as const}};
  const {request,group}=plan,fingerprint=JSON.stringify([accountId,input]),pending=this.dungeonEntries.get(group.id);
  if(pending){if(pending.fingerprint!==fingerprint)throw new Error('队伍正在交接实例，请稍后重试');return pending.work;}
  if(this.dungeonEntries.size>=16)throw new Error('Dungeon admission queue full');
  const work=(async()=>{
   const identity=await this.openCharacter(accountId,input.actorId);
   if(identity.instanceId!==input.instanceId)throw new Error('Controller fenced');
   const session=await this.entries.get(identity.instanceId)!.session,transferId=dungeonDepartureTransferId(accountId,input);
   let reserved=false;
   try{
    const prepared=await session.prepareTransfer(transferId,async cp=>Math.max(cp.state.wallAt,...cp.recentInputs.filter(r=>r.receipt.status==='queued').map(r=>r.receipt.effectiveWallAt)));
    const multiple=prepared.checkpoint.controllers.length>1;
    if(multiple){
     if(this.entries.size+this.reservedAdmissions>=this.maximum)throw new Error('Instance capacity reached');
     this.reservedAdmissions++;reserved=true;
    }
    const suffix=transferId.slice(5),destinations=['personal:'+suffix,...(multiple?['dungeon:'+suffix]:[])];
    await this.repository.transfer(transferId,[prepared.owner],destinations,dungeonDepartureBoundary(request,input));
    await session.discard();this.entries.delete(prepared.owner.id);
    if(reserved){this.reservedAdmissions--;reserved=false;}
    const receipt=(await this.dungeons!.plan(accountId,input)).receipt;
    if(!receipt)throw new Error('Dungeon departure receipt missing');
    // Reopen the remaining room immediately so connected teammates continue.
    if(multiple){
     const other=prepared.checkpoint.controllers.find(c=>c.actorId!==input.actorId)!;
     await this.openCharacter(other.accountId,other.actorId);
    }
    return {...await this.openCharacter(accountId,input.actorId),receipt:{...receipt,durable:true,confirmation:'durable' as const}};
   }catch(error){await session.abortTransfer(transferId);throw error;}
   finally{if(reserved)this.reservedAdmissions--;}
  })();
  this.dungeonEntries.set(group.id,{fingerprint,work});
  try{return await work;}finally{if(this.dungeonEntries.get(group.id)?.work===work)this.dungeonEntries.delete(group.id);}
 }
 async project(instanceId:string,full=false){return this.withSession(instanceId,session=>session.project(full));}
 async checkpoint(instanceId:string){return this.withSession(instanceId,session=>session.checkpoint());}
 presentation(instanceId:string,accountId:string,actorId:string,scope:'full'|'combat',online=false){return this.withActorSession(instanceId,accountId,actorId,session=>session.presentation(accountId,actorId,scope,online));}
 async remove(instanceId:string){
  const entry=this.entries.get(instanceId);if(!entry)throw new Error('Instance unavailable');
  await (await entry.session).close();
  if(this.entries.get(instanceId)===entry)this.entries.delete(instanceId);
 }
 async deleteSave(userId:string,saveId:string){
  if(this.closed||!this.characters)throw new Error('Character residency is unavailable');
  const instanceIds=await this.characters.deleteSave(userId,saveId);
  for(const instanceId of instanceIds){
   const entry=this.entries.get(instanceId);if(!entry)continue;
   // A concurrently opening session may fail its initial checkpoint because
   // the transaction has already fenced it. Its open handler removes the worker.
   const session=await entry.session.catch(()=>undefined);
   if(session)await session.discard();
   if(this.entries.get(instanceId)===entry)this.entries.delete(instanceId);
  }
  return {deleted:true as const};
 }
 inspect(){return {version:runtimeVersion,instances:this.entries.size,shards:this.host.inspect()};}
 async close(){
  if(this.closed)return;this.closed=true;
  await Promise.allSettled([...this.dungeonEntries.values()].map(entry=>entry.work));
  await Promise.allSettled([...this.characterOpens.values()]);
  const entries=[...this.entries.values()],errors:unknown[]=[];
  // Shutdown checkpoints use the same bounded mailbox as ordinary work.
  for(let start=0;start<entries.length;start+=8){
   const results=await Promise.allSettled(entries.slice(start,start+8).map(async entry=>(await entry.session).close()));
   for(const result of results)if(result.status==='rejected')errors.push(result.reason);
  }
  await this.host.close();this.entries.clear();
  if(errors.length)throw new AggregateError(errors,'Some instances could not checkpoint during shutdown');
 }
 private async withActorSession<T>(instanceId:string,accountId:string,actorId:string,work:(session:SimulationSession)=>Promise<T>):Promise<T>{
  if(this.closed)throw new Error('Directory closed');
  const entry=this.entries.get(instanceId),session=entry?await entry.session:undefined;
  if(session?.active)return this.run(instanceId,entry!,session,work);
  if(!this.characters)throw new Error('Instance unavailable');
  // Claims survive eviction. Revalidate the actor and the requested instance
  // before opening anything, then restore its durable input/asset boundary.
  const admission=await this.characters.find(accountId,actorId);
  if(!admission||admission.instanceId!==instanceId)throw new Error('Instance access denied');
  await this.openCharacter(accountId,actorId);
  return this.withSession(instanceId,work);
 }
 private async withSession<T>(instanceId:string,work:(session:SimulationSession)=>Promise<T>){
  const entry=this.entries.get(instanceId);
  if(this.closed||!entry)throw new Error('Instance unavailable');
  const session=await entry.session;
  return this.run(instanceId,entry,session,work);
 }
 private async run<T>(instanceId:string,entry:Entry,session:SimulationSession,work:(session:SimulationSession)=>Promise<T>):Promise<T>{
  try{return await work(session);}
  finally{
   if(!session.active){
    await session.whenStopped();
    if(this.entries.get(instanceId)===entry)this.entries.delete(instanceId);
   }
  }
 }
}
