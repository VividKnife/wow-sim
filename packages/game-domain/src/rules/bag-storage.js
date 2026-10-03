import {items,nameOf} from './catalog.js';

// Classic catalog BagFamily is an enum (not a bit mask). Container subclasses
// define accepted families even when the container's own BagFamily is zero.
const families={0:'通用背包',1:'箭袋',2:'弹药袋',3:'灵魂袋',6:'草药袋',7:'附魔袋'};
export function bagFamily(item){
 if(!item?.ContainerSlots)return null;
 if(item.class===11)return({2:1,3:2})[item.subclass]??null;
 if(item.class===1)return({0:0,1:3,2:6,3:7})[item.subclass]??null;
 return null;
}
export const bagType=item=>families[bagFamily(item)]||'';
export function itemBagFamily(item){
 if(!item||item.ContainerSlots)return 0;
 if(item.class===6)return({2:1,3:2})[item.subclass]||0;
 return item.enchant?7:item.BagFamily||0;
}
export function bagAccepts(container,item){const family=bagFamily(container);return family!==null&&(family===0||family===itemBagFamily(item));}
export const bagCapacity=s=>16+(s.bags||[]).reduce((sum,bag)=>sum+(bagFamily(items[bag.id])===null?0:items[bag.id].ContainerSlots),0);

// Placement is derived from the persisted stack order and equipped containers.
// No duplicated per-item location can become stale after consuming/transferring
// a stack. Each family is disjoint, so specialized-first packing is optimal.
export function bagLayout(s,inventory=s.bag||[],equipped=s.bags||[]){
 const containers=[{index:0,uid:null,itemId:0,name:'行囊',type:'通用背包',family:0,capacity:16,uids:[]}];
 equipped.forEach((bag,index)=>{const item=items[bag.id],family=bagFamily(item);if(family!==null)containers.push({index:index+1,uid:bag.uid,itemId:bag.id,name:nameOf('items',bag.id),type:families[family],family,capacity:item.ContainerSlots,uids:[]});});
 const remaining=[];
 for(const stack of inventory){
  const family=itemBagFamily(items[stack.id]),target=family&&containers.find(bag=>bag.family===family&&bag.uids.length<bag.capacity);
  if(target)target.uids.push(stack.uid);else remaining.push(stack);
 }
 const overflow=[];
 for(const stack of remaining){const target=containers.find(bag=>bag.family===0&&bag.uids.length<bag.capacity);if(target)target.uids.push(stack.uid);else overflow.push(stack.uid);}
 return{containers:containers.map(bag=>({...bag,free:bag.capacity-bag.uids.length})),overflow};
}
export const fitsBags=(s,inventory=s.bag,equipped=s.bags)=>bagLayout(s,inventory,equipped).overflow.length===0;
export function bagSpaceFor(s,id){
 const max=Math.max(1,items[id]?.stackable||1),family=itemBagFamily(items[id]),layout=bagLayout(s);
 if(layout.overflow.length)return 0;
 const partial=(s.bag||[]).filter(item=>item.id===id).reduce((sum,item)=>sum+Math.max(0,max-item.count),0);
 return partial+layout.containers.filter(bag=>bag.family===0||family&&bag.family===family).reduce((sum,bag)=>sum+bag.free*max,0);
}
export const generalBagFree=s=>bagLayout(s).containers.filter(bag=>bag.family===0).reduce((sum,bag)=>sum+bag.free,0);
