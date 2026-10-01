// Use the same purchase and loading commands as the shop and inventory UI.
// Read the latest accepted snapshot after every command; never predict assets.
export async function restockHunterAmmo({getSnapshot,send,actorId,memberId,visit,target}){
 if(!Number.isInteger(target)||target<1||target>10000)throw new Error('补齐数量必须是 1—10000 的整数。');
 for(let step=0;step<200;step++){
  const snapshot=getSnapshot(),s=snapshot?.player,d=snapshot?.view,prompt=d?.ammoPrompt;
  if(s?.id!==actorId||prompt?.memberId!==memberId||prompt.visit!==visit)throw new Error('角色或补给任务已改变，请重新操作。');
  if(s.combat||s.dungeon||!['idle','hunt'].includes(s.activity.type)||!['town','city','outpost'].includes(d.location?.kind))throw new Error('请在城镇空闲时补充弹药。');
  const row=d.ammo.find(row=>row.id===memberId);
  if(!row)throw new Error('猎人成员已离开队伍。');
  if(row.count>=target)return;
  // Load existing stacks first, including a purchase whose loading was
  // interrupted by a disconnect. A retry must not buy those rounds again.
  const stack=row.loadable[0];
  if(stack){
   if(!await send({type:'loadAmmo',memberId,uid:stack.uid}))throw new Error('弹药装填未完成，请查看操作提示后重试。');
   continue;
  }
  const item=d.shop.find(item=>item.id===prompt.itemId);
  if(!item)throw new Error('当地商人没有适合当前武器和等级的弹药。');
  if(s.money<item.price)return;
  if(s.bag.length>=d.bagCapacity)throw new Error('背包空间不足，请腾出一格后重试补给。');
  // One pack at a time fits one free slot even for a large target. Loading it
  // immediately frees the slot for the next ordinary purchase.
  if(!await send({type:'buy',id:item.id,count:1}))throw new Error('弹药购买未完成，请查看操作提示后重试。');
 }
 throw new Error('补给尚未完成，请重试。');
}
