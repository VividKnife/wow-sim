import {items} from './catalog.js';
import {bagFamily,fitsBags} from './bag-storage.js';

export function equipBag(s,{uid,slot}){
 const instance=s.bag.find(item=>item.uid===uid),item=items[instance?.id];
 if(bagFamily(item)===null)throw new Error('请选择可装备的背包、箭袋或弹药袋。');
 if(instance.locked||instance.issued||instance.ownerId&&instance.ownerId!==s.id)throw new Error('请先解锁并使用属于自己的背包。');
 if(item.RequiredLevel>s.level||item.AllowableClass>0&&!(item.AllowableClass&(1<<(s.classId-1))))throw new Error('角色等级或职业不符合背包装备要求。');
 if(slot!==undefined&&(!Number.isInteger(slot)||slot<0||slot>Math.min(3,s.bags.length)))throw new Error('请选择有效的背包栏位。');
 const candidates=slot!==undefined?[slot]:s.bags.length<4?[s.bags.length]:s.bags.map((_,index)=>index).sort((a,b)=>items[s.bags[a].id].ContainerSlots-items[s.bags[b].id].ContainerSlots);
 for(const index of candidates){
  const bags=[...s.bags],old=bags[index];
  if(old?.locked||old?.issued)continue;
  const bag=s.bag.filter(item=>item.uid!==uid);if(old)bag.push(old);
  bags[index]={...instance,count:1,bound:instance.bound||item.bonding===2};
  if(bags[index].bound)bags[index].ownerId=s.id;else delete bags[index].ownerId;
  if(!fitsBags(s,bag,bags))continue;
  s.bags=bags;s.bag=bag;return;
 }
 throw new Error('储物空间不足，换下背包后无法安置所有物品；请先腾出匹配类型的空间。');
}
export function unequipBag(s,{slot}){
 if(!Number.isInteger(slot)||slot<0||slot>=s.bags.length)throw new Error('请选择已装备的背包。');
 const old=s.bags[slot];if(old.locked||old.issued)throw new Error('锁定或配发的背包不能卸下。');
 const bags=s.bags.filter((_,index)=>index!==slot),bag=[...s.bag,old];
 if(!fitsBags(s,bag,bags))throw new Error('储物空间不足，无法安置卸下的背包和物品。');
 s.bags=bags;s.bag=bag;
}
