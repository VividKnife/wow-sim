import {beginSpellTiming,finishSpellTiming,cooldownUntil,gcdUntil} from './spell-timing.js';
import {beginHunterTaming} from './combat.js';
import {classBookUse,useClassBook} from './class-acquisition.js';
import {beginMount,mountView} from './mounts.js';
import {items,nodes,nameOf,icon} from './catalog.js';
import {spellInfo,stats,roll,log,bagCapacity,addItem} from './character.js';
import {usableCount,consume} from './inventory.js';
import {stopRecovery} from './recovery.js';
import {beginHearth,hearthstoneView} from './hearthstone.js';
import {leaveDungeon} from './dungeon.js';
import {applyLongBuff} from './auto-buffs.js';
import {potions} from './profession-data.js';
import {elixirEffects,elixirDurationMs} from './utility-data.js';
import {classUtilityUse,beginClassUtility,classUtilityView} from './class-utility.js';
import {classItemUse,useClassItem} from './class-items.js';
import {handleTownAmmo} from './ammunition.js';

const teleports={3561:'stormwind',3562:'ironforge'};
const mageBuffs=new Set(['Frost Armor','Arcane Intellect']);
const unavailable=s=>s.hp<=0?'角色已死亡':s.escort?'正在护送，请先结束护送':s.combat?'战斗中无法使用':!['idle','hunt'].includes(s.activity.type)?'请先结束当前活动':'';
const conjuredCount=(s,sp)=>Math.min(20,2+Math.max(0,s.level-sp.SpellLevel)*2);
const bagRoom=(s,id)=>s.bag.reduce((n,i)=>n+(i.id===id?Math.max(0,(items[id]?.stackable||1)-i.count):0),0)+Math.max(0,bagCapacity(s)-s.bag.length)*(items[id]?.stackable||1);
const reagents=sp=>Array.from({length:8},(_,i)=>({id:sp['Reagent'+(i+1)],count:sp['ReagentCount'+(i+1)]})).filter(r=>r.id>0&&r.count>0);

export function skillUseView(s,id){
 if([13819,23214,5784,23161].includes(id)){const m=mountView(s).collection.find(m=>m.id===id);return m?{canUse:m.canMount,reason:m.reason,label:'召唤坐骑',description:`移动速度提高 ${m.bonus}%`}:null;}
 const extended=classUtilityUse(s,id);if(extended)return extended;
 const sp=spellInfo(s,id);if(!sp)return null;
 const conjure=['Conjure Food','Conjure Water'].includes(sp.SpellName),to=teleports[id];
 if(!conjure&&!to&&!mageBuffs.has(sp.SpellName))return null;
 const remaining=Math.max(0,cooldownUntil(s,sp)-s.clock,gcdUntil(s,sp)-s.clock);
 let reason=unavailable(s)||(!s.learned.includes(id)?'尚未学习这个法术':'')||(s.mana<sp.mana?'法力不足':'')||(remaining?'技能尚未冷却':'');
 if(!reason&&to&&s.location===to&&!s.dungeon)reason='你已经在目的地';
 if(!reason&&conjure&&bagRoom(s,sp.EffectItemType1)<conjuredCount(s,sp))reason='背包空间不足';
 if(!reason){const missing=reagents(sp).find(r=>usableCount(s,r.id)<r.count);if(missing)reason='缺少未锁定材料：'+nameOf('items',missing.id)+' ×'+missing.count;}
 return {canUse:!reason,reason,remaining,castMs:sp.castMs,label:conjure?'制造':to?'传送':'施放',description:to?`传送至${nodes[to].name} · ${reagents(sp).map(r=>nameOf('items',r.id)+' ×'+r.count).join('、')}`:conjure?`制造 ${nameOf('items',sp.EffectItemType1)} ×${conjuredCount(s,sp)}`:'对自己施放'};
}

