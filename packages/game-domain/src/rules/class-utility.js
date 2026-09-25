import {beginSpellTiming,finishSpellTiming,spellReady,cooldownUntil,gcdUntil} from './spell-timing.js';
import {petTrainingCost,petTrainingReason} from './pet-progression.js';
import {ritualUse,finishRitual} from './class-ritual.js';
import {doomRitualUse,beginDoomRitual,summonInfernal} from './combat.js';
import {environmentSpellUse,executeEnvironmentSpell,environmentView} from './class-environment.js';
import {observationUse,executeObservation,observationView} from './class-observation.js';
import {racialActiveNames,racialAbilityBlocked,activateRacial} from './racial-effects.js';
import {items,spells,nodes,nameOf,icon,monsterIdsAt,creatures} from './catalog.js';
import {stats,spellInfo,effectRange,roll,log,countItem,addItem,bagCapacity} from './character.js';
import {usableCount,consume} from './inventory.js';
import {classAbilityKind,classChannelTick,classChannelInterval} from './class-spell-effects.js';
import {classEffect,healAmount} from './class-mechanics.js';
import {combatMembers} from './combat-members.js';
import {teleportDestinations,utilitySpellNames} from './class-utility-data.js';
import {healingMultiplier,ranks} from './talent-effects.js';
import {handleTownAmmo} from './ammunition.js';
import {leaveDungeon} from './dungeon.js';

