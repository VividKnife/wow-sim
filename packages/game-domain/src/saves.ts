import type {GameService} from './service.ts';
import type {Account,Character} from './model.ts';
import {requireThat} from './model.ts';
import {newState,characterRules,persistAssets} from './context.ts';
import {removeInvalidSave} from './account-reset.ts';
import {applyLevel20Boost} from './rules/boost.js';

export async function listSaves(this:GameService,userId:string){
 return this.store.transaction(async tx=>{
  const result=[];
  for(const a of await tx.list<Account>('accounts',{userId})){
   const c=await tx.get<Character>('characters',a.primaryCharacterId);
   if(c)result.push({id:a.id,name:c.rules.name,classId:c.rules.classId,raceId:c.rules.raceId,level:c.rules.level,location:c.rules.location,createdAt:a.createdAt,lastSeenAt:a.lastSeenAt});
  }
  return result.sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
 });
}
export async function resolveSave(this:GameService,userId:string,saveId:string|null){
 requireThat(typeof saveId==='string'&&saveId.length>0&&saveId.length<=200,'SAVE_REQUIRED','请先选择存档',400);
 return this.store.transaction(async tx=>{
  const a=await tx.get<Account>('accounts',saveId!);
  requireThat(a?.userId===userId,'NOT_FOUND','存档不存在或已删除',404);
  return a!.id;
 });
}
export async function createSave(this:GameService,userId:string,input:{name:string;classId:number;raceId:number;boost?:boolean},requestId:string){
 this.request(requestId);
 requireThat(input.boost===undefined||typeof input.boost==='boolean','INVALID_BOOST','直升选项无效',400);
 // Stable identity makes network retries idempotent even after deletion.
 const saveId=`${userId}:${requestId}`;
 requireThat(saveId.length<=200,'INVALID_REQUEST','存档标识过长',400);
 await this.store.transaction(async tx=>{
  const fingerprint=JSON.stringify(input),receiptId=`save:${saveId}`;
  const receipt=await tx.get('receipts',receiptId);
  if(receipt){requireThat(receipt.fingerprint===fingerprint,'REQUEST_REUSED','请求编号已被使用',409);requireThat(await tx.get('accounts',saveId),'DELETED','该存档已删除',410);return;}
  requireThat((await tx.list('accounts',{userId})).length<20,'SAVE_LIMIT','最多保留20个存档，请先删除不需要的存档',400);
  const now=this.now(),id=this.id(),partyId=this.id();
  const s=newState(input.name,input.classId,input.raceId,this.seed(),now,id);
  if(input.boost)applyLevel20Boost(s);
  const c:Character={id,accountId:saveId,kind:'hero',rules:characterRules(s),professionReadyAt:{},resourceReadyAt:{}};
  await tx.insert('accounts',{id:saveId,userId,primaryCharacterId:id,partyId,revision:1,createdAt:now,lastSeenAt:now});
  await tx.insert('characters',c);
  await tx.insert('parties',{id:partyId,accountId:saveId,characterIds:[id]});
  await persistAssets(tx,c,s,`create:${saveId}`,this.id);
  await tx.insert('receipts',{id:receiptId,userId,fingerprint});
 });
 return {id:saveId};
}
export async function deleteSave(this:GameService,userId:string,saveId:string){
 await this.store.transaction(async tx=>{
  const a=await tx.get<Account>('accounts',saveId);
  requireThat(a?.userId===userId,'NOT_FOUND','存档不存在或已删除',404);
  await removeInvalidSave(tx,saveId);
 });
}
