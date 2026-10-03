import {weaponItemUses} from '../../../game-data/epic-weapons.js';
import {items,nameOf,nodes} from './catalog.js';
import {clone,log} from './character.js';
import {receive} from './inventory.js';
import {contentPhase} from './content-phase.js';

const owned=(s,id)=>[...(s.bag||[]),...(s.bank||[]),...(s.pending||[]),...Object.values(s.equipment||{}),...(s.party||[]).flatMap(c=>Object.values(c.equipment||{}))].some(i=>i?.id===id);
const usable=(s,id)=>(s.bag||[]).filter(i=>i.id===id&&!i.locked&&!i.issued&&(!i.ownerId||i.ownerId===s.id)).reduce((sum,i)=>sum+i.count,0);
function itemReward(s,action){
 const copy={...s,bag:clone(s.bag)};
 for(const [id,count]of action.inputs||[]){
  let remaining=count;
  for(const item of copy.bag.filter(i=>i.id===id&&!i.locked&&!i.issued&&(!i.ownerId||i.ownerId===s.id))){const n=Math.min(item.count,remaining);item.count-=n;remaining-=n;if(!remaining)break;}
  copy.bag=copy.bag.filter(i=>i.count>0);
 }
 for(const [id,count]of action.outputs)receive(copy,id,count);
 return copy;
}
export function weaponItemUse(s,instance){
 const action=weaponItemUses[instance.id];if(!action)return null;
 let reason=s.hp<=0?'角色已死亡':s.combat?'战斗中无法使用':!['idle','hunt'].includes(s.activity.type)?'请先结束当前活动':instance.locked?'物品已锁定':instance.issued?'无法使用借用物品':instance.ownerId&&instance.ownerId!==s.id?'物品属于其他角色':s.level<60?'需要达到 60 级':'';
 if(!reason&&(action.phase||1)>contentPhase(s))reason=`需要第 ${action.phase} 阶段内容`;
 if(!reason&&(action.classId&&s.classId!==action.classId||action.classIds&&!action.classIds.includes(s.classId)))reason='职业不符合要求';
 if(!reason&&action.location&&s.location!==action.location)reason='请前往'+nodes[action.location].name;
 if(!reason&&action.quests?.some(id=>!s.completed[id]))reason='请先完成武器任务线';
 if(!reason&&action.untilQuest&&(s.completed[action.untilQuest]||s.quests[action.untilQuest]))reason='已经领取或完成该任务';
 if(!reason&&action.once&&action.outputs.some(([id])=>owned(s,id)))reason='已经持有该物品';
 const remaining=action.transform?Math.max(0,(s.itemCooldowns?.['weapon:benediction']||0)-s.clock):0;
 if(!reason&&remaining)reason='祈福与咒逐的转化尚未冷却';
 if(!reason){const missing=action.inputs?.find(([id,count])=>usable(s,id)<count);if(missing)reason='缺少未锁定材料：'+nameOf('items',missing[0])+' ×'+missing[1];}
 if(!reason&&action.transform&&owned(s,action.transform))reason='已经持有转化后的武器';
 if(!reason&&!action.transform){try{itemReward(s,action);}catch(error){reason=error.message;}}
 const description=action.inputs?.map(([id,count])=>nameOf('items',id)+' ×'+count).join('、')|| (action.transform?'保留绑定、附魔与耐久；两种形态共用 30 分钟冷却':'节点式任务交互');
 return {canUse:!reason,reason,remaining,label:action.label,description};
}
export function useWeaponItem(s,instance){
 const view=weaponItemUse(s,instance);if(!view)return false;if(!view.canUse)throw new Error(view.reason);
 const action=weaponItemUses[instance.id];
 if(action.transform){
  // Preserve identity, ownership, enchantments, lock state and current durability.
  instance.id=action.transform;instance.durability=Math.min(instance.durability??items[instance.id].MaxDurability,items[instance.id].MaxDurability);
  s.itemCooldowns??={};s.itemCooldowns['weapon:benediction']=s.clock+action.cooldown;
 }else{
  // Stage the entire transaction so direct callers also keep inputs on full bags.
  const copy=itemReward(s,action);
  s.bag=copy.bag;s.itemSequence=copy.itemSequence;
 }
 log(s,view.label,'quest');return true;
}
