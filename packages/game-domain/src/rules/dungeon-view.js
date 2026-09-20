import {dungeonDefinitions,dungeonDefinition,dungeonIdFor} from './dungeon-registry.js';
import {dungeonRoute,dungeonEntryReason,dungeonResetReason,remainingDungeonEnemies,dungeonAdvanceReason} from './dungeon.js';
import {stats,spellInfo,knownRank,countItem,bagCapacity} from './character.js';
import {items,spells,icon} from './catalog.js';
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
 return {active,saved:!!s.dungeonSaves?.[id],canReset:!dungeonResetReason(s,id),resetReason:dungeonResetReason(s,id),id,entrance:definition.entrance,zone:definition.zone,description:definition.description,atEntrance:s.location===definition.entrance,name:definition.name,minimumLevel:definition.minimumLevel,recommendedLevel:definition.recommendedLevel,
  canEnter:!entryReason,entryReason,completed:!!run&&run.cursor>=route.length,progress:run?.cursor||0,total:route.length,
  autoAdvance:active&&!!run.autoAdvance,advanceReason:active?run.advanceReason:'',
  rescuing:active&&!!run.autoAdvance&&!s.combat&&[s,...s.party].some(c=>c.hp<=0),
  waitingForLoot:active&&!!run.autoAdvance&&!s.combat&&s.pending.length>0,
  recovering:active&&!!run.autoAdvance&&!s.combat&&!s.pending.length&&s.activity.type==='idle',
  canNext:!nextReason,nextReason,canSkip:!!(free&&encounter?.optional),canLeave:free,canInteract:!interactionReason,interactionReason,
  interactionLabel:encounter?.id==='dm-cannon'?'装填火炮':'拾取迪菲亚火药',interactionIcon:icon('items',5397),
  current:encounter?{id:encounter.id,name:encounter.nameZh,kind:encounter.kind,optional:!!encounter.optional,interaction:!!encounter.interaction,enemies}:null,
  route:route.map((e,i)=>({id:e.id,name:e.nameZh,kind:e.kind,optional:!!e.optional,status:run?.cleared[e.id]?'cleared':run?.skipped[e.id]?'skipped':run&&i===run.cursor?'current':'ahead'}))};
}
