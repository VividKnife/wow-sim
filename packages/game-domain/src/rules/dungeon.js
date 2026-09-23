import {dungeonDefinition,dungeonIdFor,dungeonRoute} from './dungeon-registry.js';
export {dungeonRoute} from './dungeon-registry.js';
import {clone,enemy,rng,log,countItem,takeItem,addItem,bagCapacity,stats,knownRank} from './character.js';
import {startCombat} from './combat.js';
import {sceneCombatArea} from './combat-area.js';
import {startRecovery,stopRecovery,resurrectionFor,beginResurrection} from './recovery.js';
import {spellReady} from './spell-timing.js';
import {dungeonDestinationPath} from './dungeon-map.js';
import {selectedDungeonMembers,npcRunStarted,syncNpcWorld} from './npc-world.js';
import {lootRows} from './quests.js';
import {objectLoot,nameOf} from './catalog.js';

const current=s=>s.dungeon&&dungeonRoute(s)[s.dungeon.cursor];
const idle=s=>{if(s.combat)throw new Error('请先结束这场战斗。');if(s.activity.type!=='idle')throw new Error('请先结束当前活动。');};
const profile=(s,entry,guid,id)=>({...enemy(s,entry,id+'-'+guid),sourceGuid:String(guid)});
const recentEntries=s=>(s.dungeonEntries||[]).filter(at=>at>s.wallAt-3600000);
export function dungeonResetReason(s,id=dungeonIdFor(s)){
 dungeonDefinition(id);
 if(s.hp<=0)return '请先复活角色。';
 if(s.dungeon)return '请先离开副本。';
 if(s.combat||s.escort||s.activity.type!=='idle')return '请先结束当前活动。';
 if(!s.dungeonSaves?.[id])return '没有可重置的副本进度。';
 return '';
}
export function resetDungeon(s,id=dungeonIdFor(s)){const definition=dungeonDefinition(id),reason=dungeonResetReason(s,id);if(reason)throw new Error(reason);delete s.dungeonSaves[id];log(s,definition.name+'已重置。下次进入将开始新的冒险。','dungeon');}

