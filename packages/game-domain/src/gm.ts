import {residentStore} from './resident-store.ts';
import {randomUUID} from 'node:crypto';
import type {Store,Transaction} from '../../persistence/src/store.ts';
import {requireThat,type Rules,type Character,type Instance,type Activity} from './model.ts';
import {bump} from './context.ts';
import {items,nameOf,icon} from './rules/catalog.js';
import {receive} from './rules/inventory.js';
import {applyGmBuffs,invalidateGmBuffCache} from './gm-buffs.ts';
import {invalidateCombatPlan} from './combat-execution.ts';
const text=(value:unknown,max:number,label:string)=>{requireThat(typeof value==='string'&&value.trim().length>0&&value.trim().length<=max,'GM_INPUT',`${label}需为 1–${max} 字`,400);return value.trim();};
const integer=(value:unknown,min:number,max:number,label:string)=>{requireThat(Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max,'GM_INPUT',`${label}需为 ${min}–${max} 的整数`,400);return Number(value);};
export function giftDefinition(input:Rules){
 const name=text(input.name,60,'礼包名称'),description=text(input.description,500,'礼包说明');
 const copper=integer(input.copper,0,10000000000,'金币折合铜币');
 requireThat(Array.isArray(input.items)&&input.items.length<=20,'GM_INPUT','每个礼包最多 20 种物品',400);
 const entries=input.items.map((item:Rules)=>{requireThat(item&&typeof item==='object'&&!Array.isArray(item),'GM_ITEM','物品条目无效',400);const id=integer(item.id,1,2147483647,'物品 ID'),count=integer(item.count,1,1000,'物品数量');requireThat(items[id],'GM_ITEM','物品不存在',400);return {id,count,name:nameOf('items',id),icon:icon('items',id)};});
 requireThat(new Set(entries.map((item:Rules)=>item.id)).size===entries.length,'GM_ITEM','请合并重复物品',400);
 requireThat(copper>0||entries.length>0,'GM_EMPTY','礼包至少包含一件物品或金币',400);
 return {name,description,copper,items:entries};
}
export const buffEffectLimits:Record<string,[number,number]>={xpMultiplier:[1,10],movementMultiplier:[1,3],maxHp:[0,100000],maxMana:[0,100000],armor:[0,100000],attackPower:[0,10000],rangedAttackPower:[0,10000],spellPower:[0,10000],healing:[0,10000]};
export function buffDefinition(input:Rules){
 const name=text(input.name,60,'Buff 名称'),description=text(input.description,500,'Buff 说明');
 const durationMinutes=integer(input.durationMinutes,1,43200,'持续分钟数');
 requireThat(input.effects&&typeof input.effects==='object'&&!Array.isArray(input.effects),'GM_BUFF','请选择增益效果',400);
 const effects:Rules={};
 for(const [key,value] of Object.entries(input.effects)){
  const range=buffEffectLimits[key];requireThat(range&&typeof value==='number'&&Number.isFinite(value)&&value>=range[0]&&value<=range[1]&&(key.endsWith('Multiplier')||Number.isInteger(value)),'GM_BUFF','增益数值或类型无效',400);
  if(value!== (key.endsWith('Multiplier')?1:0))effects[key]=value;
 }
 requireThat(Object.keys(effects).length>0,'GM_BUFF','至少配置一种有效加成',400);
 return {name,description,durationMinutes,effects};
}
export class GmService {
 store:Store;now:()=>number;
 constructor(store:Store,now=Date.now){this.store=residentStore(store);this.now=now;}
 async list(){return this.store.read(async tx=>({
  templates:(await tx.list('gm_templates')).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100),
  buffs:(await tx.list('gm_buffs')).sort((a,b)=>b.createdAt-a.createdAt).slice(0,100),
  operations:(await tx.list('gm_operations')).sort((a,b)=>b.createdAt-a.createdAt).slice(0,100),
  serverNow:this.now(),
 }));}
 searchItems(search:string){const query=search.trim().toLowerCase();if(!query)return [];return Object.entries(items).filter(([id])=>id===query||nameOf('items',Number(id)).toLowerCase().includes(query)).slice(0,30).map(([id,item])=>({id:Number(id),name:nameOf('items',Number(id)),icon:icon('items',Number(id)),quality:item.Quality,stack:item.stackable}));}
 async execute(adminId:string,input:Rules){
  const requestId=text(input.requestId,100,'请求编号'),reason=text(input.reason,500,'操作原因');
  requireThat(/^[\w-]{8,100}$/.test(requestId),'GM_INPUT','请求编号无效',400);
  const id=`gm:${adminId}:${requestId}`,fingerprint=JSON.stringify(input),now=this.now();
  return this.store.transaction(async tx=>{
   const previous=await tx.get('gm_operations',id);
   if(previous){requireThat(previous.fingerprint===fingerprint,'REQUEST_REUSED','请求编号已用于其他操作');return previous.result;}
   let result:Rules;
   if(input.action==='saveGift'){
    const definition=giftDefinition(input),templateId=input.templateId?text(input.templateId,150,'礼包标识'):randomUUID();
    if(input.templateId)requireThat(await tx.get('gm_templates',templateId),'NOT_FOUND','礼包不存在',404);
    await tx.put('gm_templates',{id:templateId,...definition,updatedAt:now});result={id:templateId,name:definition.name};
   }else if(input.action==='sendGift'||input.action==='issueBuff'){
    requireThat(input.scope==='all'||input.scope==='player','GM_SCOPE','请选择全服或指定玩家',400);
    const userId=input.scope==='player'?text(input.userId,200,'玩家 ID'):null;
    const accounts=await tx.list('accounts',userId?{userId}:{});
    if(input.action==='sendGift'){
     const gift=await tx.get('gm_templates',text(input.templateId,150,'礼包标识'));requireThat(gift,'NOT_FOUND','礼包不存在',404);
     requireThat(accounts.length>0,'GM_RECIPIENTS','没有可接收礼包的存档',400);
     for(const a of accounts){await tx.insert('gm_deliveries',{id:randomUUID(),accountId:a.id,status:'pending',gift:{name:gift.name,description:gift.description,copper:gift.copper,items:gift.items},createdAt:now,operationId:id});await bump(tx,a.id);}
     result={recipients:accounts.length,name:gift.name};
    }else{
     const definition=buffDefinition(input),buffId=randomUUID();
     const active=[...(await tx.list('gm_buffs')).filter(buff=>buff.endsWall>now),{scope:input.scope,userId,effects:definition.effects}];
     for(const target of new Set(['',...active.map(buff=>buff.userId).filter(Boolean)])){
      const group=active.filter(buff=>buff.scope==='all'||buff.userId===target);
      requireThat(group.length<=32&&group.reduce((rate,buff)=>rate*(buff.effects.xpMultiplier||1),1)<=1000&&group.reduce((rate,buff)=>rate*(buff.effects.movementMultiplier||1),1)<=10,'GM_BUFF_LIMIT','同一玩家最多同时获得 32 个 GM Buff；叠加后经验倍率不得超过 1000、移动倍率不得超过 10。',400);
     }
     await tx.insert('gm_buffs',{id:buffId,...definition,scope:input.scope,userId,startsWall:now,endsWall:now+definition.durationMinutes*60000,createdAt:now,revoked:false});
     await this.refreshBuffs(tx,accounts.map(a=>a.id));result={id:buffId,recipients:accounts.length,name:definition.name};
    }
   }else if(input.action==='revokeBuff'){
    const buff=await tx.get('gm_buffs',text(input.buffId,150,'Buff 标识'));requireThat(buff,'NOT_FOUND','Buff 不存在',404);
    requireThat(!buff.revoked&&buff.endsWall>now,'GM_EXPIRED','Buff 已结束');
    await tx.put('gm_buffs',{...buff,revoked:true,endsWall:now});
    const accounts=await tx.list('accounts',buff.scope==='player'?{userId:buff.userId}:{});
    await this.refreshBuffs(tx,accounts.map(a=>a.id));result={id:buff.id,name:buff.name};
   }else{requireThat(false,'GM_ACTION','未知的管理操作',400);}
   const target=['sendGift','issueBuff'].includes(input.action)?(input.scope==='all'?'全服':input.userId):(input.buffId||result.id);
   await tx.insert('gm_operations',{id,adminId,action:input.action,target,reason,createdAt:now,fingerprint,result});
   return result;
  });
 }
 private async refreshBuffs(tx:Transaction,ids:string[]){
  invalidateGmBuffCache(tx);
  const affected=new Set(ids);
  for(const id of ids)await bump(tx,id);
  for(const activity of await tx.list<Activity>('activities'))if(affected.has(activity.accountId)&&activity.status==='running'){
   await invalidateCombatPlan(tx,activity);await tx.put('activities',activity);
  }
  for(const instance of await tx.list<Instance>('instances'))if(instance.simulation&&instance.status!=='completed'&&instance.roster.some(row=>affected.has(row.accountId))){
   await applyGmBuffs(tx,instance.simulation,instance.creatorAccountId,new Map(instance.roster.map(row=>[row.characterId,row.accountId])));
   await invalidateCombatPlan(tx,instance);instance.sequence++;await tx.put('instances',instance);
  }
 }
}
export async function giftInbox(store:Store,accountId:string){return store.read(async tx=>{
 requireThat(await tx.get('accounts',accountId),'NOT_FOUND','存档不存在',404);
 return (await tx.list('gm_deliveries',{accountId,status:'pending'})).sort((a,b)=>b.createdAt-a.createdAt).map(({id,gift,createdAt})=>({id,gift,createdAt}));
});}
export async function claimGmGift(tx:Transaction,c:Character,state:Rules,id:unknown,now:number){
 requireThat(typeof id==='string'&&id.length<=300,'GM_GIFT','礼包编号无效',400);
 const delivery=await tx.get('gm_deliveries',id);
 requireThat(delivery?.accountId===c.accountId,'NOT_FOUND','礼包不存在',404);
 if(delivery.status==='claimed')return state;
 requireThat(delivery.status==='pending','GM_GIFT','礼包不可领取');
 // receive checks stacking, bag capacity and unique-item limits. Work on a clone
 // and persist the claim in the caller's asset transaction, never partially grant.
 const next=structuredClone(state);
 try{for(const item of delivery.gift.items)receive(next,item.id,item.count);}
 catch(error){const message=(error as Error).message;requireThat(false,'GM_BAG',message.includes('空间不足')?'背包空间不足，请先清理背包再领取，礼包已为你保留。':message,400);}
 requireThat(Number.isSafeInteger(next.money+delivery.gift.copper),'GM_BALANCE','金币已达上限，礼包暂未领取',400);
 next.money+=delivery.gift.copper;
 await tx.put('gm_deliveries',{...delivery,status:'claimed',claimedAt:now,characterId:c.id});
 return next;
}
