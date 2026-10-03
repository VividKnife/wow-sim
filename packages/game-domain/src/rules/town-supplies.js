import {items,spells,classAbilities,classItemInventory,table,nameOf,icon,nodes} from './catalog.js';
import {countItem} from './character.js';
import {ammoOptions,weaponAmmoType} from './ammunition.js';
import {shop} from './shop.js';

const vendorIds=new Set([...table('npc_vendor').map(row=>row.item),...classItemInventory.filter(item=>item.sources.some(source=>['npc_vendor','npc_vendor_template'].includes(source.table))).map(item=>item.itemId)]);
const goods=[...vendorIds].map(id=>items[id]).filter(item=>item&&item.BuyPrice>0&&item.RequiredLevel<=60&&item.class!==6);
const isTown=s=>['town','city','outpost'].includes(nodes[s.location]?.kind);
const itemKey=id=>`item:${id}`;
function classReagents(s){
 const ids=new Set();
 for(const ability of classAbilities[s.classId]||[]){
  if(ability.requiredLevel>s.level)continue;
  const spell=spells[ability.spellId];
  for(let n=1;n<=8;n++)if(spell?.['Reagent'+n]>0)ids.add(spell['Reagent'+n]);
 }
 return ids;
}
function foodKind(item){const spell=spells[item.spellid_1];return spell?.EffectApplyAuraName1===84?'食物':spell?.EffectApplyAuraName1===85?'饮水':null;}
const optionCache=new Map();
export function supplyOptions(s){
 const cacheKey=`${s.classId}:${s.raceId}:${s.level}:${weaponAmmoType(s)}`;
 if(optionCache.has(cacheKey))return optionCache.get(cacheKey);
 const reagents=classReagents(s),mana=![1,4].includes(s.classId),type=weaponAmmoType(s);
 const options=[2,3].map(typeId=>{const item=ammoOptions(s,typeId)[0];return{key:typeId===2?'arrows':'bullets',name:typeId===2?'箭矢':'子弹',itemId:item?.entry||0,icon:item?icon('items',item.entry):null,category:'弹药',priority:s.classId===3?(type===typeId?0:1):8,level:item?.RequiredLevel||1};});
 for(const item of goods){
  const food=foodKind(item),reagent=reagents.has(item.entry),usable=item.RequiredLevel<=s.level;
  const category=reagent?'职业施法材料':food||'商店物品';
  const priority=!usable?20:reagent?2:food==='饮水'&&mana?3:food==='食物'?4:food==='饮水'?7:9;
  options.push({key:itemKey(item.entry),name:nameOf('items',item.entry),itemId:item.entry,icon:icon('items',item.entry),category,priority,level:item.RequiredLevel});
 }
 options.sort((a,b)=>a.priority-b.priority||b.level-a.level||a.itemId-b.itemId);
 optionCache.set(cacheKey,options);return options;
}
export function configureTownSupplies(s,{entries}){
 if(!Array.isArray(entries)||entries.length>32)throw new Error('城镇补给最多设置 32 种物品。');
 const options=new Set(supplyOptions(s).map(option=>option.key)),seen=new Set();
 for(const entry of entries){
  if(!entry||!options.has(entry.key)||seen.has(entry.key)||typeof entry.enabled!=='boolean'||!Number.isInteger(entry.target)||entry.target<1||entry.target>10000)throw new Error('请选择不重复的商店物品，补齐数量必须是 1—10000 的整数。');
  seen.add(entry.key);
 }
 s.townSupplies=entries.map(({key,enabled,target})=>({key,enabled,target}));
 s.townSupplyRevision=(s.townSupplyRevision||0)+1;
}
function resolveItem(s,key,stock){return ['arrows','bullets'].includes(key)?ammoOptions(s,key==='arrows'?2:3).find(item=>stock.some(row=>row.id===item.entry)):items[Number(key.slice(5))];}
export function townSupplyView(s,stock=shop(s)){
 const local=new Set(stock.map(row=>row.id));
 return{visit:s.townSupplyVisit||0,revision:s.townSupplyRevision||0,entries:(s.townSupplies||[]).map(entry=>{const item=resolveItem(s,entry.key,stock);return{...entry,itemId:item?.entry||0,current:item?countItem(s,item.entry):0,purchaseLimit:item?.maxcount>0?Math.max(0,item.maxcount-Object.values(s.equipment).filter(e=>e.id===item.entry).length):null,available:!!item&&isTown(s)&&local.has(item.entry)&&item.RequiredLevel<=s.level};}),options:supplyOptions(s)};
}
// The client observes each arrival and buys through the ordinary shop API.
export function handleTownSupplies(s){if(isTown(s))s.townSupplyVisit=(s.townSupplyVisit||0)+1;}