export function beginUtilitySpell(s,id,targetId){
 if(id===1515){const use=classUtilityUse(s,id,targetId);if(!use?.canUse)throw new Error(use?.reason||'当前无法驯服');beginHunterTaming(s,targetId);return;}
 if([13819,23214,5784,23161].includes(id)){beginMount(s,id);return;}
 if(beginClassUtility(s,id,targetId))return;
 const use=skillUseView(s,id);if(!use)throw new Error('这个法术需要在战斗策略中释放');if(!use.canUse)throw new Error(use.reason);
 const sp=spellInfo(s,id);if(mageBuffs.has(sp.SpellName)&&![s,...s.party].some(c=>c.id===(targetId||s.id)&&c.hp>0))throw new Error('请选择存活的队友');stopRecovery(s);s.cast=null;const timing=beginSpellTiming(s,sp,s.clock);
 if(['Conjure Food','Conjure Water'].includes(sp.SpellName))s.activity={type:'conjure',timing,spell:id,item:sp.EffectItemType1,count:conjuredCount(s,sp),startedAt:s.clock,endsAt:s.clock+sp.castMs};
 else if(teleports[id])s.activity={type:'teleport',timing,spell:id,to:teleports[id],startedAt:s.clock,endsAt:s.clock+sp.castMs};
 else{
  s.activity={type:'idle'};
  const kind=sp.SpellName==='Frost Armor'?'armor':sp.SpellName==='Arcane Intellect'?'int':sp.SpellName;
  const target=[s,...s.party].find(c=>c.id===(targetId||s.id));if(!target||target.hp<=0)throw new Error('请选择存活的队友');applyLongBuff(s,s,target,sp,kind);
 }
}

export function finishUtilitySpell(s){
 const a=s.activity;
 if(a.type==='conjure'){if(!finishSpellTiming(s,a.timing,s.clock))return;addItem(s,a.item,a.count);log(s,'制造了 '+nameOf('items',a.item)+' ×'+a.count,'loot');}
 else if(a.type==='teleport'){
  const required=reagents(spellInfo(s,a.spell));
  if(required.some(r=>usableCount(s,r.id)<r.count)){s.activity={type:'idle',reason:'传送材料不足，施法已取消'};return;}
  if(!finishSpellTiming(s,a.timing,s.clock))return;for(const r of required)consume(s,r.id,r.count);
  s.activity={type:'idle'};if(s.dungeon)leaveDungeon(s);
  s.location=a.to;if(!s.visited.includes(a.to))s.visited.push(a.to);s.groundEffects=[];
  log(s,'传送至 '+nodes[a.to].name,'travel');
  handleTownAmmo(s,'town');
 }
 s.activity={type:'idle'};stopRecovery(s);
}

// Only expose item effects that the imported spell data can actually execute.
const buffFamily=(id,values)=>`${items[id].subclass}:${Object.keys(values).sort().join(',')}`;
const itemCooldown=(s,id)=>Math.max(0,(s.itemCooldowns?.['item:'+id]||0)-s.clock,(s.itemCooldowns?.['category:'+items[id].spellcategory_1]||0)-s.clock);
function itemEffect(s,id){
 if(id===6948)return {kind:'hearth',label:'使用炉石'};
 if(potions[id])return {kind:'potion',label:'饮用药水',...potions[id]};
 if(elixirEffects[id])return {kind:'buff',label:'饮用药剂',sp:{Id:items[id].spellid_1,durationMs:elixirDurationMs},values:elixirEffects[id]};
 const i=items[id],sp=i?.class===0&&spellInfo(s,i.spellid_1);if(!sp)return null;
 if([84,85].includes(sp.EffectApplyAuraName1))return {kind:sp.EffectApplyAuraName1===84?'food':'water',label:sp.EffectApplyAuraName1===84?'进食':'饮水',sp};
 const values={};
 for(let n=1;n<=3;n++){
  if(!sp['Effect'+n])continue;
  const aura=sp['EffectApplyAuraName'+n],misc=sp['EffectMiscValue'+n],amount=sp['EffectBasePoints'+n]+1;
  if(sp['Effect'+n]!==6)return null;
  if(aura===29&&misc>=0&&misc<=4)values[['str','agi','sta','int','spi'][misc]]=amount;
  else if(aura===22&&misc===1)values.armor=amount;
  else if(aura===34)values.health=amount;
  else return null;
 }
 return Object.keys(values).length&&sp.durationMs>0?{kind:'buff',label:'使用增益物品',sp,values}:null;
}

