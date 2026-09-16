import {items,spells,creatures,classLocks,table,monsterIdsAt,nameOf,objectSpawnsByNode,objectTemplates} from './catalog.js';
import {log,roll} from './character.js';
import {lootRows} from './quests.js';
const tracks={'Track Beasts':1,'Track Dragonkin':2,'Track Demons':3,'Track Elementals':4,'Track Giants':5,'Track Undead':6,'Sense Undead':6,'Track Humanoids':7,'Sense Demons':3};
const visions=new Set(['Eagle Eye','Far Sight','Mind Vision','Eyes of the Beast','Eye of Kilrogg','Beast Lore','Detect Magic']);
export const observationSpellNames=new Set([...Object.keys(tracks),...visions,'Track Hidden','Detect Traps','Pick Pocket','Pick Lock','Disarm Trap']);
const targetFor=(s,id)=>s.combat?.enemies.find(e=>e.id===id)||((String(id).startsWith('npc:')&&monsterIdsAt(s.location).includes(Number(String(id).slice(4))))?{entry:Number(String(id).slice(4)),id}:null);
export function observationUse(s,sp,targetId){
 const name=sp.SpellName;if(!observationSpellNames.has(name))return null;const target=targetFor(s,targetId),instance=s.bag.find(i=>i.uid===targetId);let reason='';
 if(visions.has(name)&&!target&&!['Eye of Kilrogg','Eyes of the Beast'].includes(name))reason='请选择当前地点的目标';
 if(name==='Eyes of the Beast'&&(!s.pet||s.pet.hp<=0))reason='需要存活的宠物';
 if(name==='Beast Lore'&&target&&creatures[target.entry]?.CreatureType!==1)reason='目标不是野兽';
 if(name==='Pick Pocket'){
  if(!target||target.hp<=0||!s.combat?.enemies.includes(target))reason='请选择战斗中的目标';
  else if(!s.stealthed)reason='需要处于潜行状态';else if(![6,7].includes(creatures[target.entry]?.CreatureType))reason='只能偷窃人型或亡灵目标';else if(!creatures[target.entry]?.PickpocketLootId)reason='目标身上没有可偷窃物品';else if(target.picked)reason='这个目标已经被偷窃';else if(Math.hypot((s.position||0)-(target.position||0),(s.positionY||0)-(target.positionY||0))>5)reason='目标距离过远';
 }
 if(name==='Pick Lock'){
  const lock=classLocks[items[instance?.id]?.lockid],requirement=lock?.requirements.find(r=>r.type===2&&r.index===1);
  if(!instance||!requirement)reason='请选择可开锁的箱子';else if(instance.locked||instance.issued||instance.ownerId&&instance.ownerId!==s.id)reason='物品受保护';else if((s.lockpicking||1)<requirement.skill)reason=`需要开锁熟练度 ${requirement.skill}`;else if(s.combat)reason='战斗中无法开锁';
 }
 if(name==='Disarm Trap'&&!s.groundEffects?.some(e=>e.id===targetId&&e.trap&&e.ownerId!==s.id))reason='请选择已发现的敌方陷阱';
 return{reason,targetId,kind:name,canUse:!reason,label:name==='Pick Lock'?'开锁':name==='Pick Pocket'?'偷窃':'施放',description:tracks[name]?'追踪附近对应类型的目标':visions.has(name)?'观察目标的属性与魔法效果':'使用职业专属能力'};
}
export function executeObservation(s,sp,targetId){const use=observationUse(s,sp,targetId);if(!use)return false;if(use.reason)throw new Error(use.reason);const name=sp.SpellName,target=targetFor(s,targetId);
 if(tracks[name])s.tracking={spell:sp.Id,type:tracks[name]};
 if(name==='Track Hidden'||name==='Detect Traps')s.classDetection={spell:sp.Id,kind:name,until:s.clock+(sp.durationMs||1800000)};
 if(visions.has(name))s.scouting={spell:sp.Id,entry:target?.entry||s.pet?.entry||0,location:s.location,targetId,until:s.clock+(sp.durationMs||60000)};
 if(name==='Pick Pocket'){const entry=creatures[target.entry].PickpocketLootId;lootRows(s,table('pickpocketing_loot_template').filter(r=>r.entry===entry));target.picked=true;s.money+=10*(roll(s,0,Math.floor(target.level/2))+roll(s,0,Math.floor(s.level/2)));}
 if(name==='Pick Lock'){const instance=s.bag.find(i=>i.uid===targetId),required=classLocks[items[instance.id].lockid].requirements.find(r=>r.type===2&&r.index===1).skill;if(instance.id!==6712){instance.count--;if(!instance.count)s.bag=s.bag.filter(i=>i.uid!==instance.uid);lootRows(s,table('item_loot_template').filter(r=>r.entry===instance.id));}if((s.lockpicking||1)<Math.min(s.level*5,required+75))s.lockpicking=(s.lockpicking||1)+1;}
 if(name==='Disarm Trap')s.groundEffects=s.groundEffects.filter(e=>e.id!==targetId);
 log(s,'使用 '+nameOf('spells',sp.Id),'cast',{spellId:sp.Id,targetId});return true;
}
export function observationView(s){const active=s.scouting?.until>s.clock&&s.scouting.location===s.location?s.scouting:null,raw=active&&creatures[active.entry];return{trackingKind:s.tracking==='treasure'?'treasure':null,trackedTreasures:s.tracking==='treasure'?Object.keys(objectSpawnsByNode).filter(key=>key.startsWith(s.location+':')).map(key=>objectTemplates[Number(key.split(':')[1])]).filter(o=>o&&/Chest|Footlocker|Coffer|Strongbox/.test(o.name)).map(o=>({id:o.entry,name:o.name})):[],lockpicking:s.learned.includes(1804)?{skill:s.lockpicking||1,max:s.level*5}:null,trackedTargets:typeof s.tracking==='object'?monsterIdsAt(s.location).filter(id=>creatures[id]?.CreatureType===s.tracking.type).map(id=>({id,name:nameOf('npcs',id)})):[],scouting:raw?{name:nameOf('npcs',active.entry),level:[raw.MinLevel,raw.MaxLevel],armor:raw.Armor,type:raw.CreatureType,until:active.until}:null,lockTargets:s.bag.filter(i=>items[i.id]?.lockid).map(i=>({id:i.uid,name:nameOf('items',i.id)}))};}
