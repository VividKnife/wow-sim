import {racialHomes} from '../../../game-data/world-content.js';
import {items,quests,classAbilities} from './catalog.js';
import {canEquip,makeItem,slotOf,stats,log} from './character.js';
import {boostMount} from './mounts.js';
import {ammoOptions,DEFAULT_AMMO_TARGET} from './ammunition.js';
import {grantHunterTrainingLinks} from './pet-knowledge.js';

export const LEVEL_20_BOOST_MONEY=500000;

// Select real level-appropriate quest rewards; missing slots are filled separately
// from the companion kit. Keep provenance for inspection/tests.
export function boostEquipmentCandidates(s){
 const rewards=new Map();
 for(const q of Object.values(quests)){
  if(q.MinLevel>20||q.QuestLevel>20||q.MaxLevel&&q.MaxLevel<20)continue;
  if(q.RequiredClasses&&!(q.RequiredClasses&(1<<(s.classId-1))))continue;
  if(q.RequiredRaces&&!(q.RequiredRaces&(1<<(s.raceId-1))))continue;
  for(const prefix of ['RewItemId','RewChoiceItemId'])for(let n=1;n<=6;n++){
   const item=items[q[prefix+n]];
   if(item&&[2,4].includes(item.class)&&item.InventoryType&&canEquip(s,item))rewards.set(item.entry,{item,questId:q.entry});
  }
 }
 return [...rewards.values()];
}
function score(s,i){
 const caster=[5,8,9,11,7].includes(s.classId),agile=[3,4].includes(s.classId);
 let value=(i.armor||0)*.03+(i.ItemLevel||0)*.1;
 for(let n=1;n<=10;n++)value+=(i['stat_value'+n]||0)*({3:agile?3:1,4:!caster&&!agile?3:.3,5:caster?3:0,6:caster?1:.1,7:1.5}[i['stat_type'+n]]||0);
 if(i.class===2)value+=((i.dmg_min1||0)+(i.dmg_max1||0))*500/Math.max(1,i.delay)*(caster?.3:3);
 return value;
}
export function applyLevel20Boost(s){
 s.level=20;s.xp=0;
 s.money+=LEVEL_20_BOOST_MONEY;
 const skills=(classAbilities[s.classId]||[]).filter(a=>a.requiredLevel<=20&&['trainer','weapon','classQuest'].includes(a.acquisition)&&!a.requiredTalentSpellId&&(!(a.raceIds||a.startingRaces)?.length||(a.raceIds||a.startingRaces).includes(s.raceId)));
 s.learned=[...new Set([...s.learned,...skills.map(a=>a.spellId)])];
 for(const spell of [...s.learned])grantHunterTrainingLinks(s,spell);
 const candidates=boostEquipmentCandidates(s).sort((a,b)=>score(s,b.item)-score(s,a.item)||a.item.entry-b.item.entry);
 const equipment={};
 for(const {item,questId} of candidates){
  let slot=slotOf(item);
  if(slot===16&&equipment[16]&&item.InventoryType===13&&s.learned.includes(674)&&items[equipment[16].id]?.InventoryType!==17)slot=17;
  if(slot===11&&equipment[11])slot=12;
  if(slot===13&&equipment[13])slot=14;
  if(equipment[slot]||Object.values(equipment).some(e=>e.id===item.entry&&item.maxcount===1))continue;
  if(slot===17&&(items[equipment[16]?.id]?.InventoryType===17||item.class===2&&!s.learned.includes(674)))continue;
  if(slot===16&&item.InventoryType===17)delete equipment[17];
  equipment[slot]={...makeItem(s,item.entry),bound:true,ownerId:s.id,boostQuestId:questId};
 }
 s.equipment={...s.equipment,...equipment};
 // The project already has level-18 recruit armor. Reuse these
 // adaptation templates for slots absent from the source quest reward catalog.
 // The gift belongs to the hero.
 const kit=[1,2].includes(s.classId)?'tank':[3,4].includes(s.classId)?'melee':'caster';
 for(const item of Object.values(items).filter(i=>i.companionKit===kit)){
  const slot=item.companionSlot;
  if(!s.equipment[slot]&&canEquip(s,item))s.equipment[slot]={...makeItem(s,item.entry),bound:true,ownerId:s.id,boostCompanionKit:true};
 }
 if(items[s.equipment[16]?.id]?.InventoryType===17)delete s.equipment[17];
 if(s.classId===3){
  const ammo=ammoOptions(s)[0];
  s.ammunition=ammo?{[ammo.entry]:DEFAULT_AMMO_TARGET}:{};
  s.hunterPet={entry:299,name:'森林狼',level:s.level,loyalty:6,happiness:166500,learned:[2649]};
 }
 s.bags=Array.from({length:4},()=>makeItem(s,14046));
 s.mounts=[boostMount.id];s.riding.horse=true;
 s.location=racialHomes[s.raceId].capital;s.hearth=s.location;s.visited=[racialHomes[s.raceId].start,s.location];
 const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;
 log(s,'测试直升：已到达20级，获得50金币，并配发本职业可用的任务装备、四个符文布背包及旅行棕马，同时学会骑术及当前等级的职业解锁技能。冒险者大厅已开放，可结识 NPC 玩家并组建副本小队。');
 return s;
}