export function itemUseView(s,instance){
 const book=classBookUse(s,instance);if(book)return book;
 const classUse=classItemUse(s,instance);if(classUse)return classUse;
 const effect=itemEffect(s,instance.id);if(!effect)return null;
 let reason=unavailable(s)||(instance.locked?'物品已锁定':'')||(instance.issued?'任务物品无法使用':'')||(items[instance.id].RequiredLevel>s.level?'等级不足':'');
 if(!reason&&effect.kind==='hearth')reason=hearthstoneView(s).reason;
 if(!reason&&['health','mana'].includes(effect.kind)&&(s.potionReady||0)>s.clock)reason='药水冷却中';
 if(!reason&&itemCooldown(s,instance.id)>0)reason='物品冷却中';
 if(!reason&&effect.kind==='buff'&&(s.itemBuffs||[]).some(b=>b.until>s.clock&&buffFamily(b.item,b.stats)===buffFamily(instance.id,effect.values)&&Object.entries(effect.values).some(([key,value])=>b.stats[key]>value)))reason='已有更强的同类增益';
 const st=stats(s);
 if(!reason&&['food','health'].includes(effect.kind)&&s.hp>=st.maxHp)reason='生命已满';
 if(!reason&&['water','mana'].includes(effect.kind)&&s.mana>=st.maxMana)reason='法力已满';
 const names={str:'力量',agi:'敏捷',sta:'耐力',int:'智力',spi:'精神',armor:'护甲',health:'生命上限'};
 const description=effect.kind==='buff'?Object.entries(effect.values).map(([k,v])=>`${names[k]} +${v}`).join('、')+` · 持续 ${Math.ceil(effect.sp.durationMs/60000)} 分钟`:['food','water'].includes(effect.kind)?`坐下${effect.label} · 持续 ${effect.sp.durationMs/1000} 秒`:effect.kind==='hearth'?`返回 ${hearthstoneView(s).destinationName}`:`恢复 ${effect.min}—${effect.max} ${effect.kind==='health'?'生命':'法力'}`;
 return {canUse:!reason,reason,label:effect.label,description,remaining:effect.kind==='hearth'?hearthstoneView(s).remaining:['health','mana'].includes(effect.kind)?Math.max(0,(s.potionReady||0)-s.clock):itemCooldown(s,instance.id)};
}

export function useBagItem(s,uid,slot){
 const instance=s.bag.find(i=>i.uid===uid);if(!instance)throw new Error('背包中没有这件物品');
 if(useClassBook(s,instance)||useClassItem(s,instance,slot))return;
 const use=itemUseView(s,instance);if(!use)throw new Error('这件物品暂不支持直接使用');if(!use.canUse)throw new Error(use.reason);
 const effect=itemEffect(s,instance.id);
 if(effect.kind==='hearth'){beginHearth(s);return;}
 // Decrement this exact stack, never a different locked/owned instance.
 instance.count--;if(!instance.count)s.bag=s.bag.filter(i=>i.uid!==uid);
 const data=items[instance.id];s.itemCooldowns??={};
 if(data.spellcooldown_1>0)s.itemCooldowns['item:'+instance.id]=s.clock+data.spellcooldown_1;
 if(data.spellcategory_1>0&&data.spellcategorycooldown_1>0)s.itemCooldowns['category:'+data.spellcategory_1]=s.clock+data.spellcategorycooldown_1;
 s.activity={type:'idle'};
 if(['food','water'].includes(effect.kind)){
  const sp=effect.sp,food=effect.kind==='food',rest=s.rest||{food:0,water:0,foodUntil:0,waterUntil:0,nextFood:s.clock+5000,foodPeriod:5000};
  rest[effect.kind]=sp.EffectBasePoints1+1;rest[effect.kind+'Until']=s.clock+sp.durationMs;rest.startedAt=s.clock;
  if(food){rest.foodPeriod=sp.EffectAmplitude1||5000;rest.nextFood=s.clock+rest.foodPeriod;}
  rest.until=Math.max(rest.foodUntil,rest.waterUntil);s.rest=rest;s.totals[effect.kind]++;
 }else{
  stopRecovery(s);
  if(effect.kind==='buff'){s.itemBuffs=(s.itemBuffs||[]).filter(b=>buffFamily(b.item,b.stats)!==buffFamily(instance.id,effect.values)&&b.until>s.clock);s.itemBuffs.push({spell:effect.sp.Id,item:instance.id,stats:effect.values,until:s.clock+effect.sp.durationMs});}
  else{const field=effect.kind==='health'?'hp':'mana',max=effect.kind==='health'?stats(s).maxHp:stats(s).maxMana;s[field]=Math.min(max,s[field]+roll(s,effect.min,effect.max));s.potionReady=s.clock+120000;}
 }
 log(s,'使用 '+nameOf('items',instance.id),effect.kind==='buff'?'buff':'rest');
}

export function utilityView(s){
 return {...classUtilityView(s),skillUses:Object.fromEntries(s.learned.map(id=>[id,skillUseView(s,id)]).filter(([,use])=>use)),itemUses:Object.fromEntries(s.bag.map(i=>[i.uid,itemUseView(s,i)]).filter(([,use])=>use)),itemBuffs:(s.itemBuffs||[]).filter(b=>b.until>s.clock).map(b=>({...b,name:nameOf('items',b.item),icon:icon('items',b.item)}))};
}
