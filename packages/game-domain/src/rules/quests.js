import {contentPhase} from './content-phase.js';
import {weaponItemActions,weaponQuestPhases} from '../../../game-data/epic-weapons.js';
import {isLowLevelQuest} from '../../../sim-core/src/quest-level.js';
import {runtime} from './runtime-content.js';
import {groupRows} from '../../../sim-core/src/collections.js';
import {grantHunterTrainingLinks} from './pet-knowledge.js';
import {queueCombatLoot,queuePersonalCombatLoot} from './loot.js';
import {rewardCharacters} from './combat-members.js';
import {racialModifiers} from './racial-effects.js';
import {quests,questLinks,questXp,classContentManifest,classDefinitions,raceDefinitions,endpointNodes,creatureLocations,creatures,items,objectLocations,objectSpawnsByNode,objectTemplates,objectLoot,creatureLoot,referenceLoot,table,localize,nameOf,nearestNode,nodes,monsterIdsAt,attackableCreature} from './catalog.js';
import {countItem,takeItem,addItem,gainXp,rng,roll,log} from './character.js';
import {conditionQuestRequirements,evaluateCondition,professionIds} from './quest-conditions.js';
import {dungeonQuestZones,questScopeReason,questItemActions,questFishingSources} from '../../../game-data/world-quest-content.js';
import {dungeonDefinitions,dungeonRoute} from './dungeon-registry.js';
import {recipes} from './profession-data.js';
import {marketIds} from './market.js';
const previousQuests=groupRows(Object.values(quests).filter(q=>q.NextQuestId>0),q=>q.NextQuestId);
const exclusiveQuests=groupRows(Object.values(quests).filter(q=>q.ExclusiveGroup>0),q=>q.ExclusiveGroup);
const executableTargets=new Map();
function registerTarget(id,location){const c=creatures[id];for(const entry of [id,c?.KillCredit1,c?.KillCredit2].filter(Boolean)){if(!executableTargets.has(entry))executableTargets.set(entry,new Set());executableTargets.get(entry).add(location);}}
for(const node of Object.keys(nodes))for(const id of monsterIdsAt(node))registerTarget(id,node);
for(const def of Object.values(dungeonDefinitions))for(const e of dungeonRoute(def.id))for(const id of e.creatureTemplateIds)registerTarget(id,def.entrance);
for(const [id,places]of Object.entries(creatureLocations))for(const place of places)if(['molten-core','onyxias-lair'].includes(place))registerTarget(+id,place);
export function questTargetAction(q,n){
 const target=q['ReqCreatureOrGOId'+n],spell=q['ReqSpellCast'+n];
 const locations=target>0?creatureLocations[target]||[]:objectLocations[-target]||[];
 const combatLocations=[...(executableTargets.get(target)||[])];
 const kind=q.entry===434?'encounter':spell?'spell':target<0?'object':combatLocations.length?'kill':attackableCreature(target)?'encounter':'interact';
 return {kind,locations:(kind==='kill'?combatLocations:locations).length?(kind==='kill'?combatLocations:locations):sceneLocation(q)};
}
const excludedQuests=new Map(Object.values(quests).filter(q=>questScopeReason(q,6)).map(q=>[q.entry,questScopeReason(q,6)]));
for(let changed=true;changed;){changed=false;for(const q of Object.values(quests))if(!excludedQuests.has(q.entry)&&q.PrevQuestId&&excludedQuests.has(Math.abs(q.PrevQuestId))){excludedQuests.set(q.entry,'前置任务属于未开放内容');changed=true;}}
export const questContentReason=(q,s)=>((weaponQuestPhases[q.entry]||1)>contentPhase(s)?`此武器任务需要第 ${weaponQuestPhases[q.entry]} 阶段内容`:'')||excludedQuests.get(q.entry)||'';
export function meetsCondition(s,id,seen=new Set()){return evaluateCondition(s,id,{available:(qid,next)=>quests[qid]?questAvailable(s,quests[qid],next):false,complete:qid=>questObjectivesComplete(s,qid)},seen)===true;}
function questObjectivesComplete(s,id){const q=quests[id],p=s.quests[id];return !!(q&&p&&[1,2,3,4].every(n=>(!q['ReqItemId'+n]||countItem(s,q['ReqItemId'+n])>=q['ReqItemCount'+n])&&(!q['ReqCreatureOrGOId'+n]&&!q['ReqSpellCast'+n]||(p.kills[q['ReqCreatureOrGOId'+n]||'spell:'+n]||0)>=q['ReqCreatureOrGOCount'+n]))&&(!(q.SpecialFlags&2)||p.event));}
const hasDivinity=s=>countItem(s,18646)>0||Object.values(s.equipment||{}).some(i=>i?.id===18646);
export function questAvailable(s,q,seen=new Set()){if([7621,7622].includes(q.entry)&&!hasDivinity(s))return false;if(questContentReason(q,s))return false;if((s.questWaits?.[q.entry]||0)>s.clock)return false;if(s.quests[q.entry]||s.completed[q.entry]&&!(q.SpecialFlags&1)||s.level<q.MinLevel||q.MaxLevel&&s.level>q.MaxLevel)return false;if(q.RequiredClasses&&!(q.RequiredClasses&(1<<(s.classId-1))))return false;if(q.RequiredRaces&&!(q.RequiredRaces&(1<<((s.raceId||1)-1))))return false;if(q.PrevQuestId>0&&!s.completed[q.PrevQuestId]||q.PrevQuestId<0&&!s.quests[-q.PrevQuestId])return false;
 if(q.RequiredSkill&&(s.professions?.[professionIds[q.RequiredSkill]]?.skill||0)<Math.max(1,q.RequiredSkillValue||0))return false;
 if(q.RequiredMinRepFaction&&(s.reputation[q.RequiredMinRepFaction]||0)<q.RequiredMinRepValue||q.RequiredMaxRepFaction&&(s.reputation[q.RequiredMaxRepFaction]||0)>=q.RequiredMaxRepValue)return false;
 const previous=previousQuests[q.entry]||[];if(previous.length&&!previous.some(p=>s.completed[p.entry]))return false;
 if(q.ExclusiveGroup>0&&(exclusiveQuests[q.ExclusiveGroup]||[]).some(p=>p.entry!==q.entry&&(s.completed[p.entry]||s.quests[p.entry])))return false;
 return !q.RequiredCondition||meetsCondition(s,q.RequiredCondition,seen);
}
const instanceLocation=s=>s.dungeon?dungeonDefinitions[s.dungeon.id]?.entrance:s.goldRaid?.active?s.goldRaid.raidId:null;
let instanceQuestIndex;
// Derive associations from quest targets and sources, including item-started
// quests and NPCs/objects inside an instance. Never move their world placements.
function instanceQuests(location){
 if(!location)return new Set();
 if(!instanceQuestIndex){
  instanceQuestIndex=new Map([...Object.values(dungeonDefinitions).map(d=>d.entrance),'molten-core','onyxias-lair'].map(id=>[id,new Set()]));
  for(const q of Object.values(quests)){
   const links=questLinks[q.entry],locations=new Set(Object.keys(dungeonQuestZones).filter(id=>dungeonQuestZones[id]===q.ZoneOrSort));
   for(const endpoint of [...(links?.starts||[]),...(links?.ends||[])])for(const node of endpoint.type==='item'?itemSources(endpoint.id):endpointNodes(endpoint))locations.add(node);
   for(let n=1;n<=4;n++){
    if(items[q['ReqItemId'+n]]?.class===12||[62,81].includes(q.Type))for(const node of itemSources(q['ReqItemId'+n]))locations.add(node);
    for(const node of itemSources(q['ReqSourceId'+n]))locations.add(node);
    if(q['ReqCreatureOrGOId'+n]||q['ReqSpellCast'+n])for(const node of questTargetAction(q,n).locations)locations.add(node);
   }
   if(q.SpecialFlags&2)for(const node of eventNodes(q.entry))locations.add(node);
   for(const node of locations)instanceQuestIndex.get(node)?.add(q.entry);
  }
 }
 return instanceQuestIndex.get(location)||new Set();
}
export function dungeonQuestIds(id){return [...instanceQuests(dungeonDefinitions[id]?.entrance||id)];}
export function questPrerequisiteGroups(q){return [...(q.PrevQuestId?[[q.PrevQuestId]]:[]),...(previousQuests[q.entry]?.length?[previousQuests[q.entry].map(p=>p.entry)]:[]),...conditionQuestRequirements(q.RequiredCondition)];}
export function questEndpointHere(s,questId,kind,endpoint){
 if(endpoint.type==='item')return kind==='starts'&&countItem(s,endpoint.id)>0;
 return endpointNodes(endpoint).includes(s.location)||endpoint.type==='creature'&&instanceQuests(instanceLocation(s)).has(questId);
}
export function atEndpoint(s,q,kind){return(questLinks[q.entry]?.[kind]||[]).some(e=>questEndpointHere(s,q.entry,kind,e));}
// Immutable content indices shared by all instances in this worker. Runtime
// availability still uses the current actor (level, race/class, prerequisites,
// reputation, professions, repeatable deadlines and carried item counts).
const startsByLocation=new Map(),startsByItem=new Map();
for(const q of Object.values(quests))for(const endpoint of questLinks[q.entry]?.starts||[]){
 const index=endpoint.type==='item'?startsByItem:startsByLocation;
 for(const key of endpoint.type==='item'?[endpoint.id]:endpointNodes(endpoint)){
  if(!index.has(key))index.set(key,new Set());index.get(key).add(q.entry);
 }
}
export function visibleQuestIds(s){
 const ids=new Set(Object.keys(s.quests).filter(id=>s.quests[id]).map(Number));
 for(const id of startsByLocation.get(s.location)||[])ids.add(id);
 if(instanceLocation(s))for(const id of instanceQuests(instanceLocation(s)))ids.add(id);
 for(const item of s.bag)for(const id of startsByItem.get(item.id)||[])ids.add(id);
 return [...ids].filter(id=>quests[id]&&(s.quests[id]||questAvailable(s,quests[id])&&atEndpoint(s,quests[id],'starts'))).sort((a,b)=>a-b);
}
export function needsQuestItem(s,id){return Object.keys(s.quests||{}).some(qid=>[1,2,3,4].some(n=>['Item','Source'].some(kind=>quests[qid]['Req'+kind+'Id'+n]===id&&countItem(s,id)+(s.pending||[]).filter(i=>i.id===id).reduce((n,i)=>n+i.count,0)<quests[qid]['Req'+kind+'Count'+n])));}
function hasNeededCreatureLoot(s,rows,needed,depth=0){
 if(depth>8)return false;
 return (rows||[]).some(row=>meetsCondition(s,row.condition_id)&&(row.mincountOrRef<0
  ?hasNeededCreatureLoot(s,referenceLoot[-row.mincountOrRef],needed,depth+1)
  :needed.has(row.item)));
}
export function questMonsterIds(s,monsterIds){
 const active=Object.keys(s.quests).map(id=>quests[id]).filter(Boolean);
 const neededItems=new Set();
 const killTargets=new Set();
 for(const q of active)for(let n=1;n<=4;n++){
  for(const kind of ['Item','Source']){
   const item=q['Req'+kind+'Id'+n];
   if(item&&countItem(s,item)<q['Req'+kind+'Count'+n])neededItems.add(item);
  }
  const target=q['ReqCreatureOrGOId'+n];
  if(target>0&&questTargetAction(q,n).kind==='kill'&&(s.quests[q.entry].kills[target]||0)<q['ReqCreatureOrGOCount'+n])killTargets.add(target);
 }
 return new Set(monsterIds.filter(id=>{
  const creature=creatures[id];
  return [id,creature?.KillCredit1,creature?.KillCredit2].some(target=>killTargets.has(target))
   ||neededItems.size>0&&hasNeededCreatureLoot(s,creatureLoot[creature?.LootId],neededItems);
 }));
}
const hasChinese=text=>/[\u3400-\u9fff]/.test(text||'');
function questText(text,s,className,raceName){return text.replace(/\$[gG]([^:;]*):([^;]*);/g,(_,male,female)=>s.gender==='female'?female:male).replace(/^Level \d+\s*/,'').replaceAll('Requirements:','任务要求：').replaceAll('Smokywood Pastures','烟林牧场').replaceAll('Ishnu-alah','伊沙努阿拉').replaceAll('$b','\n').replaceAll('$B','\n').replaceAll('$N',s.name).replaceAll('$C',className).replaceAll('$R',raceName);}
const questObjectName=id=>hasChinese(objectTemplates[id]?.name)?objectTemplates[id].name:'任务物件';
const questNpcName=id=>hasChinese(nameOf('npcs',id))?nameOf('npcs',id):'任务目标';
function questObjectiveFallback(name,objectives){return objectives.length?`完成任务目标：${objectives.map(o=>`${o.name} ×${o.required}`).join('、')}。`:`与任务人物交谈或前往任务地点，完成「${name}」。`;}
export function questProgress(s,id){const q=quests[id],progress=s.quests[id];if(!q)return null;const objectives=[];for(let n=1;n<=4;n++){const item=q['ReqItemId'+n],target=q['ReqCreatureOrGOId'+n];if(item)objectives.push({kind:'item',id:item,name:nameOf('items',item),count:Math.min(countItem(s,item),q['ReqItemCount'+n]),required:q['ReqItemCount'+n],locations:itemSources(item).length?itemSources(item):items[item]?.class===12?sceneLocation(q):[]});if(target||q['ReqSpellCast'+n])objectives.push({kind:questTargetAction(q,n).kind,id:target,name:target>0?questNpcName(target):questObjectName(-target),count:progress?.kills?.[target||'spell:'+n]||0,required:q['ReqCreatureOrGOCount'+n],locations:questTargetAction(q,n).locations});}
 if(q.SpecialFlags&2)objectives.push({kind:'event',id:q.entry,name:hasChinese(localize('quests',id)?.objectiveSummaryZhCN)?localize('quests',id).objectiveSummaryZhCN:'探索 / 护送事件',count:progress?.event?1:0,required:1,locations:eventNodes(q.entry)});
 const className=classDefinitions.find(c=>c.id===(s.classId||8))?.name||'法师',raceName=raceDefinitions.find(r=>r.id===(s.raceId||1))?.name||'人类';
 const locale=localize('quests',id),name=nameOf('quests',id),description=hasChinese(locale?.objectiveSummaryZhCN)?locale.objectiveSummaryZhCN:questObjectiveFallback(name,objectives);
 const details=hasChinese(locale?.detailsZhCN)?locale.detailsZhCN:description;
 return{scenes:questScenes(s,id),id:q.entry,name,level:q.QuestLevel,minLevel:q.MinLevel,description:questText(description,s,className,raceName),details:questText(details,s,className,raceName),objectives,complete:!!progress&&objectives.every(o=>o.count>=o.required)&&s.money>=Math.max(0,-q.RewOrReqMoney),xp:questXp[id]?.[s.level-1]||0,money:q.RewOrReqMoney,available:questAvailable(s,q),active:!!progress,completed:!!s.completed[id],canAccept:questAvailable(s,q)&&atEndpoint(s,q,'starts'),canTurnIn:!!progress&&atEndpoint(s,q,'ends'),startLocations:[...new Set((questLinks[id]?.starts||[]).flatMap(endpointNodes))],endLocations:[...new Set([...(questLinks[id]?.ends||[]).flatMap(endpointNodes),...(progress&&atEndpoint(s,q,'ends')?[s.location]:[])])],giver:(questLinks[id]?.starts||[]).map(e=>e.type==='creature'?nameOf('npcs',e.id):e.type==='item'?nameOf('items',e.id):objectTemplates[e.id]?.name).filter(Boolean).join(' / '),choices:[1,2,3,4,5,6].filter(n=>q['RewChoiceItemId'+n]).map(n=>({id:q['RewChoiceItemId'+n],count:q['RewChoiceItemCount'+n]})),rewards:[1,2,3,4].filter(n=>q['RewItemId'+n]).map(n=>({id:q['RewItemId'+n],count:q['RewItemCount'+n]})),repeatable:!!(q.SpecialFlags&1),expiresAt:progress?.expiresAt||0,waitUntil:s.questWaits?.[id]||0};
}
export function itemSources(id){return [...(runtime.itemSourceIndex[id]||[])];}
const dedicatedEvents={62:['fargodeep'],76:['jasper'],155:['sentinel','moonbrook'],1861:['mirror'],1920:['magetower'],434:['keep']};
const QUEST_SCENE_DURATION=10000;
function specialReady(s,q,action){return (!action.classId||s.classId===action.classId)&&(!action.solo||!s.party.length&&!s.pet&&!s.escort)&&(!action.raidBoss||!!s.quests[q.entry]?.kills[10184]&&s.goldRaid?.active&&s.goldRaid.cleared.includes(action.raidBoss))&&(action.inputs||[]).every(([id,count])=>countItem(s,id)>=count);}
const sceneLocation=q=>q.PointX||q.PointY?[nearestNode(q.PointX,q.PointY,q.PointMapId)].filter(Boolean):[...new Set((questLinks[q.entry]?.ends||[]).flatMap(endpointNodes))];
export const eventNodes=id=>dedicatedEvents[id]||(quests[id]?sceneLocation(quests[id]):[]);
// Scripts outside the bespoke Northshire/Defias story use explicit timed node
// scenes. They are labelled as adaptations, never presented as original scripts.
export function questScenes(s,id){
 const q=quests[id],p=s.quests[id];if(!q||!p||questContentReason(q,s))return [];
 const scenes=[];
 if(q.SpecialFlags&2&&!dedicatedEvents[id]&&!p.event)scenes.push({key:'event',name:hasChinese(q.EndText)?q.EndText:'推进剧情事件',locations:eventNodes(id)});
 for(let n=1;n<=4;n++){
  const target=q['ReqCreatureOrGOId'+n],spell=q['ReqSpellCast'+n],item=q['ReqItemId'+n];
  const special=questItemActions[item];
  if(special&&countItem(s,item)<q['ReqItemCount'+n]){
   const ready=specialReady(s,q,special);
   scenes.push({key:'special:'+n,name:special.name,locations:special.locations,ready,requirements:[...(special.inputs||[]).map(([id,count])=>nameOf('items',id)+' ×'+count),...(special.solo?['解散队伍并解散宠物']:[]),...(special.raidBoss?['携带未淬火之刃击败本次团队的奥妮克希亚']:[])].join('、')});
   for(const [source,count]of special.inputs||[])if([1,2,3,4].some(i=>q['ReqSourceId'+i]===source)&&countItem(s,source)<count)scenes.push({key:'source:'+source,name:'寻找 '+nameOf('items',source),locations:itemSources(source).length?itemSources(source):sceneLocation(q)});
  }
  const targetLocations=target>0?creatureLocations[target]||[]:target<0?objectLocations[-target]||[]:[];
  if(target&&!spell&&['encounter','interact'].includes(questTargetAction(q,n).kind)&&id!==434&&(p.kills[target]||0)<q['ReqCreatureOrGOCount'+n]){
   const combat=questTargetAction(q,n).kind==='encounter';
   scenes.push({key:(combat?'encounter:':'objective:')+n,name:(combat?'召唤并挑战 ':q.SrcItemId?'使用 '+nameOf('items',q.SrcItemId)+'：':'交谈 / 调查：')+(target>0?questNpcName(target):questObjectName(-target)),locations:questTargetAction(q,n).locations});
  }
  if(spell&&(p.kills[target||'spell:'+n]||0)<q['ReqCreatureOrGOCount'+n])scenes.push({key:'spell:'+n,name:'使用任务法术：'+nameOf('spells',spell),locations:targetLocations.length?targetLocations:sceneLocation(q)});
  if(item&&!special&&items[item]?.class===12&&item!==q.SrcItemId&&!itemSources(item).length&&countItem(s,item)<q['ReqItemCount'+n])scenes.push({key:'item:'+n,name:'调查并取得 '+nameOf('items',item),locations:sceneLocation(q)});
 }
 return scenes.map(scene=>({...scene,duration:id===7622?60000:QUEST_SCENE_DURATION,name:(id===7622&&scene.key==='event'?'保护逃离斯坦索姆的 50 名农民':scene.name)+(scene.requirements?'（需要 '+scene.requirements+'）':''),adaptation:'节点式任务场景改编',available:scene.ready!==false&&(id!==7622||hasDivinity(s))&&scene.locations.includes(s.location)&&s.hp>0&&!s.combat&&['idle','hunt'].includes(s.activity.type)&&(!q.SrcItemId||countItem(s,q.SrcItemId)>0)&&(!s.dungeon||Object.keys(s.dungeon.defeatedBosses).length>0)}));
}
export function beginQuestScene(s,id,key){
 const scene=questScenes(s,id).find(e=>e.key===key);if(!scene?.available)throw new Error('请携带任务物品，前往场景地点并结束当前活动。');
 s.rest=null;s.activity={type:'questScene',quest:id,target:key,from:s.location,startedAt:s.clock,endsAt:s.clock+scene.duration};log(s,scene.name+'（节点式改编）','quest');
}
export function finishQuestScene(s){
 const a=s.activity,q=quests[a.quest],p=s.quests[a.quest];if(!p||!q||questContentReason(q,s)||s.location!==a.from||s.hp<=0||s.combat||s.clock<a.endsAt)return;
 if(q.SrcItemId&&!countItem(s,q.SrcItemId))return;
 if(a.quest===7622&&!hasDivinity(s))return;
 const [actionKind,actionIndex]=a.target.split(':');
 if(actionKind==='special'){
  const item=q['ReqItemId'+Number(actionIndex)],action=questItemActions[item];
  if(!action||!specialReady(s,q,action)||!action.locations.includes(s.location)||countItem(s,item)>=q['ReqItemCount'+Number(actionIndex)])return;
  for(const [id,count]of action.inputs||[])takeItem(s,id,count);
  if(action.enemy){p.encounterReward={entry:action.enemy,item};return [action.enemy];}
  addItem(s,item,1);return;
 }
 if(actionKind==='source'){
  const item=Number(actionIndex),n=[1,2,3,4].find(n=>q['ReqSourceId'+n]===item);
  if(n&&countItem(s,item)<q['ReqSourceCount'+n])addItem(s,item,1);return;
 }
 if(a.target==='event')p.event=true;
 else{const [kind,index]=a.target.split(':'),n=Number(index);if(kind==='encounter')return [q['ReqCreatureOrGOId'+n]];if(kind==='spell'||kind==='objective'){const target=q['ReqCreatureOrGOId'+n]||'spell:'+n;p.kills[target]=Math.min(q['ReqCreatureOrGOCount'+n],(p.kills[target]||0)+1);}else if(kind==='item'){const item=q['ReqItemId'+n],count=q['ReqItemCount'+n]-countItem(s,item);if(count>0&&!weaponItemActions[item])addItem(s,item,count);}}
 log(s,'任务场景推进：'+nameOf('quests',a.quest),'quest');
}
export function creditExploration(s){
 // Area triggers 88 / 87 map to entering the corresponding mine node in 2D.
 for(const id of [62,76])if(s.quests[id]&&!s.quests[id].event&&eventNodes(id).includes(s.location)){s.quests[id].event=true;log(s,'探索完成：'+nameOf('quests',id),'quest');}
}
export function acceptQuest(s,id){
 const q=quests[id];if(!q||!questAvailable(s,q)||!atEndpoint(s,q,'starts'))throw new Error('当前地点无法接受这个任务，或尚未满足前置条件。');if(Object.keys(s.quests).length>=20)throw new Error('任务日志已满（20 个）。');
 const starter=(questLinks[id]?.starts||[]).find(e=>e.type==='item'&&countItem(s,e.id)>0);
 // The core checks source-item capacity before accepting, then removes an
 // item questgiver only when neither source nor turn-in objectives need it.
 if(q.SrcItemId&&!countItem(s,q.SrcItemId)&&!addItem(s,q.SrcItemId,q.SrcItemCount||1,false))throw new Error('背包空间不足，无法领取任务物品。');
 if(starter&&starter.id!==q.SrcItemId&&![1,2,3,4].some(n=>q['ReqItemId'+n]===starter.id))takeItem(s,starter.id,1);
 s.quests[id]={kills:{},event:false,acceptedAt:s.clock,expiresAt:q.LimitTime?s.clock+q.LimitTime*1000:0};log(s,'接受任务：'+nameOf('quests',id),'quest');
}
export function abandonLowLevelQuests(s,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!Number.isInteger(id)||!s.quests[id]||!quests[id]||!isLowLevelQuest(s.level,quests[id].QuestLevel)))throw new Error('任务列表已变化，请重新确认要放弃的绿色任务。');
 for(const id of ids)abandonQuest(s,id);
}
export function abandonQuest(s,id){
 const q=quests[id];if(!q||!s.quests[id])throw new Error('没有这个任务。');delete s.quests[id];
 const removable=new Set([q.SrcItemId,...[1,2,3,4].map(n=>q['ReqItemId'+n])].filter(item=>item&&items[item]?.class===12));
 for(const other of Object.keys(s.quests)){removable.delete(quests[other].SrcItemId);for(let n=1;n<=4;n++)removable.delete(quests[other]['ReqItemId'+n]);}
 s.bag=s.bag.filter(i=>!removable.has(i.id));s.pending=s.pending.filter(i=>!removable.has(i.id));s.questObjects=(s.questObjects||[]).filter(o=>o.quest!==+id);
 log(s,'放弃任务：'+nameOf('quests',id),'quest');
}
export function turnIn(s,id,choice){const q=quests[id],p=questProgress(s,id);if(!q||questContentReason(q,s)||!p?.complete||!atEndpoint(s,q,'ends'))throw new Error('任务未完成，或尚未到达交付地点。');if(p.choices.length&&!p.choices.some(i=>i.id===choice))throw new Error('请选择一件任务奖励。');for(let n=1;n<=4;n++)if(q['ReqItemId'+n])takeItem(s,q['ReqItemId'+n],q['ReqItemCount'+n]);s.money+=q.RewOrReqMoney;for(const reward of p.rewards)addItem(s,reward.id,reward.count);const selected=p.choices.find(i=>i.id===choice);if(selected)addItem(s,selected.id,selected.count);gainXp(s,s,p.xp);for(let n=1;n<=5;n++)if(q['RewRepFaction'+n])s.reputation[q['RewRepFaction'+n]]=(s.reputation[q['RewRepFaction'+n]]||0)+Math.floor(q['RewRepValue'+n]*(q['RewRepValue'+n]>0?1+racialModifiers(s).diplomacyPct:1));for(const entry of classContentManifest.entries)if(entry.acquisition==='classQuest'&&entry.actor==='player'&&entry.classId===s.classId&&entry.raceIds.includes(s.raceId)&&entry.questIds?.includes(+id)){s.learned=[...new Set([...s.learned,entry.spellId])];grantHunterTrainingLinks(s,entry.spellId);}delete s.quests[id];s.completed[id]=(s.completed[id]||0)+1;if(+id===1921){s.questWaits??={};s.questWaits[1941]=s.clock+9500;}log(s,`完成任务：${p.name} · ${p.xp} 经验`,'quest');}
export function creditKill(s,id,battle=s.combat){const c=creatures[id];if(id===10184&&s.quests[7509]&&countItem(s,18489)>0&&battle?.raidEncounter?.id==='onyxia')s.quests[7509].kills[10184]=1;for(const[qid,p]of Object.entries(s.quests)){if(+qid===434&&(!s.stockadesQuestEvent||s.stockadesQuestEvent.cancelled||s.stockadesQuestEvent.stage!=='combat'||battle?.quest!==434||battle.questEventAttempt!==s.stockadesQuestEvent.attempt))continue;const q=quests[qid];if(p.encounterReward?.entry===id&&battle?.quest===+qid){addItem(s,p.encounterReward.item,1);delete p.encounterReward;}for(let n=1;n<=4;n++){const target=q['ReqCreatureOrGOId'+n];if(target>0&&!['spell','interact'].includes(questTargetAction(q,n).kind)&&[id,c?.KillCredit1,c?.KillCredit2].includes(target))p.kills[target]=Math.min(q['ReqCreatureOrGOCount'+n],(p.kills[target]||0)+1);}}}
function canLootStarter(s,id){
 const item=items[id],quest=item?.startquest;if(!quest||item.ExtraFlags&2)return true;
 return !s.quests?.[quest]&&(!s.completed?.[quest]||!!(quests[quest]?.SpecialFlags&1));
}
export function lootRows(s,rows,depth=0,combatLoot=false,recipients=combatLoot?rewardCharacters(s):[s]){
 if(depth>8||!recipients.length)return;
 // Conditions use each recipient's private quests/inventory and the room's
 // current encounter context. One table roll is shared, never rerolled per human.
 const contexts=new Map(recipients.map(c=>[c,c===s?c:{...c,clock:s.clock,location:s.location,dungeon:s.dungeon,combat:s.combat,
  quests:c.quests||{},completed:c.completed||{},questWaits:c.questWaits||{},reputation:c.reputation||{},bag:c.bag||[],pending:c.pending||[],bank:c.bank||[]} ]));
 const personal=r=>r.ChanceOrQuestChance<0||items[r.item]?.bonding===4;
 const eligibleFor=r=>recipients.filter(c=>{
  const context=contexts.get(c);
  if((personal(r)||items[r.item]?.startquest)&&!c.quests)return false;
  return meetsCondition(context,r.condition_id)&&canLootStarter(context,r.item)&&
   (items[r.item]?.bonding!==4||items[r.item]?.startquest||needsQuestItem(context,r.item))&&
   (r.ChanceOrQuestChance>=0||needsQuestItem(context,r.item));
 });
 const groups=groupRows((rows||[]).filter(r=>eligibleFor(r).length),r=>r.groupid);
 const award=r=>{
  const eligible=eligibleFor(r);if(!eligible.length)return;
  if(r.mincountOrRef<0){for(let n=0;n<r.maxcount;n++)lootRows(s,referenceLoot[-r.mincountOrRef],depth+1,combatLoot,eligible);}
  else if(items[r.item]){
   const count=roll(s,Math.max(1,r.mincountOrRef),Math.max(1,r.maxcount));
   if(combatLoot){
    if(personal(r))for(const c of eligible)queuePersonalCombatLoot(s,c,r.item,count);
    else queueCombatLoot(s,r.item,count,eligible);
   }else addItem(s,r.item,count);
   s.totals.items+=count;log(s,`${combatLoot?'掉落':'获得'} ${nameOf('items',r.item)} ×${count}`,'loot');
  }
 };
 for(const[groupId,group]of Object.entries(groups)){
  if(+groupId===0){for(const r of group)if(rng(s)*100<Math.abs(r.ChanceOrQuestChance))award(r);}
  else{let pick=rng(s)*100;let selected;const explicit=group.filter(r=>r.ChanceOrQuestChance!==0);for(const r of explicit){pick-=Math.abs(r.ChanceOrQuestChance);if(pick<0){selected=r;break;}}const equal=group.filter(r=>r.ChanceOrQuestChance===0);if(!selected&&equal.length)selected=equal[roll(s,0,equal.length-1)];if(selected)award(selected);}
 }
}