const materials=sp=>Array.from({length:8},(_,n)=>({id:sp['Reagent'+(n+1)],count:sp['ReagentCount'+(n+1)]})).filter(r=>r.id>0&&r.count>0);
function createdItem(s,sp){
 for(let n=1;n<=3;n++)if(sp['Effect'+n]===24)return {id:sp['EffectItemType'+n],count:/^Conjure (Food|Water)$/.test(sp.SpellName)?Math.min(20,2+Math.max(0,s.level-sp.SpellLevel)*2):Math.max(1,sp['EffectBasePoints'+n]+1)};
 if(sp.SpellName.startsWith('Create Healthstone')){
  const name=sp.SpellName.replace('Create Healthstone (','').replace(')',''),itemName=sp.SpellName==='Create Healthstone'?'Healthstone':name+' Healthstone';
  const candidates=Object.values(items).filter(i=>i.name===itemName).sort((a,b)=>(spells[a.spellid_1]?.EffectBasePoints1||0)-(spells[b.spellid_1]?.EffectBasePoints1||0));
  const chosen=candidates[Math.min(candidates.length-1,ranks(s)['Improved Healthstone']||0)];return chosen?{id:chosen.entry,count:1}:null;
 }
 return null;
}
const destination=(s,sp)=>sp.SpellName==='Astral Recall'?s.hearth:teleportDestinations[sp.SpellName.split(': ')[1]];
const friendlyKinds=new Set(['heal','buff','summon','enchant','dispel']);
const friendlyChannels=new Set(['Mend Pet','Health Funnel','Tranquility','Evocation']);
const petChannels=new Set(['Mend Pet','Health Funnel']);
const pool=sp=>[4294967294,-2].includes(sp.PowerType)?'hp':sp.PowerType===1?'rage':sp.PowerType===3?'energy':'mana';
export function classUtilityUse(s,id,targetId){
 const sp=spellInfo(s,id);if(!sp)return null;targetId??=petChannels.has(sp.SpellName)?s.pet?.id:s.id;
 if(sp.SpellName==='Tame Beast'){const e=s.combat?.enemies.find(e=>e.id===targetId),entry=e?.entry||(String(targetId).startsWith('npc:')?Number(String(targetId).slice(4)):0),raw=creatures[entry];const reason=!s.learned.includes(id)?'尚未学习驯服野兽':s.hp<=0?'角色已死亡':s.escort?'请先结束当前活动':!spellReady(s,sp,s.clock)?'技能尚未冷却':s.pet||s.hunterPet?'请先放弃当前宠物':!e&&!monsterIdsAt(s.location).includes(entry)?'请选择当前位置的野兽':raw?.CreatureType!==1?'目标不是野兽':(e?.level||raw?.MinLevel)>s.level?'目标等级过高':s.mana<sp.mana?'法力不足':!['idle','hunt'].includes(s.activity.type)?'请先结束当前活动':'';return{canUse:!reason,reason,label:'驯服',description:'选择野兽目标，引导驯服并保留其种类',targetId};}

 // Original food/water, first two teleports and long mage buffs retain their
 // established UI/API path; every other direct class action uses this path.
 if([3561,3562].includes(id)||['Conjure Food','Conjure Water','Frost Armor','Arcane Intellect'].includes(sp.SpellName))return null;
 const item=createdItem(s,sp),to=destination(s,sp),portal=sp.SpellName.startsWith('Portal:'),kind=classAbilityKind(sp),target=combatMembers(s,null).find(c=>c.id===targetId);
 const ritual=sp.SpellName==='Ritual of Summoning'?ritualUse(s,targetId):sp.SpellName==='Ritual of Doom'?doomRitualUse(s):null,environmental=environmentSpellUse(s,sp,targetId),observation=observationUse(s,sp,targetId),racial=racialActiveNames.has(sp.SpellName);if(environmental&&(sp.Attributes&64))return null;if(!item&&!to&&!racial&&!observation&&!environmental&&!ritual&&!friendlyKinds.has(kind)&&!friendlyChannels.has(sp.SpellName))return null;
 let reason=s.hp<=0?'角色已死亡':s.combat&&!observation?'战斗中请通过战斗策略释放':s.escort?'正在护送':!['idle','hunt'].includes(s.activity.type)?'请先结束当前活动':!s.learned.includes(id)?'尚未学习这个技能':!target&&!observation?'目标不在小队中':!spellReady(s,sp,s.clock)?'技能尚未冷却':(s[pool(sp)]||0)<sp.mana?'资源不足':'';
 if(!reason&&target&&target!==s&&!petChannels.has(sp.SpellName)&&[1,2,3].filter(n=>sp['Effect'+n]).every(n=>sp['EffectImplicitTargetA'+n]===1&&!sp['EffectImplicitTargetB'+n]))reason='此技能只能对自己施放';
 if(!reason&&observation)reason=observation.reason;
 if(!reason&&environmental)reason=environmental.reason;
 if(!reason&&ritual)reason=ritual.reason;
 if(!reason&&petChannels.has(sp.SpellName)&&(!s.pet||target!==s.pet||target.hp<=0))reason='需要选择自己存活的宠物';
 if(!reason&&pool(sp)==='hp'&&s.hp<=sp.mana)reason='生命值不足';
 if(!reason&&item&&s.classId===4&&/Poison/.test(sp.SpellName)&&!s.learned.includes(2842))reason='需要先学习毒药技能';
 if(!reason&&sp.SpellName==='Aquatic Form'&&!s.swimming)reason='需要处于水中';
 if(!reason&&sp.SpellName==='Prowl'&&s.form!=='cat')reason='需要猎豹形态';
 if(!reason&&sp.SpellName==='Slice and Dice'&&!(s.combo>0))reason='需要连击点数';
 if(!reason&&['Shield Block','Shield Wall'].includes(sp.SpellName)&&items[s.equipment[17]?.id]?.InventoryType!==14)reason='需要装备盾牌';
 if(!reason&&sp.SpellName==='Rebirth'&&target.hp>0)reason='目标仍然存活';
 if(!reason&&racial)reason=racialAbilityBlocked(s,s,sp)||'';
 if(!reason&&item&&!items[item.id])reason='缺少制造物品数据';
 if(!reason&&item&&items[item.id].maxcount>0&&[...s.bag,...(s.bank||[]),...(s.pending||[]),...Object.values(s.equipment)].filter(i=>i.id===item.id).reduce((n,i)=>n+(i.count||1),0)>=items[item.id].maxcount)reason='已拥有这种唯一物品';
 if(!reason&&item){const capacity=s.bag.filter(i=>i.id===item.id).reduce((n,i)=>n+Math.max(0,(items[item.id].stackable||1)-i.count),0)+Math.max(0,bagCapacity(s)-s.bag.length)*(items[item.id].stackable||1);if(capacity<item.count)reason='背包空间不足';}
 if(!reason&&to&&!nodes[to])reason='传送目的地尚不可用';
 if(!reason&&to&&!portal&&s.location===to&&!s.dungeon)reason='你已经在目的地';
 if(!reason&&kind==='heal'&&target.hp<=0&&sp.SpellName!=='Rebirth')reason='目标已死亡';
 if(!reason&&sp.SpellName==='Revive Pet'&&(!s.pet||s.pet.hp>0))reason='没有需要复活的宠物';
 if(!reason&&sp.SpellName==='Call Pet'&&s.pet?.hp<=0)reason='需要先复活宠物';
 if(!reason&&sp.SpellName==='Call Pet'&&!s.pet&&!s.hunterPet)reason='需要先驯服一只野兽';
 if(!reason){const missing=materials(sp).find(r=>usableCount(s,r.id)<r.count);if(missing)reason='缺少未锁定材料：'+nameOf('items',missing.id)+' ×'+missing.count;}
 return {canUse:!reason,reason,remaining:Math.max(0,cooldownUntil(s,sp)-s.clock,gcdUntil(s,sp)-s.clock),castMs:friendlyChannels.has(sp.SpellName)?sp.durationMs:sp.castMs,label:item?'制造':portal?'开启传送门':to?'传送':'施放',description:item?`制造 ${nameOf('items',item.id)} ×${item.count}`:to?`${portal?'开启通往':'传送至'}${nodes[to]?.name||to}`:observation?.description||environmental?.description||'对自己或指定队友施放',item,to,portal,targetId,kind};
}
export function beginClassUtility(s,id,targetId){
 const use=classUtilityUse(s,id,targetId);if(!use)return false;if(!use.canUse)throw new Error(use.reason);
 const sp=spellInfo(s,id);s.rest=null;const timing=beginSpellTiming(s,sp,s.clock,{pool:pool(sp),channel:friendlyChannels.has(sp.SpellName)});
 if(friendlyChannels.has(sp.SpellName)){
  for(const r of materials(sp))consume(s,r.id,r.count);
  const interval=classChannelInterval(sp),until=s.clock+sp.durationMs;
  s.cast={spell:id,target:use.targetId,channel:true,nextTick:s.clock+interval,interval,until,endsAt:until};
  s.activity={type:'classChannel',spell:id,target:use.targetId,startedAt:s.clock,endsAt:until};return true;
 }
 s.activity={type:'classSpell',timing,spell:id,target:use.targetId,item:use.item,to:use.to,portal:use.portal,startedAt:s.clock,endsAt:s.clock+sp.castMs};
 if(!sp.castMs)finishClassUtility(s);return true;
}
export function cancelClassChannel(s){if(s.activity.type==='classChannel'){s.cast=null;s.activity={type:'idle'};}}
export function tickClassChannel(s){
 if(s.activity.type!=='classChannel')return;
 const a=s.activity,cast=s.cast,sp=spellInfo(s,a.spell),actors=combatMembers(s,null),target=actors.find(c=>c.id===a.target);
 if(!cast||!sp||s.hp<=0||!target||target.hp<=0||s.combat){cancelClassChannel(s);return;}
 while(cast.nextTick<=s.clock&&cast.nextTick<=cast.until){classChannelTick(s,s,target,sp,cast,actors,{healAmount});cast.nextTick+=cast.interval;if(!s.cast){cancelClassChannel(s);return;}}
}
export function finishClassChannel(s){tickClassChannel(s);cancelClassChannel(s);}
function relocate(s,to){if(s.dungeon)leaveDungeon(s);s.location=to;if(!s.visited.includes(to))s.visited.push(to);s.groundEffects=[];log(s,'传送至 '+nodes[to].name,'travel');handleTownAmmo(s,'town');}
export function finishClassUtility(s){
 const a=s.activity,sp=spellInfo(s,a.spell);s.activity={type:'idle'};if(!sp)return;
 if(sp.SpellName==='Ritual of Summoning'&&!ritualUse(s,a.target).canUse){log(s,'召唤仪式条件不再满足','cancel');return;}
 if(sp.SpellName==='Ritual of Doom'&&!doomRitualUse(s).canUse){log(s,'末日仪式条件不再满足','cancel');return;}
 const required=materials(sp);if(required.some(r=>usableCount(s,r.id)<r.count)){log(s,'技能材料不足，施法取消','cancel');return;}
 if(!finishSpellTiming(s,a.timing,s.clock)){log(s,'资源不足，施法取消','cancel');return;}for(const r of required)consume(s,r.id,r.count);
 if(a.item){addItem(s,a.item.id,a.item.count);log(s,'制造了 '+nameOf('items',a.item.id)+' ×'+a.item.count,'loot');return;}
 if(a.portal){s.portals=(s.portals||[]).filter(p=>p.until>s.clock);s.portals.push({spell:a.spell,from:s.location,to:a.to,until:s.clock+(sp.durationMs||60000)});log(s,'开启通往 '+nodes[a.to].name+' 的传送门','buff');return;}
 if(a.to){relocate(s,a.to);return;}
 if(sp.SpellName==='Ritual of Summoning'){finishRitual(s,a.target);return;}
 if(sp.SpellName==='Ritual of Doom'){beginDoomRitual(s);return;}
 if(sp.SpellName==='Inferno'){summonInfernal(s,s,combatMembers(s,null).find(c=>c.id===a.target)||s);return;}
 if(activateRacial(s,s,sp,{stats,healAmount})||executeObservation(s,sp,a.target)||executeEnvironmentSpell(s,s,combatMembers(s,null).find(c=>c.id===a.target)||s,sp))return;
 const actors=combatMembers(s,null),target=actors.find(c=>c.id===a.target)||s;
 classEffect(s,s,target,sp,actors,{healAmount,heal:(state,c,t,spell)=>healAmount(state,c,t,roll(state,...effectRange(c,spell))*healingMultiplier(c,spell),spell.Id),lands:()=>true});
 log(s,'施放了 '+nameOf('spells',a.spell),'cast',{actorId:s.id,targetId:target.id,spellId:a.spell});
}
export function useClassPortal(s,id){if(s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type))throw new Error('请先结束当前活动');const portal=(s.portals||[]).find(p=>p.spell===id&&p.from===s.location&&p.until>s.clock);if(!portal)throw new Error('传送门已消失或不在此地');relocate(s,portal.to);}
export function classUtilityView(s){const targets=[...combatMembers(s,null).map(c=>c.id),...(s.combat?.enemies||[]).map(c=>c.id),...monsterIdsAt(s.location).map(id=>'npc:'+id),...s.bag.filter(i=>items[i.id]?.lockid).map(i=>i.uid),...(s.groundEffects||[]).filter(e=>e.trap).map(e=>e.id)];const skillUsesByTarget=Object.fromEntries([...new Set(targets)].map(target=>[target,Object.fromEntries(s.learned.map(id=>[id,classUtilityUse(s,id,target)]).filter(([,use])=>use))]));return{skillUsesByTarget,...environmentView(s),...observationView(s),petControls:s.pet?{food:s.bag.filter(i=>!i.locked&&items[i.id]?.FoodType).map(i=>({id:i.id,name:nameOf('items',i.id),count:i.count})),skills:(s.pet.availableSkills||[]).map(id=>({id,name:nameOf('spells',id),level:spells[id]?.SpellLevel||0,learned:s.pet.learned?.includes(id),cost:Math.max(0,petTrainingCost(s.pet,id)),reason:petTrainingReason(s,s.pet,id)}))}:null,classPortals:(s.portals||[]).filter(p=>p.until>s.clock&&p.from===s.location).map(p=>({...p,name:nodes[p.to].name,icon:icon('spells',p.spell)}))};}
