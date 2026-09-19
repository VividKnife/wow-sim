import {items,quests,classAbilities,isSharedRouteQuest} from './catalog.js';
import {canEquip,makeItem,slotOf,stats,log} from './character.js';
import {syncPartyQuest,PARTY_QUEST} from './party-unlock.js';
import {boostMount} from './mounts.js';

// Only real quest rewards from the playable level 1–20 route; never dungeon
// drops or the synthetic companion kit. Keep provenance for inspection/tests.
export function boostEquipmentCandidates(s){
 const rewards=new Map();
 for(const q of Object.values(quests)){
  if(q.MinLevel>20||q.QuestLevel>20||q.MaxLevel&&q.MaxLevel<20)continue;
  if(q.RequiredClasses&&!(q.RequiredClasses&(1<<(s.classId-1))))continue;
  if(q.RequiredRaces&&!(q.RequiredRaces&(1<<(s.raceId-1)))&&!isSharedRouteQuest(q))continue;
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
 const skills=(classAbilities[s.classId]||[]).filter(a=>a.requiredLevel<=20&&['trainer','weapon'].includes(a.acquisition)&&!a.requiredTalentSpellId&&(!(a.raceIds||a.startingRaces)?.length||(a.raceIds||a.startingRaces).includes(s.raceId)));
 s.learned=[...new Set([...s.learned,...skills.map(a=>a.spellId)])];
 const candidates=boostEquipmentCandidates(s).sort((a,b)=>score(s,b.item)-score(s,a.item)||a.item.entry-b.item.entry);
 const equipment={};
 for(const {item,questId} of candidates){
  let slot=slotOf(item);
  if(slot===11&&equipment[11])slot=12;
  if(slot===13&&equipment[13])slot=14;
  if(equipment[slot]||Object.values(equipment).some(e=>e.id===item.entry&&item.maxcount===1))continue;
  if(slot===17&&(items[equipment[16]?.id]?.InventoryType===17||item.class===2&&!s.learned.includes(674)))continue;
  if(slot===16&&item.InventoryType===17)delete equipment[17];
  equipment[slot]={...makeItem(s,item.entry),bound:true,ownerId:s.id,boostQuestId:questId};
 }
 s.equipment={...s.equipment,...equipment};
 // The project already has level-18 quest-issued recruit armor. Reuse these
 // adaptation templates for slots absent from the source quest reward catalog.
 // The gift belongs to the hero; it does not complete the recruitment quest.
 const kit=[1,2].includes(s.classId)?'tank':[3,4].includes(s.classId)?'melee':'caster';
 for(const item of Object.values(items).filter(i=>i.companionKit===kit)){
  const slot=item.companionSlot;
  if(!s.equipment[slot]&&canEquip(s,item))s.equipment[slot]={...makeItem(s,item.entry),bound:true,ownerId:s.id,boostQuestId:PARTY_QUEST};
 }
 if(items[s.equipment[16]?.id]?.InventoryType===17)delete s.equipment[17];
 s.bags=Array.from({length:4},()=>makeItem(s,14046));
 s.mounts=[boostMount.id];s.riding.horse=true;
 s.location='goldshire';s.hearth='goldshire';s.visited=['northshire','goldshire'];
 syncPartyQuest(s);
 const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;
 log(s,'测试直升：已到达20级，配发本职业可用的任务装备、四个符文布背包及旅行棕马，并学会骑术。前往暴风城旅店完成“同路人”，自行选择队友。');
 return s;
}