export function gatherables(s){
 const result=[];
 for(const[id,locations]of Object.entries(objectLocations)){
  if(!locations.includes(s.location))continue;const o=objectTemplates[id];if(!o)continue;
  const rows=objectLoot[o.data1]||[],needed=rows.some(r=>needsQuestItem(s,r.item));
  const target=Object.keys(s.quests||{}).some(qid=>[1,2,3,4].some(n=>quests[qid]['ReqCreatureOrGOId'+n]===-(+id)&&(s.quests[qid].kills[-id]||0)<quests[qid]['ReqCreatureOrGOCount'+n]));
  const spawns=objectSpawnsByNode[s.location+':'+id]||[];if(!spawns.length)continue;
  if(needed||target)result.push({id:+id,name:o.name,items:rows.filter(r=>needsQuestItem(s,r.item)).map(r=>({id:r.item,name:nameOf('items',r.item)}))});
 }
 for(const o of s.questObjects||[])if(o.location===s.location&&o.availableAt<=s.clock&&s.quests[o.quest]&&!result.some(r=>r.id===o.id))result.push({id:o.id,name:objectTemplates[o.id].name,items:[{id:7292,name:nameOf('items',7292)}]});
 return result;
}
function objectAdvancesQuest(s,questId,objectId){
 const q=quests[questId],p=s.quests[questId],object=objectTemplates[objectId];if(!q||!p||!object)return false;
 for(let n=1;n<=4;n++){
  const required=q['ReqCreatureOrGOCount'+n],target=q['ReqCreatureOrGOId'+n];
  if(target===-objectId&&(p.kills[target]||0)<required)return true;
  for(const kind of ['Item','Source']){
   const item=q['Req'+kind+'Id'+n],count=countItem(s,item)+(s.pending||[]).filter(i=>i.id===item).reduce((sum,i)=>sum+i.count,0);
   if(item&&count<q['Req'+kind+'Count'+n]&&(objectLoot[object.data1]||[]).some(r=>r.item===item))return true;
  }
 }
 return false;
}
export function gatherableQuestIds(s,objectId){return Object.keys(s.quests).map(Number).filter(id=>objectAdvancesQuest(s,id,+objectId));}
export function questGathering(s,questId,objectId){
 const ids=Object.keys(objectLocations).map(Number).filter(id=>id===+objectId&&(objectLocations[id]||[]).includes(s.location)&&objectAdvancesQuest(s,+questId,id));
 for(const o of s.questObjects||[])if(o.id===+objectId&&o.location===s.location&&o.quest===+questId&&objectAdvancesQuest(s,+questId,o.id)&&!ids.includes(o.id))ids.push(o.id);
 const available=gatherables(s).find(o=>ids.includes(o.id));
 return{pending:!!available,available};
}
export function gather(s,id){
 const match=gatherables(s).find(o=>o.id===id);if(!match)throw new Error('这个目标不在当前位置或不属于当前任务。');
 const object=objectTemplates[id],generated=(s.questObjects||[]).findIndex(o=>o.id===id&&o.location===s.location&&o.availableAt<=s.clock);
 if(generated>=0)s.questObjects.splice(generated,1);
 lootRows(s,objectLoot[object.data1]);
 for(const[qid,p]of Object.entries(s.quests)){const q=quests[qid];for(let n=1;n<=4;n++)if(q['ReqCreatureOrGOId'+n]===-id)p.kills[-id]=Math.min(q['ReqCreatureOrGOCount'+n],(p.kills[-id]||0)+1);}
 log(s,'调查了 '+match.name,'quest');
}
