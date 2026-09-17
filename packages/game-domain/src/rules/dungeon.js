import reference from '../../../game-data/data/deadmines-reference.json' with {type:'json'};
import {clone,enemy,rng,log,countItem,takeItem,addItem,bagCapacity} from './character.js';
import {startCombat} from './combat.js';
import {sceneCombatArea} from './combat-area.js';
import {stopRecovery} from './recovery.js';

export const dungeonRoute=reference.encounters;
const current=s=>dungeonRoute[s.dungeon?.cursor];
const idle=s=>{if(s.combat)throw new Error('请先结束这场战斗。');if(s.activity.type!=='idle')throw new Error('请先结束当前活动。');};
const profile=(s,entry,guid)=>({...enemy(s,entry,'dm-'+guid),sourceGuid:String(guid)});
const recentEntries=s=>(s.dungeonEntries||[]).filter(at=>at>s.wallAt-3600000);
export function dungeonResetReason(s){
 if(s.hp<=0)return '请先复活角色。';
 if(s.dungeon)return '请先离开副本。';
 if(s.combat||s.escort||s.activity.type!=='idle')return '请先结束当前活动。';
 if(!s.dungeonSave)return '没有可重置的副本进度。';
 return '';
}
export function resetDungeon(s){const reason=dungeonResetReason(s);if(reason)throw new Error(reason);delete s.dungeonSave;log(s,'死亡矿井已重置。下次进入将开始新的冒险。','dungeon');}

export function dungeonEntryReason(s){
 if(s.dungeon)return '你已经在副本中。';
 if(s.combat)return '请先结束这场战斗。';
 if(s.activity.type!=='idle')return '请先结束当前活动。';
 if(s.location!=='deadmines')return '请先前往死亡矿井入口。';
 if([s,...s.party].some(c=>c.level<reference.entrance.minimumLevel))return '所有成员至少需要达到 10 级。';
 if(s.party.length!==4||[s,...s.party].some(c=>c.hp<=0))return '需要五名存活的小队成员。';
 if(!s.dungeonSave&&recentEntries(s).length>=5)return '每小时最多进入五个新副本，请稍后再试。';
 return '';
}
export function enterDungeon(s){
 const reason=dungeonEntryReason(s);if(reason)throw new Error(reason);
 if(s.dungeonSave){s.dungeon=s.dungeonSave;delete s.dungeonSave;return;}
 s.dungeonEntries=[...recentEntries(s),s.wallAt];
 const d={id:'deadmines',runId:'dm-'+(s.dungeonSequence=(s.dungeonSequence||0)+1),cursor:0,spawns:{},phases:{},defeated:{},defeatedBosses:{},cleared:{},skipped:{},interactions:{},position:clone(reference.entrance),startedAt:s.clock};
 const rare=rng(s)<.2;
 for(const encounter of dungeonRoute)for(const row of encounter.sourceSpawns){
  if(row.guid===3600096&&!rare){d.spawns[row.guid]=null;continue;}
  const choices=row.templateChoices,chosen=choices.length===1?choices[0]:choices[Math.floor(rng(s)*choices.length)];
  d.spawns[row.guid]=profile(s,chosen.entry,row.guid);
 }
 // Sneed is a separate source summon, not a second random roll when reconnecting.
 d.phases['3600073:643']=profile(s,643,'3600073:643');s.dungeon=d;s.rest=null;
 log(s,'进入死亡矿井。小队等待你的下一步指令。','dungeon');
}
export function leaveDungeon(s){idle(s);if(!s.dungeon)throw new Error('当前不在副本中。');s.dungeonSave=s.dungeon;delete s.dungeon;s.groundEffects=[];stopRecovery(s);log(s,'离开死亡矿井，保留本次副本进度。','dungeon');}
export function remainingDungeonEnemies(s,e){const d=s.dungeon,result=e.sourceGuids.map(g=>d.spawns[g]).filter(p=>p&&!d.defeated[p.sourceGuid]);
 if(e.id==='dm-sneed'&&d.defeated['3600073']&&!d.defeated['3600073:643'])result.push(d.phases['3600073:643']);return result;
}
const remaining=remainingDungeonEnemies;
function advanceRoute(s,e,skipped=false){const d=s.dungeon;if(current(s)?.id!==e.id)return;if(skipped)d.skipped[e.id]=true;else d.cleared[e.id]=true;d.cursor++;s.activity={type:'idle'};
 if(d.cursor===dungeonRoute.length){d.completedAt=s.clock;log(s,'死亡矿井路线已完成。','dungeon');}
}
function gate(s,e){const a=e.activation,d=s.dungeon;if(a?.afterDeathEntry&&!d.defeatedBosses[a.afterDeathEntry])throw new Error('通道尚未打开，请先击败前方首领。');if(a?.afterInteraction&&!d.interactions[a.afterInteraction])throw new Error('需要先使用火炮打开铁门。');}
export function prepareEncounter(s){idle(s);const d=s.dungeon;if(!d?.spawns)throw new Error('请先进入副本。');let e=current(s);
 while(e&&e.id==='dm-miner-johnson'&&!d.spawns[3600096]){log(s,'这次矿井中没有发现矿工约翰森。','dungeon');advanceRoute(s,e,true);e=current(s);}
 if(!e)throw new Error('这条路线已经完成。');gate(s,e);
 if([s,...s.party].some(c=>c.hp<=0))throw new Error('先让倒下的成员复活，再继续推进。');
 if(s.pending.length||s.bag.length>=bagCapacity(s))throw new Error('请先整理背包与待拾取战利品。');
 if(!remaining(s,e).length&&e.interaction)throw new Error('这里有待完成的交互。');
 stopRecovery(s);s.groundEffects=[];
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
 if(!e.interaction||d.interactions[e.id])advanceRoute(s,e);
}
export function interactDungeon(s){idle(s);const e=current(s),d=s.dungeon;if(!e?.interaction)throw new Error('这里没有待完成的交互。');
 if(remaining(s,e).length)throw new Error('请先击败看守的敌人。');if(d.interactions[e.id])throw new Error('交互已完成。');
 if(e.id==='dm-gunpowder'){
  const before=clone(s.bag);if(!addItem(s,e.interaction.item,1,false)){s.bag=before;throw new Error('背包需要一个空位存放火药。');}
  d.interactions[e.id]=true;log(s,'从火药箱中取出一份迪菲亚火药。','loot');advanceRoute(s,e);
 }else if(e.id==='dm-cannon'){
  if(!countItem(s,e.interaction.item))throw new Error('需要迪菲亚火药。');takeItem(s,e.interaction.item,1);
  s.activity={type:'dungeonCannon',routeId:e.id,startedAt:s.clock,endsAt:s.clock+e.interaction.doorDelayMs};
 }
}
export function skipDungeonEncounter(s){idle(s);const e=current(s);if(!e?.optional)throw new Error('这段路线不能跳过。');advanceRoute(s,e,true);}
