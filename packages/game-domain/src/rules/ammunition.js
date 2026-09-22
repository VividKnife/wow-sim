import {items,nameOf,nodes} from './catalog.js';
import {log} from './character.js';

export const AMMO_LOW_THRESHOLD=400;
export const DEFAULT_AMMO_TARGET=400;
const vendorAmmo={
  2:[2512,2515,3030,11285],
  3:[2516,2519,3033,11284],
};
const hunterAmmoSpells=new Set(['Auto Shot','Arcane Shot','Concussive Shot','Distracting Shot','Multi-Shot','Aimed Shot','Scatter Shot','Tranquilizing Shot','Serpent Sting','Scorpid Sting','Viper Sting','Wyvern Sting','Volley','Shoot']);

export function weaponAmmoType(c){return items[c?.equipment?.[18]?.id]?.ammo_type||0;}
export function ammoOptions(c){return(vendorAmmo[weaponAmmoType(c)]||[]).map(id=>items[id]).filter(item=>item&&item.RequiredLevel<=c.level).sort((a,b)=>b.RequiredLevel-a.RequiredLevel||b.ItemLevel-a.ItemLevel||b.entry-a.entry);}
export function selectedAmmo(c){const type=weaponAmmoType(c);return Object.entries(c?.ammunition||{}).filter(([,count])=>count>0).map(([id])=>items[id]).filter(item=>item?.class===6&&item.subclass===type).sort((a,b)=>(b.dmg_min1||0)-(a.dmg_min1||0)||b.ItemLevel-a.ItemLevel||b.entry-a.entry)[0]||null;}
export function ammoCount(c){const type=weaponAmmoType(c);return Object.entries(c?.ammunition||{}).reduce((count,[id,value])=>count+(items[id]?.class===6&&items[id]?.subclass===type?value:0),0);}
export function consumesHunterAmmo(c,name){return c?.classId===3&&hunterAmmoSpells.has(name)&&weaponAmmoType(c)>0;}
export function consumeHunterAmmo(c){const ammo=selectedAmmo(c);if(!ammo)return null;c.ammunition[ammo.entry]--;return ammo;}
export function isTown(s){return['town','city','outpost'].includes(nodes[s.location]?.kind);}

