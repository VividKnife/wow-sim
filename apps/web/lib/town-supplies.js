const inTown=snapshot=>snapshot?.player?.hp>0&&!snapshot.player.combat&&!snapshot.player.dungeon&&['idle','hunt'].includes(snapshot.player.activity?.type)&&['town','city','outpost'].includes(snapshot.view?.location?.kind);
export function townSupplyRunKey(snapshot){
 if(!inTown(snapshot))return null;
 const {player:s,view:d}=snapshot;
 return JSON.stringify([s.id,s.location,d.townSupplies?.visit||0,d.townSupplies?.revision||0,(s.townSupplies||[])]);
}
// Every iteration reads accepted server state. The ordinary buy endpoint remains
// authoritative for price, stock, capacity and wallet mutations.
export async function restockTownSupplies({getSnapshot,send,runKey,isCancelled=()=>false}){
 if(!runKey)return;
 for(;;){
  const snapshot=getSnapshot();
  if(isCancelled()||townSupplyRunKey(snapshot)!==runKey)return;
  const {player:s,view:d}=snapshot;
  let purchase=null;
  for(const entry of d.townSupplies?.entries||[]){
   if(!entry.enabled||!entry.available||entry.current>=entry.target)continue;
   const row=d.shop.find(item=>item.id===entry.itemId),item=d.items?.[entry.itemId];
   if(!row||row.price<=0||s.money<row.price||item?.level>s.level||entry.purchaseLimit!=null&&entry.current+row.count>entry.purchaseLimit)continue;
   // Let the server enforce partial-stack capacity; a failed pack stops this
   // run, so a full bag cannot generate an automatic retry storm.
   purchase=row;break;
  }
  if(!purchase)return;
  const before=s.bag.filter(item=>item.id===purchase.id).reduce((sum,item)=>sum+item.count,0);
  if(!await send({type:'buy',id:purchase.id,count:1}))return;
  const next=getSnapshot();
  if(isCancelled()||townSupplyRunKey(next)!==runKey)return;
  const after=next.player.bag.filter(item=>item.id===purchase.id).reduce((sum,item)=>sum+item.count,0);
  if(after<=before)return;
  const stack=next.player.bag.find(item=>item.id===purchase.id&&next.view.ammo?.selectable?.includes(item.uid));
  if(stack&&!await send({type:'selectAmmo',uid:stack.uid}))return;
 }
}
