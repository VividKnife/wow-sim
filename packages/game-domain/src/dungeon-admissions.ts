import {createHash} from 'node:crypto';
import type {Store,Transaction} from '../../persistence/src/store.ts';
import type {SimulationInput,InputReceipt} from '../../protocol/src/simulation.ts';
import {validateSimulationInput} from '../../protocol/src/simulation.ts';
import {owned} from './context.ts';
import {requireThat} from './model.ts';
import {authorizeDungeonEntry,authorizeDungeonDeparture,type DungeonEntryRequest} from './dungeon-entry.ts';
import type {Group} from './social-party.ts';

const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receiptId=(accountId:string,input:SimulationInput)=>'dungeon-input:'+digest([accountId,input.requestId]);
export function validateDungeonInput(input:SimulationInput){
 validateSimulationInput(input);
 requireThat(input.command.kind==='action'&&(input.command.action.type==='leaveDungeon'||input.command.action.type==='enterDungeon'&&typeof input.command.action.contentId==='string'),
  'DUNGEON_INPUT','请选择要进入的副本');
}
/** One durable arrival receipt, in the same transaction as group binding and
 * ownership transfer. It also resolves a lost HTTP acknowledgement. */
export async function saveDungeonInput(tx:Transaction,accountId:string,input:SimulationInput,receipt:InputReceipt){
 await tx.insert('receipts',{id:receiptId(accountId,input),accountId,actorId:input.actorId,fingerprint:digest(input),receipt});
}
export class DungeonAdmissions{
 private readonly store:Store;
 constructor(store:Store){this.store=store;}
 async plan(accountId:string,input:SimulationInput){
  validateDungeonInput(input);
  return this.store.read(async tx=>{
   await owned(tx,accountId,input.actorId);
   const previous=await tx.get('receipts',receiptId(accountId,input));
   if(previous){
    requireThat(previous.actorId===input.actorId&&previous.fingerprint===digest(input),'DUNGEON_INPUT','请求标识已被另一操作使用');
    return {receipt:previous.receipt as InputReceipt};
   }
   const membership=await tx.get('social_members',input.actorId),group=membership&&await tx.get<Group>('social_groups',membership.groupId);
   const leaving=input.command.kind==='action'&&input.command.action.type==='leaveDungeon';
   requireThat(group?.entry&&input.command.kind==='action'&&(leaving||group.dungeonId===input.command.action.contentId),'DUNGEON_MATCH','请先匹配所选副本');
   const request:DungeonEntryRequest={accountId,actorId:input.actorId,groupId:group!.id,entryId:group!.entry!.id,visitId:input.requestId};
   await (leaving?authorizeDungeonDeparture:authorizeDungeonEntry)(tx,request);
   if(leaving)requireThat(group!.instanceId===input.instanceId,'DUNGEON_INSTANCE','角色不在当前队伍副本中');
   const residency=group!.instanceId?await tx.get('simulation_residencies',group!.instanceId):null;
   requireThat(!group!.instanceId||residency,'DUNGEON_INSTANCE','副本执行权记录不完整');
   const npcSources:{accountId:string;characterId:string}[]=[];
   if(!leaving&&request.actorId===group!.leaderId){
    const known=new Set<string>();
    for(const member of group!.members.filter(m=>m.npc)){
     const claim=await tx.get('simulation_characters',member.id);
     const holder=claim?await tx.get('simulation_residencies',claim.instanceId):null;
     const origin=await tx.get('characters',member.ownerCharacterId!);
     requireThat(origin&&(!claim||holder),'NPC_STATE','NPC 执行权记录不完整');
     const host={accountId:(holder?.accountId??origin!.accountId) as string,characterId:(holder?.characterId??origin!.id) as string};
     if(!known.has(host.characterId)){known.add(host.characterId);npcSources.push(host);}
    }
   }
   return {request,group:group!,npcSources,existing:residency?{accountId:residency.accountId as string,characterId:residency.characterId as string}:null};
  });
 }
}