export function dungeonEntryReason(s,id=dungeonIdFor(s)){
 const definition=dungeonDefinition(id),party=selectedDungeonMembers(s);
 if(s.dungeon)return '你已经在副本中。';
 if(s.guildRaid?.active||s.goldRaid?.active)return '请先离开团队副本。';
 if(s.combat)return '请先结束这场战斗。';
 if(s.activity.type!=='idle')return '请先结束当前活动。';
 if(s.location!==definition.entrance)return '请先前往'+definition.name+'入口。';
 if([s,...party].some(c=>c.level<definition.minimumLevel))return '所有成员至少需要达到 '+definition.minimumLevel+' 级。';
 if(party.length!==4||[s,...party].some(c=>c.hp<=0))return '需要五名存活的小队成员。';
 if(!s.dungeonSaves?.[id]&&recentEntries(s).length>=5)return '每小时最多进入五个新副本，请稍后再试。';
 return '';
}
export function enterDungeon(s,id=dungeonIdFor(s)){
 const definition=dungeonDefinition(id),reference=definition.reference,reason=dungeonEntryReason(s,id);if(reason)throw new Error(reason);
 if(s.npcWorld?.selection)s.party=selectedDungeonMembers(s).map(clone);
 s.dungeonSaves??={};
 if(s.dungeonSaves[id]){s.dungeon=s.dungeonSaves[id];delete s.dungeonSaves[id];npcRunStarted(s);return;}
 s.dungeonEntries=[...recentEntries(s),s.wallAt];
 const d={id,runId:id+'-'+(s.dungeonSequence=(s.dungeonSequence||0)+1),cursor:0,locationId:'entrance',destination:'full',path:[],autoAdvance:false,advanceReason:'',spawns:{},phases:{},defeated:{},defeatedBosses:{},cleared:{},skipped:{},interactions:{},position:clone(reference.entrance),startedAt:s.clock};
 const rare=Object.fromEntries(Object.entries(definition.rareEntries).map(([entry,chance])=>[entry,rng(s)<chance]));
 for(const encounter of reference.encounters)for(const row of encounter.sourceSpawns){
  if(encounter.faction&&encounter.faction!==(s.teamId===67?'Horde':'Alliance')){d.spawns[row.guid]=null;continue;}
  const choices=row.templateChoices.filter(c=>!Object.hasOwn(rare,c.entry)||rare[c.entry]);
  if(!choices.length){d.spawns[row.guid]=null;continue;}
  const chosen=choices.length===1?choices[0]:choices[Math.floor(rng(s)*choices.length)];
  d.spawns[row.guid]=profile(s,chosen.entry,row.guid,id);
 }
 if(id==='deadmines')d.phases['3600073:643']=profile(s,643,'3600073:643',id);
 s.dungeon=d;s.rest=null;
 npcRunStarted(s);
 log(s,'进入'+definition.name+'。小队等待你的下一步指令。','dungeon');
}
export function leaveDungeon(s){idle(s);if(s.groupLoot?.pending.length)throw new Error('请先分配队伍战利品再离开。');syncNpcWorld(s);if(!s.dungeon)throw new Error('当前不在副本中。');pauseDungeonAdvance(s);const definition=dungeonDefinition(s.dungeon.id);s.dungeonSaves??={};s.dungeonSaves[s.dungeon.id]=s.dungeon;delete s.dungeon;s.groundEffects=[];stopRecovery(s);log(s,'离开'+definition.name+'，保留本次副本进度。','dungeon');}
export function remainingDungeonEnemies(s,e){const d=s.dungeon,guids=e.waves?(d.interactions[e.id+':started']?e.waves[d.interactions[e.id+':wave']||0]||[]:[]):e.sourceGuids,result=guids.map(g=>d.spawns[g]).filter(p=>p&&!d.defeated[p.sourceGuid]);
 if(e.id==='dm-sneed'&&d.defeated['3600073']&&!d.defeated['3600073:643'])result.push(d.phases['3600073:643']);return result;
}
const remaining=remainingDungeonEnemies;
function advanceRoute(s,e,skipped=false){const d=s.dungeon;if(current(s)?.id!==e.id)return;if(skipped)d.skipped[e.id]=true;else d.cleared[e.id]=true;d.locationId=e.id;s.activity={type:'idle'};
 const route=dungeonRoute(s);
 if(d.destination!=='full'){
  d.path=d.path.filter(id=>id!==e.id);
  const next=d.path.find(id=>!d.cleared[id]&&!d.skipped[id]);
  d.cursor=next?route.findIndex(r=>r.id===next):route.findIndex(r=>!d.cleared[r.id]&&!d.skipped[r.id]);
  if(d.cursor<0)d.cursor=route.length;
  if(e.id===d.destination||!next)pauseDungeonAdvance(s,skipped?'目标未出现，已停止推进。':'已完成目的地，停止推进。');
 }else{
  // Preserve the full-clear order, returning to unfinished branches after a detour.
  const next=route.findIndex((r,i)=>i>d.cursor&&!d.cleared[r.id]&&!d.skipped[r.id]);
  d.cursor=next>=0?next:route.findIndex(r=>!d.cleared[r.id]&&!d.skipped[r.id]);
  if(d.cursor<0)d.cursor=route.length;
 }
 if(d.cursor===route.length){d.completedAt=s.clock;log(s,dungeonDefinition(d.id).name+'路线已完成。','dungeon');}
}
function gateReason(s,e){const a=e.activation,d=s.dungeon;if(a?.afterDeathEntry&&!d.defeatedBosses[a.afterDeathEntry])return '通道尚未打开，请先击败前方首领。';if(a?.afterInteraction&&!d.interactions[a.afterInteraction])return '需要先使用火炮打开铁门。';return '';}
function gate(s,e){const reason=gateReason(s,e);if(reason)throw new Error(reason);}
export function dungeonAdvanceReason(s){
 const e=current(s);
 if(!s.dungeon)return '请先进入副本。';
 if(s.groupLoot?.pending.length)return '请先决定队伍战利品的需求、贪婪或放弃。';
 if(s.dungeon.destination!=='full'&&(s.dungeon.cleared[s.dungeon.destination]||s.dungeon.skipped[s.dungeon.destination]))return '目的地已完成，请选择新的目标或全清副本。';
 if(!e)return '这条路线已经完成。';
 if([s,...s.party].some(c=>c.hp<=0))return '先让倒下的成员复活，再继续推进。';
 if(s.party.length!==4)return '需要五名小队成员才能继续推进。';
 if(s.pending.length||s.bag.length>=bagCapacity(s))return '请先整理背包与待拾取战利品。';
 const reason=gateReason(s,e);if(reason)return reason;
 if(e.id==='dm-cannon'&&!countItem(s,e.interaction.item))return '需要迪菲亚火药。';
 if(!s.dungeon.interactions[e.id+':started'])for(const [id,count]of e.interaction?.inputs||[])if(countItem(s,id)<count)return '需要 '+nameOf('items',id)+' ×'+count+'。';
 return '';
}
export function pauseDungeonAdvance(s,reason=''){
 const d=s.dungeon;if(!d)return;
 if(d.autoAdvance&&reason)log(s,'自动推进已暂停：'+reason,'dungeon');
 d.autoAdvance=false;d.advanceReason=reason;
}
export function dungeonDestinationReason(s,destination){
 if(!s.dungeon)return '请先进入副本。';
 if(destination==='full')return dungeonRoute(s).every(e=>s.dungeon.cleared[e.id]||s.dungeon.skipped[e.id]&&!remaining(s,e).length)?'这条路线已经完成。':'';
 const e=dungeonRoute(s).find(e=>e.id===destination);
 if(!e)return '未知的副本目的地。';
 if(s.dungeon.cleared[e.id])return '该区域已经清理完成。';
 if(e.optional&&!e.interaction&&!remaining(s,e).length)return '本次冒险未出现该目标。';
 if(!dungeonDestinationPath(s,destination).length)return '没有可通行的路线。';
 return '';
}
export function navigateDungeon(s,destination){
 const reason=dungeonDestinationReason(s,destination);if(reason)throw new Error(reason);
 if(!s.combat&& !['idle','dungeonCannon'].includes(s.activity.type))throw new Error('请先结束当前活动。');
 if([s,...s.party].some(c=>c.hp<=0))throw new Error('先让倒下的成员复活，再继续推进。');
 const d=s.dungeon,route=dungeonRoute(s),locked=!!s.combat||s.activity.type==='dungeonCannon';
 if(destination==='full')for(const e of route)if(d.skipped[e.id]&&remaining(s,e).length)delete d.skipped[e.id];
 const path=destination==='full'?[]:dungeonDestinationPath(s,destination).filter(id=>id!=='entrance'&&!d.cleared[id]);
 // Explicitly returning to a previously skipped branch is supported.
 for(const id of path)delete d.skipped[id];
 d.destination=destination;d.path=path;
 delete d.completedAt;
 if(!locked){
  d.cursor=destination==='full'?route.findIndex(e=>!d.cleared[e.id]&&!d.skipped[e.id]):route.findIndex(e=>e.id===path[0]);
  if(d.cursor<0)throw new Error('这条路线已经完成。');
 }
 d.autoAdvance=true;d.advanceReason='';
 log(s,destination==='full'?'开始全清副本。':'目的地调整为'+route.find(e=>e.id===destination).nameZh+'，完成后停止。','dungeon');
 if(!locked)advanceDungeon(s);
}
export function beginDungeonAdvance(s){
 idle(s);const reason=dungeonAdvanceReason(s);if(reason)throw new Error(reason);
 s.dungeon.autoAdvance=true;s.dungeon.advanceReason='';delete s.activity.reason;
 // The explicit command keeps the existing immediate room entry. Subsequent
 // encounters wait for ordinary recovery, using the same food/water rules.
 advanceDungeon(s,true);
}
export function advanceDungeon(s,immediate=false){
 const d=s.dungeon;if(!d?.autoAdvance)return;
 if(s.groupLoot?.pending.length)return;
 const members=[s,...s.party],fallen=members.filter(c=>c.hp<=0);
 if(fallen.length){
  const priests=members.filter(c=>c.classId===5&&c.hp>0);
  if(!priests.length){pauseDungeonAdvance(s,fallen.length===members.length?'全队阵亡，请先复活小队。':'没有存活的牧师，请先复活倒下的成员。');return;}
  // Resurrection is out of combat only, and uses the priest's learned rank,
  // real cast time, mana cost and cooldown. The dead leader is also eligible.
  if(s.combat||!['idle','dead'].includes(s.activity.type))return;
  const priest=priests.find(c=>knownRank(c,2006));
  if(!priest){pauseDungeonAdvance(s,'存活的牧师尚未学会复活术。');return;}
  const {info}=resurrectionFor(s,fallen[0].id,priest.id);
  if(info.mana>stats(priest).maxMana){pauseDungeonAdvance(s,'牧师的法力上限不足以施放复活术。');return;}
  if(priest.mana<info.mana){startRecovery(s,{[priest.id]:info.mana});return;}
  if(!spellReady(priest,info,s.clock))return;
  beginResurrection(s,fallen[0].id,priest.id);return;
 }
 if(s.combat||s.activity.type!=='idle')return;
 if(d.cursor>=dungeonRoute(s).length){pauseDungeonAdvance(s);return;}
 const reason=dungeonAdvanceReason(s);if(reason){pauseDungeonAdvance(s,reason);return;}
 if(!immediate&&startRecovery(s))return;
 const e=current(s);
 if(e.interaction&&!remaining(s,e).length)interactDungeon(s);
 else prepareEncounter(s);
}
export function prepareEncounter(s){idle(s);const d=s.dungeon;if(!d?.spawns)throw new Error('请先进入副本。');let e=current(s);
 while(e&&e.optional&&!e.interaction&&!remaining(s,e).length){log(s,'本次冒险未发现'+e.nameZh+'。','dungeon');advanceRoute(s,e,true);e=current(s);}
 if(!e){pauseDungeonAdvance(s);return;}gate(s,e);
 if([s,...s.party].some(c=>c.hp<=0))throw new Error('先让倒下的成员复活，再继续推进。');
 if(s.pending.length||s.bag.length>=bagCapacity(s))throw new Error('请先整理背包与待拾取战利品。');
 if(!remaining(s,e).length&&e.interaction)throw new Error('这里有待完成的交互。');
 stopRecovery(s);s.groundEffects=[];
 d.locationId=e.id;
 if(e.sourceCentroid)d.position=clone(e.sourceCentroid);
 const enemies=remaining(s,e).map(clone);if(!enemies.length){if(!e.interaction)advanceRoute(s,e);return;}
 startCombat(s,[],true,enemies,sceneCombatArea({dungeon:true,routeId:e.id}));s.combat.routeId=e.id;s.combat.runId=d.runId;
 s.combat.pull={startsAt:s.clock+3000,engagedAt:null};
 for(const mob of s.combat.enemies)mob.nextSpell=s.combat.pull.startsAt+6000;
 if(e.id==='dm-sneed')for(const mob of s.combat.enemies)if(mob.entry===642)mob.deathSummon={profile:clone(d.phases['3600073:643']),delay:3500};
}
export function finishDungeonCannon(s){const e=current(s),a=s.activity,d=s.dungeon;if(!e||a.type!=='dungeonCannon'||a.routeId!==e.id)throw new Error('副本路线状态不一致。');
 s.activity={type:'idle'};d.interactions[e.id]=true;d.secondAlarmAt=s.clock+e.interaction.secondAlarmDelayAfterDoorMs;log(s,'火炮轰开了铁门，里面传来了警报！','dungeon');advanceRoute(s,e);
}
export function recordDungeonProgress(s){const d=s.dungeon;if(!d?.spawns)return;
 if(d.secondAlarmAt&&s.clock>=d.secondAlarmAt){delete d.secondAlarmAt;log(s,'铁门后再次响起了迪菲亚守卫的警报。','dungeon');}
 const b=s.combat||s.lastCombat,e=current(s);if(!e||b?.runId!==d.runId||b.routeId!==e.id)return;
 for(const mob of b.enemies)if(mob.hp<=0&&mob.sourceGuid){d.defeated[mob.sourceGuid]=true;if(mob.rank)d.defeatedBosses[mob.entry]=true;}
 if(s.combat||[s,...s.party].every(c=>c.hp<=0)||remaining(s,e).length)return;
 if(e.waves&&!d.interactions[e.id]){const wave=(d.interactions[e.id+':wave']||0)+1;d.interactions[e.id+':wave']=wave;if(wave<e.waves.length){log(s,'下一波挑战即将开始。','dungeon');return;}d.interactions[e.id]=true;}
 if(!e.interaction||d.interactions[e.id])advanceRoute(s,e);
}
export function interactDungeon(s){idle(s);const e=current(s),d=s.dungeon;if(!e?.interaction)throw new Error('这里没有待完成的交互。');
 gate(s,e);
 if(remaining(s,e).length)throw new Error('请先击败看守的敌人。');if(d.interactions[e.id])throw new Error('交互已完成。');
 if(e.waves){
  if(d.interactions[e.id+':started'])throw new Error('挑战已经开始。');
  for(const [id,count]of e.interaction.inputs||[])if(countItem(s,id)<count)throw new Error('需要 '+nameOf('items',id)+' ×'+count+'。');
  for(const [id,count]of e.interaction.inputs||[])takeItem(s,id,count);
  d.interactions[e.id+':started']=true;d.interactions[e.id+':wave']=0;log(s,e.nameZh+'已开始。','dungeon');prepareEncounter(s);
 }else if(e.id==='gordok-tribute'){
  const guards=[14326,14322,14321,14323,14325,14324];d.tribute=guards.filter(id=>!d.defeatedBosses[id]).length;
  lootRows(s,objectLoot[16577]);s.classBuffs??=[];s.classBuffs.push({spell:22799,until:s.clock+7200000});
  d.interactions[e.id]=true;log(s,'接受戈多克王位，保留 '+d.tribute+' 名守卫，领取贡品。','dungeon');advanceRoute(s,e);
 }else if(e.id==='dm-gunpowder'){
  const before=clone(s.bag);if(!addItem(s,e.interaction.item,1,false)){s.bag=before;throw new Error('背包需要一个空位存放火药。');}
  d.interactions[e.id]=true;log(s,'从火药箱中取出一份迪菲亚火药。','loot');advanceRoute(s,e);
 }else if(e.id==='dm-cannon'){
  if(!countItem(s,e.interaction.item))throw new Error('需要迪菲亚火药。');takeItem(s,e.interaction.item,1);
  s.activity={type:'dungeonCannon',routeId:e.id,startedAt:s.clock,endsAt:s.clock+e.interaction.doorDelayMs};
 }
}
export function skipDungeonEncounter(s){idle(s);const e=current(s);if(!e?.optional)throw new Error('这段路线不能跳过。');advanceRoute(s,e,true);}
