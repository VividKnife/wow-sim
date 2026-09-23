import {selectedDungeonMembers} from './npc-world.js';
import {dungeonDefinitions,dungeonDefinition,dungeonIdFor} from './dungeon-registry.js';
import {dungeonRoute,dungeonEntryReason,dungeonResetReason,remainingDungeonEnemies,dungeonAdvanceReason,dungeonDestinationReason} from './dungeon.js';
import {dungeonMap,dungeonDestinationPath} from './dungeon-map.js';
import {dungeonQuestObjectives,dungeonQuestTargets} from './dungeon-quest-targets.js';
import {dungeonJournal} from './dungeon-journal.js';
import {stats,spellInfo,knownRank,countItem,bagCapacity} from './character.js';
import {items,spells,icon,nameOf} from './catalog.js';
import {resurrectionFor} from './recovery.js';

export function recoveryView(s){
 const members=[s,...s.party],free=!s.combat&&['idle','dead','hunt'].includes(s.activity.type);
 const canBeginResurrection=!s.combat&&['idle','dead'].includes(s.activity.type);
 const fallen=members.filter(c=>c.hp<=0).map(c=>{const resurrection=resurrectionFor(s,c.id),canResurrect=!!(canBeginResurrection&&resurrection&&resurrection.caster.mana>=resurrection.info.mana);return{id:c.id,name:c.name,canResurrect,reason:!canBeginResurrection?'请先结束当前活动。':!resurrection?'需要存活且学会复活法术的牧师、圣骑士或萨满祭司。':resurrection.caster.mana<resurrection.info.mana?'复活施法者法力不足，先恢复法力。':''}});
 const conjure=water=>{const id=knownRank(s,water?5504:587),sp=id&&spellInfo(s,id);return !!(free&&s.hp>0&&sp&&s.mana>=sp.mana);};
 const supplies=aura=>s.bag.reduce((n,i)=>n+(spells[items[i.id]?.spellid_1]?.EffectApplyAuraName1===aura?i.count:0),0);
 return {fallen,canRevive:fallen.length>0&&!s.combat&&['idle','dead'].includes(s.activity.type),canRest:free,
  canConjureFood:conjure(false),canConjureWater:conjure(true),food:supplies(84),water:supplies(85),
  members:members.map(c=>({id:c.id,name:c.name,role:c.role||'队长',level:c.level,hp:c.hp,mana:c.mana,maxHp:stats(c).maxHp,maxMana:stats(c).maxMana,restUntil:c.rest?.until||0}))};
}