function members(s){return[s,...(s.party||[])].filter(c=>c.classId===3&&weaponAmmoType(c)>0);}
function targetFor(c){return Number.isInteger(c.ammoPolicy?.target)?c.ammoPolicy.target:DEFAULT_AMMO_TARGET;}
function purchasePlan(c,target=targetFor(c)){
 const item=ammoOptions(c)[0];if(!item)return null;
 const current=ammoCount(c),packSize=Math.max(1,item.BuyCount||1),packs=Math.max(0,Math.ceil((target-current)/packSize));
 return{item,current,packSize,packs,count:packs*packSize,cost:packs*item.BuyPrice};
}
export function restockAmmo(s,c,target=targetFor(c)){
 const plan=purchasePlan(c,target);if(!plan||!plan.packs)return{bought:0,cost:0};
 const affordable=Math.min(plan.packs,Math.floor(s.money/plan.item.BuyPrice));
 if(!affordable){log(s,`${c.name} 的弹药不足，钱币不足无法自动补给。`,'trade',{actorId:c.id});return{bought:0,cost:0};}
 const bought=affordable*plan.packSize,cost=affordable*plan.item.BuyPrice;
 c.ammunition??={};c.ammunition[plan.item.entry]=(c.ammunition[plan.item.entry]||0)+bought;delete c.ammoEmptyLogged;s.money-=cost;
 log(s,`为 ${c.name} 自动购买 ${nameOf('items',plan.item.entry)} ×${bought}，花费 ${cost} 铜。`,'trade',{actorId:c.id,itemId:plan.item.entry,amount:bought});
 return{bought,cost,itemId:plan.item.entry};
}
function nextPrompt(s,trigger,preferredId,excluded=new Set()){
 const available=members(s).filter(c=>!excluded.has(c.id)&&!c.ammoPolicy?.enabled&&ammoCount(c)<AMMO_LOW_THRESHOLD);
 const member=available.find(c=>c.id===preferredId)||available[0];
 if(member)s.ammoRestockPrompt={memberId:member.id,trigger,handled:[...excluded]};else delete s.ammoRestockPrompt;
}
export function handleTownAmmo(s,trigger='town',preferredId){
 if(!isTown(s))return;
 for(const c of members(s))if(c.ammoPolicy?.enabled&&ammoCount(c)<AMMO_LOW_THRESHOLD)restockAmmo(s,c);
 nextPrompt(s,trigger,preferredId);
}
export function configureAmmo(s,{memberId,enabled,target}){
 if(typeof enabled!=='boolean')throw new Error('自动补给设置无效。');
 if(!Number.isInteger(target)||target<1||target>10000)throw new Error('自动补给数量必须是 1—10000 的整数。');
 const c=members(s).find(member=>member.id===memberId);if(!c)throw new Error('猎人成员不存在或未装备远程武器。');
 c.ammoPolicy={enabled,target};
 return c;
}
export function resolveAmmoPrompt(s,action){
 if(!isTown(s))throw new Error('只能在城镇补充弹药。');
 const c=configureAmmo(s,action);if(action.enabled)restockAmmo(s,c,action.target);
 if(s.ammoRestockPrompt)nextPrompt(s,s.ammoRestockPrompt.trigger,undefined,new Set([...(s.ammoRestockPrompt.handled||[]),action.memberId]));
}
// Purchased, crafted and transferred stacks remain normal items until loaded.
export function loadAmmo(s,{memberId,uid}){
 const c=members(s).find(member=>member.id===memberId),stack=s.bag.find(item=>item.uid===uid),item=items[stack?.id];
 if(!c||!stack||item?.class!==6||item.subclass!==weaponAmmoType(c)||item.RequiredLevel>c.level)throw new Error('请选择匹配武器和等级的弹药。');
 if(stack.locked||stack.issued)throw new Error('锁定或配发的弹药不能装填。');
 c.ammunition??={};c.ammunition[stack.id]=(c.ammunition[stack.id]||0)+stack.count;
 s.bag=s.bag.filter(item=>item.uid!==uid);delete c.ammoEmptyLogged;
 log(s,`为 ${c.name} 装填 ${nameOf('items',stack.id)} ×${stack.count}。`,'trade',{actorId:c.id});
}
export function ammoView(s){return members(s).map(c=>{
 const plan=purchasePlan(c),ammo=selectedAmmo(c);
 const loadable=s.bag.filter(stack=>{const item=items[stack.id];return !stack.locked&&!stack.issued&&item?.class===6&&item.subclass===weaponAmmoType(c)&&item.RequiredLevel<=c.level;}).map(stack=>({uid:stack.uid,name:nameOf('items',stack.id),count:stack.count}));
 return{id:c.id,name:c.name,count:ammoCount(c),itemId:ammo?.entry||plan?.item.entry||0,itemName:ammo?nameOf('items',ammo.entry):plan?nameOf('items',plan.item.entry):'',enabled:!!c.ammoPolicy?.enabled,target:targetFor(c),loadable};
});}
export function ammoPromptView(s){
 const prompt=s.ammoRestockPrompt,c=members(s).find(member=>member.id===prompt?.memberId);if(!prompt||!c)return null;
 const plan=purchasePlan(c);if(!plan)return null;
 return{...prompt,name:c.name,current:plan.current,threshold:AMMO_LOW_THRESHOLD,target:targetFor(c),itemId:plan.item.entry,itemName:nameOf('items',plan.item.entry),packSize:plan.packSize,packPrice:plan.item.BuyPrice,cost:plan.cost,balance:s.money,affordable:s.money>=plan.cost};
}
