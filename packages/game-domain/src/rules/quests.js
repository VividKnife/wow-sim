import {grantHunterTrainingLinks} from './pet-knowledge.js';
import {queueCombatLoot} from './loot.js';
import {racialModifiers} from './racial-effects.js';
import {quests,questLinks,questXp,classContentManifest,classDefinitions,raceDefinitions,endpointNodes,creatureLocations,creatures,items,objectLocations,objectSpawnsByNode,objectTemplates,objectLoot,creatureLoot,referenceLoot,table,localize,nameOf,nearestNode,nodes} from './catalog.js';
import {countItem,takeItem,addItem,gainXp,rng,roll,log} from './character.js';
const conditions=Object.fromEntries(table('conditions').map(c=>[c.condition_entry,c]));
const previousQuests=Object.groupBy(Object.values(quests).filter(q=>q.NextQuestId>0),q=>q.NextQuestId);
const exclusiveQuests=Object.groupBy(Object.values(quests).filter(q=>q.ExclusiveGroup>0),q=>q.ExclusiveGroup);
const professionIds={171:'alchemy',164:'blacksmithing',333:'enchanting',202:'engineering',182:'herbalism',165:'leatherworking',186:'mining',393:'skinning',197:'tailoring',185:'cooking',129:'firstAid',356:'fishing'};
const outsideWorldScope=new Set([2597,3277,3358,2677,2717,2159,3428,3429,230]);
export function meetsCondition(s,id,depth=0){if(!id)return true;if(depth>8)return false;const c=conditions[id];if(!c)return false;switch(c.type){case -1:return meetsCondition(s,c.value1,depth+1)&&meetsCondition(s,c.value2,depth+1);case -2:return meetsCondition(s,c.value1,depth+1)||meetsCondition(s,c.value2,depth+1);case -3:return !meetsCondition(s,c.value1,depth+1);case 2:return countItem(s,c.value1)>=c.value2;case 6:return (s.teamId??469)===c.value1;case 8:return !!s.completed[c.value1];case 9:return !!s.quests[c.value1];case 15:return c.value2===1?s.level>=c.value1:c.value2===2?s.level<=c.value1:s.level===c.value1;case 22:return !s.completed[c.value1];default:return false;}}
export function questAvailable(s,q){if(outsideWorldScope.has(q.ZoneOrSort))return false;if((s.questWaits?.[q.entry]||0)>s.clock)return false;if(s.quests[q.entry]||s.completed[q.entry]&&!(q.SpecialFlags&1)||s.level<q.MinLevel||q.MaxLevel&&s.level>q.MaxLevel)return false;if(q.RequiredClasses&&!(q.RequiredClasses&(1<<(s.classId-1))))return false;if(q.RequiredRaces&&!(q.RequiredRaces&(1<<((s.raceId||1)-1))))return false;if(q.PrevQuestId>0&&!s.completed[q.PrevQuestId]||q.PrevQuestId<0&&!s.quests[-q.PrevQuestId])return false;
 if(q.RequiredSkill&&(s.professions?.[professionIds[q.RequiredSkill]]?.skill||0)<Math.max(1,q.RequiredSkillValue||0))return false;
 if(q.RequiredMinRepFaction&&(s.reputation[q.RequiredMinRepFaction]||0)<q.RequiredMinRepValue||q.RequiredMaxRepFaction&&(s.reputation[q.RequiredMaxRepFaction]||0)>=q.RequiredMaxRepValue)return false;
 const previous=previousQuests[q.entry]||[];if(previous.length&&!previous.some(p=>s.completed[p.entry]))return false;
 if(q.ExclusiveGroup>0&&(exclusiveQuests[q.ExclusiveGroup]||[]).some(p=>p.entry!==q.entry&&(s.completed[p.entry]||s.quests[p.entry])))return false;
 return !q.RequiredCondition||meetsCondition(s,q.RequiredCondition);
}
export function atEndpoint(s,q,kind){return(questLinks[q.entry]?.[kind]||[]).some(e=>e.type==='item'?kind==='starts'&&countItem(s,e.id)>0:endpointNodes(e).includes(s.location));}
export function needsQuestItem(s,id){return Object.keys(s.quests).some(qid=>[1,2,3,4].some(n=>quests[qid]['ReqItemId'+n]===id&&countItem(s,id)<quests[qid]['ReqItemCount'+n]));}
export function questProgress(s,id){const q=quests[id],progress=s.quests[id];if(!q)return null;const objectives=[];for(let n=1;n<=4;n++){const item=q['ReqItemId'+n],target=q['ReqCreatureOrGOId'+n];if(item)objectives.push({kind:'item',id:item,name:nameOf('items',item),count:Math.min(countItem(s,item),q['ReqItemCount'+n]),required:q['ReqItemCount'+n],locations:itemSources(item).length?itemSources(item):items[item]?.class===12?sceneLocation(q):[]});if(target||q['ReqSpellCast'+n])objectives.push({kind:q['ReqSpellCast'+n]?'spell':target>0?'kill':'object',id:target,name:target>0?nameOf('npcs',target):objectTemplates[-target]?.name||String(-target),count:progress?.kills?.[target||'spell:'+n]||0,required:q['ReqCreatureOrGOCount'+n],locations:(target>0?creatureLocations[target]:objectLocations[-target])?.length?(target>0?creatureLocations[target]:objectLocations[-target]):sceneLocation(q)});}
 if(q.SpecialFlags&2)objectives.push({kind:'event',id:q.entry,name:localize('quests',id)?.objectiveSummaryZhCN||q.EndText||'探索 / 护送事件',count:progress?.event?1:0,required:1,locations:eventNodes(q.entry)});
 const className=classDefinitions.find(c=>c.id===(s.classId||8))?.name||'法师',raceName=raceDefinitions.find(r=>r.id===(s.raceId||1))?.name||'人类';
 return{scenes:questScenes(s,id),id:q.entry,name:nameOf('quests',id),level:q.QuestLevel,minLevel:q.MinLevel,description:localize('quests',id)?.objectiveSummaryZhCN||q.Objectives||'与任务人物交谈。',details:(localize('quests',id)?.detailsZhCN||q.Details).replaceAll('$B','\n').replaceAll('$N',s.name).replaceAll('$C',className).replaceAll('$R',raceName),objectives,complete:!!progress&&objectives.every(o=>o.count>=o.required)&&s.money>=Math.max(0,-q.RewOrReqMoney),xp:questXp[id]?.[s.level-1]||0,money:q.RewOrReqMoney,available:questAvailable(s,q),active:!!progress,completed:!!s.completed[id],canAccept:questAvailable(s,q)&&atEndpoint(s,q,'starts'),canTurnIn:!!progress&&atEndpoint(s,q,'ends'),startLocations:[...new Set((questLinks[id]?.starts||[]).flatMap(endpointNodes))],endLocations:[...new Set((questLinks[id]?.ends||[]).flatMap(endpointNodes))],giver:(questLinks[id]?.starts||[]).map(e=>e.type==='creature'?nameOf('npcs',e.id):e.type==='item'?nameOf('items',e.id):objectTemplates[e.id]?.name).filter(Boolean).join(' / '),choices:[1,2,3,4,5,6].filter(n=>q['RewChoiceItemId'+n]).map(n=>({id:q['RewChoiceItemId'+n],count:q['RewChoiceItemCount'+n]})),rewards:[1,2,3,4].filter(n=>q['RewItemId'+n]).map(n=>({id:q['RewItemId'+n],count:q['RewItemCount'+n]})),repeatable:!!(q.SpecialFlags&1),expiresAt:progress?.expiresAt||0,waitUntil:s.questWaits?.[id]||0};
}
const sourceCache=new Map();
function addSource(item,locations){if(!item)return;const set=sourceCache.get(item)||new Set();for(const location of locations)if(location)set.add(location);sourceCache.set(item,set);}
function lootItems(rows,seen=new Set()){
 const result=new Set();for(const row of rows||[]){if(row.mincountOrRef>0)result.add(row.item);else if(row.mincountOrRef<0&&!seen.has(-row.mincountOrRef)){const next=new Set(seen);next.add(-row.mincountOrRef);for(const id of lootItems(referenceLoot[-row.mincountOrRef],next))result.add(id);}}return result;
}
for(const c of Object.values(creatures))for(const id of lootItems(creatureLoot[c.LootId]))addSource(id,creatureLocations[c.Entry]||[]);
for(const o of Object.values(objectTemplates))if([3,25].includes(o.type))for(const id of lootItems(objectLoot[o.data1]))addSource(id,objectLocations[o.entry]||[]);
for(const r of table('npc_vendor'))addSource(r.item,creatureLocations[r.entry]||[]);
for(const q of Object.values(quests))for(const prefix of ['RewItemId','RewChoiceItemId'])for(let n=1;n<=6;n++)addSource(q[prefix+n],(questLinks[q.entry]?.ends||[]).flatMap(endpointNodes));
export function itemSources(id){if(+id===7206)return ['mirror'];if(+id===7292)return ['bluerecluse'];return [...(sourceCache.get(+id)||[])];}
const dedicatedEvents={62:['fargodeep'],76:['jasper'],155:['sentinel','moonbrook'],1861:['mirror'],1920:['magetower'],434:['keep']};
const sceneLocation=q=>q.PointX||q.PointY?[nearestNode(q.PointX,q.PointY,q.PointMapId)].filter(Boolean):[...new Set((questLinks[q.entry]?.ends||[]).flatMap(endpointNodes))];
export const eventNodes=id=>dedicatedEvents[id]||(quests[id]?sceneLocation(quests[id]):[]);
// Scripts outside the bespoke Northshire/Defias story use explicit timed node
// scenes. They are labelled as adaptations, never presented as original scripts.
export function questScenes(s,id){
 const q=quests[id],p=s.quests[id];if(!q||!p)return [];
 const scenes=[];
 if(q.SpecialFlags&2&&!dedicatedEvents[id]&&!p.event)scenes.push({key:'event',name:q.EndText||'推进剧情事件',locations:eventNodes(id),duration:30000});
 for(let n=1;n<=4;n++){
  const target=q['ReqCreatureOrGOId'+n],spell=q['ReqSpellCast'+n],item=q['ReqItemId'+n];
  const targetLocations=target>0?creatureLocations[target]||[]:target<0?objectLocations[-target]||[]:[];
  if(target&&!spell&&!targetLocations.length&&id!==434&&(p.kills[target]||0)<q['ReqCreatureOrGOCount'+n]){
   const c=creatures[target],combat=target>0&&c&&c.MinLevel>1&&!c.NpcFlags&&!/Sickly|Captured|Tamed/i.test(c.Name);
   scenes.push({key:(combat?'encounter:':'objective:')+n,name:(combat?'召唤并挑战 ':'执行任务交互：')+(target>0?nameOf('npcs',target):objectTemplates[-target]?.name||'任务目标'),locations:sceneLocation(q),duration:combat?5000:15000});
  }
  if(spell&&(p.kills[target||'spell:'+n]||0)<q['ReqCreatureOrGOCount'+n])scenes.push({key:'spell:'+n,name:'使用任务法术：'+nameOf('spells',spell),locations:targetLocations.length?targetLocations:sceneLocation(q),duration:10000});
  if(item&&items[item]?.class===12&&item!==q.SrcItemId&&!itemSources(item).length&&countItem(s,item)<q['ReqItemCount'+n])scenes.push({key:'item:'+n,name:'调查并取得 '+nameOf('items',item),locations:sceneLocation(q),duration:20000});
 }
 return scenes.map(scene=>({...scene,adaptation:'节点式任务场景改编',available:scene.locations.includes(s.location)&&s.hp>0&&!s.combat&&['idle','hunt'].includes(s.activity.type)&&(!q.SrcItemId||countItem(s,q.SrcItemId)>0)&&(!s.dungeon||Object.keys(s.dungeon.defeatedBosses).length>0)}));
}
export function beginQuestScene(s,id,key){
 const scene=questScenes(s,id).find(e=>e.key===key);if(!scene?.available)throw new Error('请携带任务物品，前往场景地点并结束当前活动。');
 s.rest=null;s.activity={type:'questScene',quest:id,target:key,from:s.location,startedAt:s.clock,endsAt:s.clock+scene.duration};log(s,scene.name+'（节点式改编）','quest');
}
export function finishQuestScene(s){
 const a=s.activity,q=quests[a.quest],p=s.quests[a.quest];if(!p||!q||s.location!==a.from||s.hp<=0||s.combat||s.clock<a.endsAt)return;
 if(q.SrcItemId&&!countItem(s,q.SrcItemId))return;
 if(a.target==='event')p.event=true;
 else{const [kind,index]=a.target.split(':'),n=Number(index);if(kind==='encounter')return [q['ReqCreatureOrGOId'+n]];if(kind==='spell'||kind==='objective'){const target=q['ReqCreatureOrGOId'+n]||'spell:'+n;p.kills[target]=Math.min(q['ReqCreatureOrGOCount'+n],(p.kills[target]||0)+1);}else if(kind==='item'){const item=q['ReqItemId'+n],count=q['ReqItemCount'+n]-countItem(s,item);if(count>0)addItem(s,item,count);}}
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
export function abandonQuest(s,id){
 const q=quests[id];if(!q||!s.quests[id])throw new Error('没有这个任务。');delete s.quests[id];
 const removable=new Set([q.SrcItemId,...[1,2,3,4].map(n=>q['ReqItemId'+n])].filter(item=>item&&items[item]?.class===12));
 for(const other of Object.keys(s.quests)){removable.delete(quests[other].SrcItemId);for(let n=1;n<=4;n++)removable.delete(quests[other]['ReqItemId'+n]);}
 s.bag=s.bag.filter(i=>!removable.has(i.id));s.pending=s.pending.filter(i=>!removable.has(i.id));s.questObjects=(s.questObjects||[]).filter(o=>o.quest!==+id);
 log(s,'放弃任务：'+nameOf('quests',id),'quest');
}
export function turnIn(s,id,choice){const q=quests[id],p=questProgress(s,id);if(!q||!p?.complete||!atEndpoint(s,q,'ends'))throw new Error('任务未完成，或尚未到达交付地点。');if(p.choices.length&&!p.choices.some(i=>i.id===choice))throw new Error('请选择一件任务奖励。');for(let n=1;n<=4;n++)if(q['ReqItemId'+n])takeItem(s,q['ReqItemId'+n],q['ReqItemCount'+n]);s.money+=q.RewOrReqMoney;for(const reward of p.rewards)addItem(s,reward.id,reward.count);const selected=p.choices.find(i=>i.id===choice);if(selected)addItem(s,selected.id,selected.count);gainXp(s,s,p.xp);for(let n=1;n<=5;n++)if(q['RewRepFaction'+n])s.reputation[q['RewRepFaction'+n]]=(s.reputation[q['RewRepFaction'+n]]||0)+Math.floor(q['RewRepValue'+n]*(q['RewRepValue'+n]>0?1+racialModifiers(s).diplomacyPct:1));for(const entry of classContentManifest.entries)if(entry.acquisition==='classQuest'&&entry.actor==='player'&&entry.classId===s.classId&&entry.raceIds.includes(s.raceId)&&entry.questIds?.includes(+id)){s.learned=[...new Set([...s.learned,entry.spellId])];grantHunterTrainingLinks(s,entry.spellId);}delete s.quests[id];s.completed[id]=(s.completed[id]||0)+1;if(+id===1921){s.questWaits??={};s.questWaits[1941]=s.clock+9500;}log(s,`完成任务：${p.name} · ${p.xp} 经验`,'quest');}
export function creditKill(s,id){const c=creatures[id];for(const[qid,p]of Object.entries(s.quests)){if(+qid===434&&(!s.stockadesQuestEvent||s.stockadesQuestEvent.cancelled||s.stockadesQuestEvent.stage!=='combat'||s.combat?.quest!==434||s.combat.questEventAttempt!==s.stockadesQuestEvent.attempt))continue;const q=quests[qid];for(let n=1;n<=4;n++){const target=q['ReqCreatureOrGOId'+n];if(target>0&&!q['ReqSpellCast'+n]&&[id,c?.KillCredit1,c?.KillCredit2].includes(target))p.kills[target]=Math.min(q['ReqCreatureOrGOCount'+n],(p.kills[target]||0)+1);}}}
function canLootStarter(s,id){
 const item=items[id],quest=item?.startquest;if(!quest||item.ExtraFlags&2)return true;
 return !s.quests[quest]&&(!s.completed[quest]||!!(quests[quest]?.SpecialFlags&1));
}
export function lootRows(s,rows,depth=0,combatLoot=false){if(depth>8)return;const eligible=(rows||[]).filter(r=>meetsCondition(s,r.condition_id)&&canLootStarter(s,r.item)&&(r.ChanceOrQuestChance>=0||needsQuestItem(s,r.item)));const groups=Object.groupBy(eligible,r=>r.groupid);const award=r=>{if(r.mincountOrRef<0){for(let n=0;n<r.maxcount;n++)lootRows(s,referenceLoot[-r.mincountOrRef],depth+1,combatLoot);}else if(items[r.item]){const count=roll(s,Math.max(1,r.mincountOrRef),Math.max(1,r.maxcount));(combatLoot?queueCombatLoot:addItem)(s,r.item,count);s.totals.items+=count;log(s,`${combatLoot?'掉落':'获得'} ${nameOf('items',r.item)} ×${count}`,'loot');}};
 for(const[groupId,group]of Object.entries(groups)){if(+groupId===0){for(const r of group)if(rng(s)*100<Math.abs(r.ChanceOrQuestChance))award(r);}else{let pick=rng(s)*100;let selected;const explicit=group.filter(r=>r.ChanceOrQuestChance!==0);for(const r of explicit){pick-=Math.abs(r.ChanceOrQuestChance);if(pick<0){selected=r;break;}}const equal=group.filter(r=>r.ChanceOrQuestChance===0);if(!selected&&equal.length)selected=equal[roll(s,0,equal.length-1)];if(selected)award(selected);}}
}
function availableObjects(s,id){return (objectSpawnsByNode[s.location+':'+id]||[]).filter(o=>(s.objectRespawns?.[o.guid]||0)<=s.clock);}
export function gatherables(s){
 const result=[];
 for(const[id,locations]of Object.entries(objectLocations)){
  if(!locations.includes(s.location)||!availableObjects(s,id).length)continue;const o=objectTemplates[id];if(!o)continue;
  const rows=objectLoot[o.data1]||[],needed=rows.some(r=>needsQuestItem(s,r.item));
  const target=Object.keys(s.quests).some(qid=>[1,2,3,4].some(n=>quests[qid]['ReqCreatureOrGOId'+n]===-(+id)&&(s.quests[qid].kills[-id]||0)<quests[qid]['ReqCreatureOrGOCount'+n]));
  if(needed||target)result.push({id:+id,name:o.name,items:rows.filter(r=>needsQuestItem(s,r.item)).map(r=>({id:r.item,name:nameOf('items',r.item)}))});
 }
 for(const o of s.questObjects||[])if(o.location===s.location&&o.availableAt<=s.clock&&s.quests[o.quest]&&!result.some(r=>r.id===o.id))result.push({id:o.id,name:objectTemplates[o.id].name,items:[{id:7292,name:nameOf('items',7292)}]});
 return result;
}
function objectAdvancesQuest(s,questId,objectId){
 const q=quests[questId],p=s.quests[questId],object=objectTemplates[objectId];if(!q||!p||!object)return false;
 for(let n=1;n<=4;n++){
  const required=q['ReqCreatureOrGOCount'+n],target=q['ReqCreatureOrGOId'+n],item=q['ReqItemId'+n];
  if(target===-objectId&&(p.kills[target]||0)<required)return true;
  if(item&&countItem(s,item)<q['ReqItemCount'+n]&&(objectLoot[object.data1]||[]).some(r=>r.item===item))return true;
 }
 return false;
}
export function gatherableQuestIds(s,objectId){return Object.keys(s.quests).map(Number).filter(id=>objectAdvancesQuest(s,id,+objectId));}
export function questGathering(s,questId,objectId){
 const ids=Object.keys(objectLocations).map(Number).filter(id=>id===+objectId&&(objectLocations[id]||[]).includes(s.location)&&objectAdvancesQuest(s,+questId,id));
 for(const o of s.questObjects||[])if(o.id===+objectId&&o.location===s.location&&o.quest===+questId&&objectAdvancesQuest(s,+questId,o.id)&&!ids.includes(o.id))ids.push(o.id);
 const available=gatherables(s).find(o=>ids.includes(o.id));
 return{pending:ids.length>0,available};
}
export function gather(s,id){
 const match=gatherables(s).find(o=>o.id===id);if(!match)throw new Error('这个目标不在当前位置或不属于当前任务。');
 const object=objectTemplates[id],generated=(s.questObjects||[]).findIndex(o=>o.id===id&&o.location===s.location&&o.availableAt<=s.clock);
 if(generated>=0)s.questObjects.splice(generated,1);
 else{const spawn=availableObjects(s,id)[0];s.objectRespawns??={};s.objectRespawns[spawn.guid]=s.clock+roll(s,Math.abs(spawn.spawntimesecsmin),Math.abs(spawn.spawntimesecsmax))*1000;}
 lootRows(s,objectLoot[object.data1]);
 for(const[qid,p]of Object.entries(s.quests)){const q=quests[qid];for(let n=1;n<=4;n++)if(q['ReqCreatureOrGOId'+n]===-id)p.kills[-id]=Math.min(q['ReqCreatureOrGOCount'+n],(p.kills[-id]||0)+1);}
 log(s,'调查了 '+match.name,'quest');
}