export function dungeonViews(s){return Object.fromEntries(Object.keys(dungeonDefinitions).map(id=>[id,dungeonView(s,id)]));}
export function dungeonView(s,id=dungeonIdFor(s)){
 const definition=dungeonDefinition(id),route=dungeonRoute(id);
 const active=s.dungeon?.id===id,run=active?s.dungeon:s.dungeonSaves?.[id],encounter=run&&route[run.cursor];
 const context=run?{...s,dungeon:run}:s,remaining=encounter?remainingDungeonEnemies(context,encounter):[];
 const enemies=[];for(const mob of remaining){let row=enemies.find(e=>e.entry===mob.entry&&e.level===mob.level);if(!row){row={entry:mob.entry,name:mob.name,level:mob.level,elite:!!mob.rank,count:0};enemies.push(row);}row.count++;}
 const entryReason=dungeonEntryReason(s,id),free=active&&!s.combat&&s.activity.type==='idle'&&s.hp>0;
 const activityReason=s.combat?'小队正在战斗。':s.hp<=0?'先复活倒下的队长。':s.activity.type!=='idle'?'请先结束当前活动。':'';
 let nextReason=!active?'请先进入副本。':activityReason||dungeonAdvanceReason(s);
 if(!nextReason&&[s,...s.party].some(c=>c.rest))nextReason='小队正在恢复，休整结束后继续。';
 let interactionReason=!free?activityReason||'请先进入副本。':!encounter?.interaction?'这里没有待完成的交互。':remaining.length?'先击败看守的敌人。':'';
 if(!interactionReason&&encounter.id==='dm-cannon'&&!countItem(s,5397))interactionReason='需要迪菲亚火药。';
 if(!interactionReason&&encounter.id==='dm-gunpowder'&&s.bag.length>=bagCapacity(s)&&!countItem(s,5397))interactionReason='背包需要一个空位存放火药。';
 if(!interactionReason)for(const [item,count]of encounter.interaction?.inputs||[])if(countItem(s,item)<count)interactionReason='需要 '+nameOf('items',item)+' ×'+count+'。';
 const map=dungeonMap(id),objectives=run?dungeonQuestObjectives(s):[],bosses=dungeonJournal.find(d=>d.id===id).bosses;
 const navigateReason=!active?'请先进入副本。':[s,...s.party].some(c=>c.hp<=0)?'先让倒下的成员复活，再继续推进。':!s.combat&&!['idle','dungeonCannon'].includes(s.activity.type)?'请先结束当前活动。':'';
 return {background:dungeonJournal.find(d=>d.id===id)?.background,active,saved:!!s.dungeonSaves?.[id],canReset:!dungeonResetReason(s,id),resetReason:dungeonResetReason(s,id),id,entrance:definition.entrance,zone:definition.zone,description:definition.description,atEntrance:s.location===definition.entrance,name:definition.name,minimumLevel:definition.minimumLevel,recommendedLevel:definition.recommendedLevel,
  groupSize:selectedDungeonMembers(s).length+1,canEnter:!entryReason,entryReason,completed:!!run?.completedAt,progress:run?route.filter(e=>run.cleared[e.id]||run.skipped[e.id]).length:0,total:route.length,
  destination:run?.destination||'full',locationId:run?.locationId||'entrance',path:run?.path||[],map,
  canNavigate:!navigateReason,navigateReason,
  canFullClear:!navigateReason&&active&&!dungeonDestinationReason(s,'full'),
  autoAdvance:active&&!!run.autoAdvance,advanceReason:active?run.advanceReason:'',
  rescuing:active&&!!run.autoAdvance&&!s.combat&&[s,...s.party].some(c=>c.hp<=0),
  waitingForLoot:active&&!!run.autoAdvance&&!s.combat&&s.pending.length>0,
  recovering:active&&!!run.autoAdvance&&!s.combat&&!s.pending.length&&s.activity.type==='idle',
  canNext:!nextReason,nextReason,canSkip:!!(free&&encounter?.optional),canLeave:free&&!s.groupLoot?.pending.length,canInteract:!interactionReason,interactionReason,
  interactionLabel:encounter?.interaction?.label||(encounter?.id==='dm-cannon'?'装填火炮':'拾取迪菲亚火药'),interactionIcon:icon('items',encounter?.interaction?.inputs?.[0]?.[0]||5397),
  current:encounter?{id:encounter.id,name:encounter.nameZh,kind:encounter.kind,optional:!!encounter.optional,interaction:!!encounter.interaction,enemies}:null,
  route:route.map((e,i)=>{
   const mobs=run?remainingDungeonEnemies(context,e):[],entries=[...new Set(mobs.map(m=>m.entry))];
   // The second Sneed phase exists before the machine dies and shares this room.
   if(e.id==='dm-sneed'&&run&&!run.defeated['3600073:643'])entries.push(643);
   const reason=navigateReason||(active?dungeonDestinationReason(s,e.id):'');
   return {id:e.id,name:e.nameZh,kind:e.kind,optional:!!e.optional,
    bossIds:bosses.filter(b=>e.creatureTemplateIds.includes(b.id)).map(b=>b.id),
    quests:dungeonQuestTargets(s,entries,objectives),
    enemies:[...new Map(mobs.map(m=>[m.entry,{entry:m.entry,name:m.name}])).values()],
    canNavigate:!reason,navigateReason:reason,path:active?dungeonDestinationPath(s,e.id):[],
    status:run?.cleared[e.id]?'cleared':run?.skipped[e.id]?'skipped':run&&e.optional&&!e.interaction&&!mobs.length?'absent':run&&i===run.cursor?'current':'ahead'};
  })};
}
