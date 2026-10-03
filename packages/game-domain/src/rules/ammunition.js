import {addItem} from './character.js';
import {items,nameOf} from './catalog.js';

export const DEFAULT_AMMO_TARGET=400;
export const vendorAmmo={2:[2512,2515,3030,11285],3:[2516,2519,3033,11284]};
const hunterAmmoSpells=new Set(['Auto Shot','Arcane Shot','Concussive Shot','Distracting Shot','Multi-Shot','Aimed Shot','Scatter Shot','Tranquilizing Shot','Serpent Sting','Scorpid Sting','Viper Sting','Wyvern Sting','Volley','Shoot']);
export function weaponAmmoType(c){return items[c?.equipment?.[18]?.id]?.ammo_type||0;}
export function ammoOptions(c,type=weaponAmmoType(c)){return(vendorAmmo[type]||[]).map(id=>items[id]).filter(item=>item&&item.RequiredLevel<=c.level).sort((a,b)=>b.RequiredLevel-a.RequiredLevel||b.ItemLevel-a.ItemLevel||b.entry-a.entry);}
function usable(c,item){return item?.class===6&&[2,3].includes(item.subclass)&&item.subclass===weaponAmmoType(c)&&item.RequiredLevel<=c.level;}
export function usableAmmoStacks(c){return(c.bag||[]).filter(stack=>stack.count>0&&!stack.locked&&!stack.issued&&(!stack.ownerId||stack.ownerId===c.id)&&usable(c,items[stack.id]));}
function counts(c){return c.inventoryCounts||Object.fromEntries(usableAmmoStacks(c).map(stack=>[stack.id,1]));}
export function selectedAmmo(c){return Object.entries(counts(c)).filter(([id,count])=>count>0&&usable(c,items[id])).map(([id])=>items[id]).sort((a,b)=>Number(b.entry===c.selectedAmmoId)-Number(a.entry===c.selectedAmmoId)||(b.dmg_min1||0)-(a.dmg_min1||0)||b.ItemLevel-a.ItemLevel||b.entry-a.entry)[0]||null;}
export function ammoCount(c){return c.inventoryCounts?Object.entries(c.inventoryCounts).reduce((sum,[id,count])=>sum+(usable(c,items[id])?count:0),0):usableAmmoStacks(c).reduce((sum,stack)=>sum+stack.count,0);}
export function consumesHunterAmmo(c,name){return c?.classId===3&&hunterAmmoSpells.has(name)&&weaponAmmoType(c)>0;}
export function consumeHunterAmmo(c){
 const ammo=selectedAmmo(c);if(!ammo)return null;
 const stack=usableAmmoStacks(c).find(stack=>stack.id===ammo.entry);if(!stack)return null;
 stack.count--;if(!stack.count)c.bag.splice(c.bag.indexOf(stack),1);
 return ammo;
}
export function selectAmmo(s,{uid}){
 const stack=usableAmmoStacks(s).find(stack=>stack.uid===uid);
 if(!stack)throw new Error('请选择背包中未锁定且匹配武器和等级的箭矢或子弹。');
 s.selectedAmmoId=stack.id;delete s.ammoEmptyLogged;
}
export function ammoView(s){
 const ammo=selectedAmmo(s),stacks=usableAmmoStacks(s),selected=stacks.find(stack=>stack.id===ammo?.entry);
 return{type:weaponAmmoType(s),count:ammoCount(s),itemId:ammo?.entry||0,uid:selected?.uid||null,selectedCount:stacks.filter(stack=>stack.id===ammo?.entry).reduce((sum,stack)=>sum+stack.count,0),name:ammo?nameOf('items',ammo.entry):'',selectable:stacks.map(stack=>stack.uid)};
}

// Used only when creating demo/NPC loadouts; ordinary players purchase supplies.
export function provisionAmmo(c,counts){
 c.bag=(c.bag||[]).filter(stack=>items[stack.id]?.class!==6);
 c.bags??=[];c.pending??=[];c.itemSequence??=0;
 for(const [id,total] of Object.entries(counts))addItem(c,Number(id),total);
}
