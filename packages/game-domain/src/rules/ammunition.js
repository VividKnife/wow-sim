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
function purchasePlan(c,target=targetFor(c),stock){
 const item=ammoOptions(c).find(item=>!stock||stock.some(row=>row.id===item.entry));if(!item)return null;
 const current=ammoCount(c),packSize=Math.max(1,item.BuyCount||1),packs=Math.max(0,Math.ceil((target-current)/packSize));
 return{item,current,packSize,packs,count:packs*packSize,cost:packs*item.BuyPrice};
}
function nextPrompt(s,trigger,preferredId,excluded=new Set(),visit=s.clock){
 const available=members(s).filter(c=>!excluded.has(c.id)&&ammoCount(c)<AMMO_LOW_THRESHOLD);
 const member=available.find(c=>c.id===preferredId)||available[0];
 if(member)s.ammoRestockPrompt={memberId:member.id,trigger,visit,handled:[...excluded]};else delete s.ammoRestockPrompt;
}
export function handleTownAmmo(s,trigger='town',preferredId){
 if(!isTown(s))return;
 nextPrompt(s,trigger,preferredId);
}
export function configureAmmo(s,{memberId,enabled,target}){
 if(typeof enabled!=='boolean')throw new Error('自动补给设置无效。');
 if(!Number.isInteger(target)||target<1||target>10000)throw new Error('自动补给数量必须是 1—10000 的整数。');
 const c=members(s).find(member=>member.id===memberId);if(!c)throw new Error('猎人成员不存在或未装备远程武器。');
 c.ammoPolicy={enabled,target};
 const prompt=s.ammoRestockPrompt;
 if(prompt?.memberId===memberId)nextPrompt(s,prompt.trigger,undefined,new Set([...(prompt.handled||[]),memberId]),prompt.visit);
 return c;
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
export function ammoPromptView(s,stock){
 const prompt=s.ammoRestockPrompt,c=members(s).find(member=>member.id===prompt?.memberId);if(!prompt||!c)return null;
 if(!isTown(s)||s.combat||s.dungeon||!['idle','hunt'].includes(s.activity.type))return null;
 const plan=purchasePlan(c,targetFor(c),stock);
 return{...prompt,name:c.name,enabled:!!c.ammoPolicy?.enabled,current:ammoCount(c),threshold:AMMO_LOW_THRESHOLD,target:targetFor(c),itemId:plan?.item.entry||0,itemName:plan?nameOf('items',plan.item.entry):'',packSize:plan?.packSize||200,packPrice:plan?.item.BuyPrice||0,cost:plan?.cost||0,balance:s.money,available:!!plan};
}
