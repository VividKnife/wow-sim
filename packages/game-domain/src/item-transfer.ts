import type {Transaction} from '../../persistence/src/store.ts';
import type {GameService} from './service.ts';
import {type Character, type Activity, type ActorLease, type Item, type Rules, requireThat} from './model.ts';
import {owned, context, persistAssets, economicEvent} from './context.ts';
import {items} from './rules/catalog.js';
import {bagCapacity} from './rules/character.js';
import {put, quantity, transferBlockedReason} from './rules/inventory.js';
import {invalidateCombatPlan} from './combat-execution.ts';

// All validation and both inventories are committed together by command().
export async function transferItems(this:GameService, tx:Transaction, source:Character, cmd:Rules, now:number) {
 const target=await owned(tx,source.accountId,cmd.recipientId);
 requireThat(target.id!==source.id,'TRANSFER_TARGET','请选择其他角色');
 requireThat(Array.isArray(cmd.items)&&cmd.items.length>0&&cmd.items.length<=200&&cmd.items.every((i:Rules)=>i&&typeof i.uid==='string')&&new Set(cmd.items.map((i:Rules)=>i.uid)).size===cmd.items.length,'TRANSFER_ITEMS','请选择物品，且不能重复选择');
 const activities=new Map<string,Activity>();
 for(const actor of [source,target]) {
  const lease=await tx.get<ActorLease>('actor_leases',actor.id);
  if(!lease)continue;
  const activity=lease.kind==='activity'?await tx.get<Activity>('activities',lease.ownerId):null;
  requireThat(activity?.type==='personal','ACTOR_BUSY','请先结束副本或后台订单，再转移物品');
  activities.set(activity!.id,activity!);
 }
 for(const activity of activities.values()) {
  await this.settleActivity(tx,activity,now);
  const leader=await owned(tx,source.accountId,activity.actorId);
  const shared=await this.personalContext(tx,leader,now);
  requireThat(!shared.combat&&!shared.escort&&['idle','hunt'].includes(shared.activity.type),'ACTOR_BUSY','请先结束队伍战斗或赶路，再转移物品');
 }
 const from=await context(tx,await owned(tx,source.accountId,source.id),now,false);
 const to=await context(tx,await owned(tx,source.accountId,target.id),now,false);
 requireThat(!from.combat&&!to.combat&&from.hp>0&&to.hp>0,'ACTOR_BUSY','角色需要存活且脱离战斗才能转移物品');
 requireThat(from.location===to.location,'TRANSFER_LOCATION','两个角色需要位于同一地点');
 for(const selection of cmd.items) {
  const item=from.bag.find((i:Rules)=>i.uid===selection.uid);
  requireThat(item,'ITEM_MISSING','物品已不在背包中，请重新选择');
  const reason=transferBlockedReason(item);
  requireThat(!reason,'ITEM_PROTECTED',reason||'物品无法转移');
  const count=quantity(selection.count,item.count);
  const maximum=items[item.id]?.maxcount||0;
  const held=[...to.bag,...to.bags,...to.bank,...to.pending,...Object.values(to.equipment),...to.auctions.map((a:Rules)=>a.item)] as Rules[];
  requireThat(!maximum||held.filter(i=>i.id===item.id).reduce((n,i)=>n+i.count,0)+count<=maximum,'UNIQUE_ITEM','接收角色已达到唯一物品持有上限');
  const whole=count===item.count;
  const moved={...item,count,uid:whole?item.uid:this.id(),...(item.ownerId?{ownerId:target.id}:{})};
  put(to.bag,moved,bagCapacity(to));
  if(whole) {
   from.bag=from.bag.filter((i:Rules)=>i.uid!==item.uid);
   const row=(await tx.get<Item>('items',item.uid))!;
   row.ownerCharacterId=target.id;
   await tx.put('items',row);
  }else item.count-=count;
 }
 const key=`command:${source.accountId}:${cmd.requestId}`;
 await persistAssets(tx,source,from,key,this.id);
 await persistAssets(tx,target,to,key,this.id);
 for(const activity of activities.values()) {
  await invalidateCombatPlan(tx,activity);
  await tx.put('activities',activity);
 }
 await economicEvent(tx,key,source.accountId,'itemTransfer',{from:source.id,to:target.id,items:cmd.items});
}
