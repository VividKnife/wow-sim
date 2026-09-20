import {beginStockadesQuestEvent,cancelStockadesQuestEvent,stockadesQuestTick,stockadesQuestEventView} from './stockades-quests.js';
import {syncPartyQuest,partyUnlocked} from './party-unlock.js';
import {characterAttributes} from './character-attributes.js';
import {spellbookDetails} from './spellbook-details.js';
import {collectLoot} from './loot.js';
import {strategyPresets} from './strategy-presets.js';
import {strategyAction,strategyProfiles} from './strategy-profiles.js';
import {combatRole} from './combat-roles.js';
import {cityView,canTrainAt} from './city.js';
import {localInteractions} from './interactions.js';
import {battlePresentation} from './battle-presentation.js';
import {petTrainerAbilities,grantHunterTrainingLinks} from './pet-knowledge.js';
import {environmentTick,environmentAction} from './class-environment.js';
import {tickRacialEffects,racialModifiers} from './racial-effects.js';
import {classSupplyShop,trainingBookReason,consumeTrainingBook} from './class-acquisition.js';
import {nodes,monsterIdsAt,creatures,items,spells,spellChain,talents,classDefinitions,raceDefinitions,classAbilities,classTalentTrees,xpTable,quests,questLinks,trainerNodes,flightNodes,flights,icon,nameOf,table,creatureLocations} from './catalog.js';
import {LEVEL_CAP,refreshPetStats,clone,newCharacter,equipStarter,stats,killXp,log,countItem,takeItem,addItem,bagCapacity,canEquip,equipmentBlockedReason,equipFromBag,spellInfo,knownRank} from './character.js';
import {acceptQuest,abandonQuest,turnIn,questProgress,gather,gatherables,eventNodes,creditExploration} from './quests.js';
import {questTools,beginQuestTool,finishQuestTool} from './quest-tools.js';
import {startCombat,combatTick,expireCapture,hurtPlayer,abandonCombat} from './combat.js';
import {tickEnemyAuras} from './enemy-spells.js';
import {candidates,recruit} from './party.js';
import {enterDungeon,leaveDungeon,resetDungeon,beginDungeonAdvance,pauseDungeonAdvance,advanceDungeon,finishDungeonCannon,recordDungeonProgress,interactDungeon,skipDungeonEncounter} from './dungeon.js';
import {startRecovery,stopRecovery,recoveryTick,beginResurrection,finishResurrection} from './recovery.js';
import {dungeonView,dungeonViews,recoveryView} from './dungeon-view.js';
import {questNavigation,journeyPosition,redirectedTravel} from './navigation.js';
import {strategySpellIds,currentStrategyRules,companionRules,defaultPolicy} from './combat-strategy.js';
import {prepareAutoBuffs,defaultAutoBuffs,applyLongBuff} from './auto-buffs.js';
import {hearthstoneView,bindHearth,beginHearth,finishHearth} from './hearthstone.js';
import {beginEscort,cancelEscort,escortTick,finishEscortMove,escortView} from './escort.js';
import {storageActions,storageAction,sellBatch,settleAuctions,marketView,marketPrice,bankHere,bankCapacity,protectedItem,tradable,bankable,transferBlockedReason} from './inventory.js';
import {professionActions,professionAction,professionView,finishGather} from './professions.js';
import {defaultPotions} from './consumables.js';
import {beginUtilitySpell,finishUtilitySpell,useBagItem,utilityView} from './utility-actions.js';
import {supportedSpellNames,supportedTalentNames,defaultClassRules,racialTraits} from './class-support.js';
import {grantTalentRank,resetTalentGrants} from './talent-acquisition.js';
import {finishClassUtility,useClassPortal,tickClassChannel,finishClassChannel,cancelClassChannel} from './class-utility.js';
import {mountView,trainRiding,buyMount,beginMount,finishMount,endMount,dismount,travelRoute,updateTravelMount,travelDismountAt} from './mounts.js';
import {soulstoneRevive,reincarnationUse,reincarnate} from './class-items.js';
import {petCommand} from './class-spell-effects.js';
import {combatMembers} from './combat-members.js';
import {tickClassEffects,healAmount} from './class-mechanics.js';
export {stats,killXp,questProgress};

export function createGame(name,seed,now,{classId=8,raceId=1}={}){
 if(typeof name!=='string'||!name.trim()||name.length>16)throw new Error('角色名需要 1—16 字。');
 if(!Number.isInteger(seed)||seed<=0||seed>4294967295)throw new Error('无效的随机种子');
 const classDef=classDefinitions.find(c=>c.id===classId),raceDef=raceDefinitions.find(r=>r.id===raceId);
 if(!classDef)throw new Error('未知职业');if(!raceDef)throw new Error('未知种族');if(!classDef.races.includes(raceId))throw new Error('这个种族与职业组合不可用');
 const s={...newCharacter(name.trim(),classId,1,raceId),version:3,rngState:seed,clock:0,wallAt:now,createdAt:now,nextTick:100,nextRegen:2000,itemSequence:0,logSequence:0,logs:[],journeySequence:0,journey:[],battleHistory:[],bag:[],bags:[],pending:[],party:[],quests:{},completed:{},reputation:{},money:0,location:'northshire',visited:['northshire'],flightPoints:[],activity:{type:'idle'},combat:null,lastCombat:null,rules:clone(defaultClassRules(classId)),settings:{health:70,mana:60,autoFood:true,autoWater:true,autoLoot:false},totals:{kills:0,xp:0,money:0,items:0,deaths:0,food:0,water:0},nextPull:0,receipts:[],hearth:'northshire',hearthReady:0};
 Object.assign(s,{mounts:[],riding:{},mounted:null,professions:{},professionCooldowns:{},bank:[],bankUpgrades:0,auctions:[],marketHistory:[],resourceCooldowns:{},potions:{...defaultPotions}});
 equipStarter(s);log(s,'欢迎来到北郡。与维里副队长交谈，开始你的旅程。');return s;
}
function idle(s,reason=''){cancelClassChannel(s);if(s.activity.type==='resurrect'){const c=[s,...s.party].find(c=>c.id===s.activity.caster);if(c)c.cast=null;}s.activity={type:'idle',reason};stopRecovery(s);}
function huntInventoryBlockedReason(s){
 if(s.bag.length>=bagCapacity(s))return s.pending.length?'背包已满且有待拾取战利品，请先整理背包并领取战利品。':'背包已满，请先整理背包后再开始战斗。';
 if(s.pending.length)return'还有待拾取战利品，请先领取后再开始战斗。';
 return'';
}
function tick(s){s.time=s.clock;const st=stats(s),wasAlive=s.hp>0;environmentTick(s,{stats,hurtPlayer});
 if(!s.combat){tickEnemyAuras(s,[s,...s.party],hurtPlayer);if(wasAlive&&s.hp<=0){s.totals.deaths++;idle(s);s.activity={type:'dead',reason:'角色已死亡，请选择复活。'};}tickClassChannel(s);tickClassEffects(s,combatMembers(s));for(const c of [s,...s.party])tickRacialEffects(s,c,{stats,healAmount});}
 const regenTick=s.clock>=s.nextRegen;if(regenTick)s.nextRegen+=2000;recoveryTick(s,regenTick);
 for(const[id,q]of Object.entries(s.quests))if(q.expiresAt&&q.expiresAt<=s.clock){delete s.quests[id];log(s,'任务超时：'+nameOf('quests',id),'quest');}
 if(s.combat){combatTick(s);if(!s.combat&&s.hp>0&&s.settings.autoLoot)collectLoot(s);recordDungeonProgress(s);advanceDungeon(s);escortTick(s);stockadesQuestTick(s);return;}
 if(s.hp>0&&s.settings.autoLoot&&s.pending.length)collectLoot(s);
 if(s.escort){escortTick(s);return;}
 if(s.stockadesQuestEvent){stockadesQuestTick(s);return;}
 if(s.dungeon){recordDungeonProgress(s);advanceDungeon(s);}
 if(s.activity.type==='hunt'&&!s.rest&&s.clock>=s.nextPull){if([s,...s.party].some(c=>c.hp<=0)){idle(s,'有成员倒下，请先复活再继续狩猎。');if(s.hp<=0)s.activity={type:'dead',reason:'队长已倒下，请先复活。'};return;}const inventoryReason=huntInventoryBlockedReason(s);if(inventoryReason){if(s.pending.length)s.activity.reason=inventoryReason;else idle(s,inventoryReason);return;}if(s.activity.quest&&questProgress(s,s.activity.quest)?.complete){idle(s,'任务目标已完成。');return;}delete s.activity.reason;if(prepareAutoBuffs(s)||startRecovery(s))return;startCombat(s,[s.activity.target]);}
}
function finishActivity(s){const a=s.activity;if(a.type==='travel'){s.location=a.to;if(!s.visited.includes(a.to))s.visited.push(a.to);log(s,'抵达 '+nodes[a.to].name,'travel');creditExploration(s);idle(s);if(a.hunt){s.activity={type:'hunt',target:a.hunt,quest:a.quest||null};s.nextPull=s.clock;}}
 else if(a.type==='mount')finishMount(s);
 else if(a.type==='stockadesQuestEvent')stockadesQuestTick(s);
 else if(a.type==='escortMove')finishEscortMove(s);
 else if(a.type==='hearth'){finishHearth(s);idle(s);}
 else if(a.type==='dungeonCannon')finishDungeonCannon(s);
 else if(a.type==='gather'){gather(s,a.target);idle(s);}
 else if(a.type==='professionGather')finishGather(s);
 else if(a.type==='questItem'){const encounter=finishQuestTool(s);idle(s);if(encounter){startCombat(s,encounter);s.combat.quest=a.quest;for(const e of s.combat.enemies)e.capturePhase='fighting';}}
 else if(a.type==='revive'){for(const c of [s,...s.party].filter(c=>(a.targets||[s.id]).includes(c.id)&&c.hp<=0)){c.time=s.clock;c.hp=Math.ceil(stats(c).maxHp*.5);c.mana=Math.ceil(stats(c).maxMana*.5);c.cast=null;c.spiritRedemptionUsed=false;log(s,c.name+' 返回尸体，重新站了起来。','info');}idle(s);}
 else if(a.type==='resurrect'){finishResurrection(s);idle(s);}
 else if(['conjure','teleport'].includes(a.type))finishUtilitySpell(s);
 else if(a.type==='classSpell')finishClassUtility(s);
 else if(a.type==='classChannel')finishClassChannel(s);
}
// Skip only ticks proven to have no evolving rule state. Effects, pets, hazards,
// quest deadlines and incomplete regeneration retain the ordinary bounded path.
export function quietIdle(s){
 if(s.settings.autoLoot&&s.pending.length)return false;
 if(s.activity.type!=='idle'||s.activity.endsAt!=null||s.combat||s.dungeon||s.escort||s.stockadesQuestEvent||s.rest||s.groundEffects?.length||s.flares?.length)return false;
 if(Object.values(s.quests).some(q=>q.expiresAt))return false;
 if(!(s.nextTick>s.clock&&s.nextTick<=s.clock+100&&s.nextRegen>s.clock&&s.nextRegen<=s.clock+2000))return false;
 for(const c of [s,...s.party]){
  if(c.hp<=0||c.rest||c.cast||c.pet||c.fall||c.swimming||c.form==='aquatic'||c.environment&&c.environment.mode!=='shore')return false;
  if(['auras','hots','periodicClass','environmentBuffs','classBuffs'].some(key=>c[key]?.length))return false;
  if(Object.values(c.buffs||{}).some(buff=>!Number.isFinite(buff.until)||buff.until>s.clock))return false;
  if(['totems','talentProcs'].some(key=>Object.keys(c[key]||{}).length))return false;
  if(['bloodrage','racialBuff','cannibalize','shadowmeld','abolish','frenziedRegen','trap','feignUntil','innervateUntil'].some(key=>c[key]))return false;
  const st=stats(c);if(c.hp!==st.maxHp||c.mana!==st.maxMana||st.manaRegen)return false;
  if(c.environment&&c.environment.breathMs!==60000*(1+racialModifiers(c).underwaterBreathingPct))return false;
 }
 return true;
}
/**
 * @param {any} input
 * @param {number} now
 * @param {{maxTicks?:number,idleFastForward?:boolean,onStep?:((state:any,wallAt:number)=>void)|null,stopWhen?:((state:any)=>boolean)|null}} [options]
 */
export function advance(input,now,options={}){
 const {maxTicks=20000,idleFastForward=true,onStep=null,stopWhen=null}=options;
 if(!Number.isSafeInteger(now)||now<input.wallAt)throw new Error('无效的结算时间');const s=clone(input),origin=s.clock,target=s.clock+now-s.wallAt;let ticks=0;syncPartyQuest(s);
 while(s.clock<target){if(ticks>=maxTicks){s.wallAt+=s.clock-origin;return{state:s,complete:false};}
  if(idleFastForward&&target>=s.nextTick&&quietIdle(s)){
   const last=s.nextTick+Math.floor((target-s.nextTick)/100)*100;
   // Advance counters through strictly earlier ticks, then execute the last real
   // tick. This preserves initialization, time fields, and regeneration phase.
   s.nextRegen+=Math.max(0,Math.ceil((last-s.nextRegen)/2000))*2000;
   s.clock=last;s.nextTick=last+100;tick(s);ticks++;s.clock=target;continue;
  }
  const end=s.activity.endsAt??Infinity;const capture=Math.min(Infinity,...(s.combat?.enemies||[]).filter(e=>!e.removed&&['weakened','captured'].includes(e.capturePhase)).map(e=>e.captureUntil));const next=Math.min(target,s.nextTick,end,capture,travelDismountAt(s));s.clock=next;updateTravelMount(s);
  if(next===end)finishActivity(s);
  if(next===capture)expireCapture(s);
  if(next===s.nextTick){s.nextTick+=100;tick(s);ticks++;}
  // Observers record the same authoritative simulation; they never drive rules.
  if(onStep)onStep(s,s.wallAt+s.clock-origin);
  if(stopWhen?.(s)){s.wallAt+=s.clock-origin;settleAuctions(s);return{state:s,complete:s.clock>=target};}
 }
 settleAuctions(s);s.wallAt=now;return{state:s,complete:true};
}
function ensureIdle(s){if(s.combat||!['idle','hunt'].includes(s.activity.type))throw new Error('请先结束当前活动。');}
function reachableTravelTime(s,to){try{return s.activity.type==='travel'&&!s.activity.flight?(s.activity.to===to?Math.max(0,s.activity.endsAt-s.clock):redirectedTravel(s,to).duration):travelRoute(s,to).duration;}catch{return null;}}
export function shop(s){const vendors=table('npc_vendor').filter(r=>(creatureLocations[r.entry]||[]).includes(s.location));const unique=new Map();for(const r of vendors){const item=items[r.item];if(item&&item.RequiredLevel<=LEVEL_CAP&&!unique.has(item.entry))unique.set(item.entry,{id:item.entry,name:nameOf('items',item.entry),price:item.BuyPrice,count:item.BuyCount||1,icon:icon('items',item.entry),quality:item.Quality});}for(const row of classSupplyShop(s))if(!unique.has(row.id))unique.set(row.id,row);return[...unique.values()];}
const trainingAbilities=classId=>{const rows=new Map((classAbilities[classId]||[]).map(a=>[a.spellId,a]));if(classId===3)for(const a of petTrainerAbilities)rows.set(a.spellId,{...a,...rows.get(a.spellId),petSpellId:a.petSpellId});return [...rows.values()];};
const allAbilities=()=>Object.keys(classAbilities).flatMap(id=>trainingAbilities(+id));
const abilityKnown=(s,a)=>s.learned.includes(a.spellId)||!!a.knownEquivalentSpellId&&s.learned.includes(a.knownEquivalentSpellId);
const abilityRank=a=>Number(/Rank (\d+)/.exec(a.rank||'')?.[1]||0);
function previousAbility(a){const rows=trainingAbilities(a.classId);if(a.previousSpellId)return rows.find(x=>x.spellId===a.previousSpellId)||(spells[a.previousSpellId]?{spellId:a.previousSpellId}:null);const rank=abilityRank(a);if(rank<=1)return null;const previous=rows.find(x=>x.name===a.name&&abilityRank(x)===rank-1);if(previous)return previous;const id=Object.values(talents).filter(t=>t.classId===a.classId).flatMap(t=>t.ranks).find(id=>spells[id]?.SpellName===a.name&&Number(/Rank (\d+)/.exec(spells[id].Rank1||'')?.[1]||1)===rank-1);return id?{spellId:id}:null;}
function trainingBlocked(s,a){
 if(!a)return'技能不存在';if((a.raceIds||a.startingRaces)?.length&&!(a.raceIds||a.startingRaces).includes(s.raceId||1))return'这个技能不属于当前种族';if(a.acquisition==='talent')return'需要通过天赋树学习';if(a.classId!==s.classId)return'该技能不属于当前职业';if(!a.petSpellId&&!supportedSpellNames.has(spells[a.spellId]?.SpellName||a.name))return'该技能效果尚未实现';if(abilityKnown(s,a))return'已经学会';if(s.level<a.requiredLevel)return`需要 ${a.requiredLevel} 级`;
 const previous=previousAbility(a);if((a.previousSpellId||abilityRank(a)>1)&&(!previous||!abilityKnown(s,previous)))return'需要先学习前一等级';
 const bookReason=trainingBookReason(s,a);if(bookReason)return bookReason;if(!canTrainAt(s))return'需要前往训练师地点';if(s.money<a.costCopper)return'训练费用不足';return null;
}
const talentPointsUsed=s=>Object.values(s.talents||{}).reduce((n,v)=>n+v,0);
function talentBlocked(s,t){
 if(!t)return'天赋不存在';if(t.classId!==s.classId)return'该天赋不属于当前职业';if(!supportedTalentNames.has(t.name))return'该天赋效果尚未实现';if((s.talents[t.id]||0)>=t.maxRank)return'已经达到最高等级';if(talentPointsUsed(s)>=Math.max(0,Math.min(LEVEL_CAP,s.level)-9))return'没有可用天赋点';
 const treeUsed=Object.entries(s.talents||{}).filter(([id])=>talents[id]?.tree===t.tree).reduce((n,[,rank])=>n+rank,0);if(treeUsed<t.requiredTreePoints)return`需要在该天赋树投入 ${t.requiredTreePoints} 点`;
 for(const p of t.prerequisites||[])if((s.talents[p.talentId]||0)<p.requiredRank)return`前置天赋 ${p.name||''} 不足`;
 return null;
}
// Classic respec prices: 1g first, then 5g, +5g each reset, capped at 50g.
const talentResetCost=s=>s.growthPolicy==='companion'?0:s.talentResetCount?Math.min(500000,s.talentResetCount*50000):10000;
function talentResetBlocked(s){if(s.growthPolicy!=='companion'&&!canTrainAt(s))return'需要前往训练师地点';if(!talentPointsUsed(s))return'当前没有已分配的天赋点';if(s.money<talentResetCost(s))return'重置天赋费用不足';return null;}
export function act(input,action,now){
 const settled=advance(input,now);if(!settled.complete)throw new Error('离线结算尚未结束。');const s=settled.state;
 if(!action||typeof action.type!=='string')throw new Error('无效操作');
 if(s.stockadesQuestEvent&&!['stockadesQuestCancel','abandonCombat','stop','strategy','settings','sync','loot','cast','petCommand','useItem'].includes(action.type))throw new Error('正在进行袭击事件，请先完成或停止事件。');
 if(s.escort&&!['abandonCombat','escortCancel','stop','strategy','settings','sync','loot'].includes(action.type))throw new Error('正在护送，请先完成或停止护送。');
 if(s.hp<=0&&!['stockadesQuestCancel','abandonCombat','dungeonPause','revive','resurrect','rest','escortCancel','soulstoneRevive','reincarnate','strategy','settings'].includes(action.type))throw new Error('角色已死亡，请先复活。');
 if(s.dungeon&&!['abandonCombat','petCommand','reincarnate','soulstoneRevive','usePortal','useItem','useHearth','accept','abandon','dungeonNext','dungeonPause','dungeonInteract','dungeonSkip','leaveDungeon','stop','strategy','settings','equip','equipBag','sortBag','discardJunk','lockItem','applyEnchant','useBandage','disenchant','disenchantAll','loot','conjure','cast','revive','resurrect','rest','sync','talent'].includes(action.type))throw new Error('请先离开副本再进行这项操作。');
 if(storageActions.has(action.type)){ensureIdle(s);storageAction(s,action);return s;}
 if(professionActions.has(action.type)){ensureIdle(s);professionAction(s,action);if(['gatherResource','gatherAll','craft','useBandage','disenchant','disenchantAll'].includes(action.type))dismount(s);return s;}
 switch(action.type){
 case 'trainRiding':trainRiding(s);break;
 case 'buyMount':buyMount(s,action.id);break;
 case 'mount':beginMount(s,action.id);break;
 case 'dismount':endMount(s);break;
 case 'stockadesQuestStart':beginStockadesQuestEvent(s,action.questId);break;
 case 'stockadesQuestCancel':cancelStockadesQuestEvent(s);break;
 case 'escortStart':beginEscort(s);break;
 case 'resetDungeon':resetDungeon(s,action.contentId);break;
 case 'escortCancel':cancelEscort(s);break;
 case 'bindHearth':bindHearth(s);break;
 case 'useHearth':beginHearth(s);break;
 case 'useItem':useBagItem(s,action.uid,action.slot);break;
 case 'environment':ensureIdle(s);environmentAction(s,action);dismount(s);break;
 case 'reincarnate':reincarnate(s);break;
 case 'soulstoneRevive':soulstoneRevive(s);break;
 case 'petCommand':petCommand(s,action);break;
 case 'abandonCombat':abandonCombat(s,action.encounterId);recordDungeonProgress(s);pauseDungeonAdvance(s,'已放弃战斗，请恢复小队后继续。');break;
 case 'enterDungeon':enterDungeon(s,action.contentId);break;
 case 'leaveDungeon':leaveDungeon(s);break;
 case 'dungeonNext':ensureIdle(s);beginDungeonAdvance(s);break;
 case 'dungeonPause':if(!s.dungeon)throw new Error('请先进入副本。');pauseDungeonAdvance(s,s.combat?'本场战斗结束后停止推进。':'已手动暂停推进。');break;
 case 'dungeonInteract':interactDungeon(s);break;
 case 'dungeonSkip':skipDungeonEncounter(s);break;
 case 'accept':ensureIdle(s);if(s.dungeon&&!questLinks[action.id]?.starts.some(e=>e.type==='item'))throw new Error('请离开副本后再与外面的人物交谈。');acceptQuest(s,action.id);break;
 case 'turnin':ensureIdle(s);turnIn(s,action.id,action.choice);break;
 case 'abandon':ensureIdle(s);abandonQuest(s,action.id);break;
 case 'useQuestItem':beginQuestTool(s,action.id);break;
 case 'recruit':ensureIdle(s);recruit(s,action.id,action);break;
 case 'navigateQuest':{ensureIdle(s);const q=questProgress(s,action.id);if(!q?.active)throw new Error('请先接受这个任务。');const target=questNavigation(s,q);if(!target)throw new Error('这个任务暂时没有可导航的地点。');if(target.here)throw new Error('你已在任务区域，请完成目标或交付任务。');const r=travelRoute(s,target.to);s.activity={type:'travel',from:s.location,to:target.to,startedAt:s.clock,endsAt:s.clock+r.duration,path:r.path,quest:q.id};s.rest=null;s.groundEffects=[];break;}
 case 'travel':{const moving=s.activity.type==='travel';if(!moving)ensureIdle(s);else if(s.combat)throw new Error('战斗中不能更改目的地。');if(!moving&&action.to===s.location)throw new Error('你已经在这里');const r=moving?redirectedTravel(s,action.to):travelRoute(s,action.to);if(action.hunt&&!monsterIdsAt(action.to).includes(action.hunt))throw new Error('目的地没有这个狩猎目标');s.activity={type:'travel',from:moving?r.from:s.location,to:action.to,startedAt:moving?r.startedAt:s.clock,endsAt:moving?r.endsAt:s.clock+r.duration,hunt:action.hunt||null,quest:action.quest||null,path:r.path};s.rest=null;s.groundEffects=[];if(moving)log(s,'更改目的地：'+nodes[action.to].name+'，从当前位置重新规划路线。','travel');break;}
 case 'hunt':ensureIdle(s);if(!monsterIdsAt(s.location).includes(action.id))throw new Error('当前地点没有这个怪物');{const blocked=huntInventoryBlockedReason(s);if(blocked)throw new Error(blocked);}s.activity={type:'hunt',target:action.id,quest:action.quest||null};s.nextPull=s.clock;break;
 case 'stop':if(s.stockadesQuestEvent){cancelStockadesQuestEvent(s);break;}pauseDungeonAdvance(s,'已停止推进。');{const row=s.journey?.find(row=>row.id===s.activity.journeySession);if(row)row.endedAt=s.clock;}if(s.escort){cancelEscort(s);break;}if(s.combat){s.activity={type:'idle',reason:'本场战斗结束后停止。'};}else if(s.activity.type==='travel'&&s.activity.flight){if(!s.activity.stopAtNext){s.activity.stopAtNext=true;log(s,'将在下一飞行点 '+nodes[s.activity.to].name+' 停靠。','travel');}}else if(s.activity.type==='travel')throw new Error('旅行中请在地图上更改目的地。');else if(s.activity.type==='dungeonCannon')throw new Error('火炮已经点燃，请等待铁门打开。');else idle(s,'已停止。');break;
 case 'train':{ensureIdle(s);const a=allAbilities().find(a=>a.spellId===action.id&&a.classId===s.classId)||allAbilities().find(a=>a.spellId===action.id),blocked=trainingBlocked(s,a);if(blocked)throw new Error(blocked);consumeTrainingBook(s,a);s.money-=a.costCopper;s.learned.push(a.spellId);grantHunterTrainingLinks(s,a.spellId);log(s,(a.acquisition==='classQuest'?'职业解锁（共用路线）：':'学会了 ')+nameOf('spells',a.spellId),'learn');break;}
 case 'talent':{ensureIdle(s);const t=talents[action.id],blocked=talentBlocked(s,t);if(blocked)throw new Error(blocked);grantTalentRank(s,t,(s.talents[t.id]||0)+1);if(s.pet)refreshPetStats(s,s.pet);log(s,'天赋提升：'+(t.nameZhCN||t.name),'learn');break;}
 case 'resetTalents':{ensureIdle(s);if(s.growthPolicy!=='companion'&&!canTrainAt(s))throw new Error('需要前往训练师地点重置天赋');if(!talentPointsUsed(s))throw new Error('当前没有已分配的天赋点');const cost=talentResetCost(s);if(s.money<cost)throw new Error('重置天赋费用不足');resetTalentGrants(s);if(s.pet)refreshPetStats(s,s.pet);s.money-=cost;s.talentResetCount=(s.talentResetCount||0)+1;log(s,`重置天赋，花费 ${cost} 铜`,'learn');break;}
 case 'buy':{ensureIdle(s);if(!Number.isInteger(action.count)||action.count<1||action.count>20)throw new Error('购买数量无效');const row=shop(s).find(r=>r.id===action.id);if(!row||s.money<row.price*action.count)throw new Error('商品不可购买或金币不足');const before=clone(s.bag);if(!addItem(s,row.id,row.count*action.count,false)){s.bag=before;throw new Error('背包空间不足');}s.money-=row.price*action.count;break;}
 case 'sell':
 case 'sellBatch':{ensureIdle(s);if(!shop(s).length)throw new Error('附近没有商人');sellBatch(s,action.type==='sell'?[action.uid]:action.uids);break;}
 case 'sellJunk':{ensureIdle(s);if(!shop(s).length)throw new Error('附近没有商人');const selected=s.bag.filter(i=>items[i.id]?.Quality===0&&items[i.id]?.SellPrice>0&&!protectedItem(i));if(!selected.length)throw new Error('没有可出售的灰色垃圾');const uids=new Set(selected.map(i=>i.uid)),amount=selected.reduce((n,i)=>n+items[i.id].SellPrice*i.count,0);s.money+=amount;s.bag=s.bag.filter(i=>!uids.has(i.uid));log(s,'一键售卖垃圾，获得 '+amount+' 铜','trade');break;}
 case 'equip':ensureIdle(s);equipFromBag(s,action.uid,action.target,action.slot);break;
 case 'gather':ensureIdle(s);if(!gatherables(s).some(x=>x.id===action.id))throw new Error('目标不在这里');s.activity={type:'gather',target:action.id,endsAt:s.clock+5000};break;
 case 'conjure':{const id=knownRank(s,action.water?5504:587);if(!id)throw new Error('尚未学习造餐术/造水术');beginUtilitySpell(s,id);break;}
 case 'unlockFlight':ensureIdle(s);if(!flightNodes.includes(s.location))throw new Error('这里没有飞行管理员');if(!s.flightPoints.includes(s.location))s.flightPoints.push(s.location);break;
 case 'fly':{ensureIdle(s);const f=flights.find(f=>[f.a,f.b].includes(s.location)&&[f.a,f.b].includes(action.to)&&s.location!==action.to);if(!f||![s.location,action.to].every(n=>s.flightPoints.includes(n)))throw new Error('尚未解锁这条飞行路线');if(s.money<f.cost)throw new Error('飞行费用不足');s.money-=f.cost;s.activity={type:'travel',from:s.location,to:action.to,startedAt:s.clock,endsAt:s.clock+f.duration,flight:true};break;}
 case 'revive':{if(s.combat)throw new Error('小队仍在战斗中，无法返回尸体复活。');if(!['idle','dead'].includes(s.activity.type))throw new Error('请先结束当前活动。');const targets=[s,...s.party].filter(c=>c.hp<=0).map(c=>c.id);if(!targets.length)throw new Error('角色仍然活着');stopRecovery(s);s.activity={type:'revive',targets,endsAt:s.clock+Math.ceil(10000/(1+racialModifiers(s).ghostSpeedPct))};break;}
 case 'resurrect':beginResurrection(s,action.target);break;
 case 'rest':if(s.combat||!['idle','dead','hunt'].includes(s.activity.type))throw new Error('请先结束当前活动。');s.activity={type:'idle'};startRecovery(s);break;
 case 'sync':break;
 case 'strategy':{const c=!action.target||action.target===s.id?s:s.party.find(c=>c.id===action.target);if(!c)throw new Error('找不到这个小队成员');strategyAction(c,action);break;}
 case 'settings':{if(action.autoLoot!==undefined){if(typeof action.autoLoot!=='boolean')throw new Error('自动拾取设置无效');s.settings.autoLoot=action.autoLoot;}if(action.health===undefined&&action.mana===undefined)break;if(!Number.isInteger(action.health)||!Number.isInteger(action.mana)||action.health<1||action.health>100||action.mana<1||action.mana>100)throw new Error('恢复阈值必须为 1—100 的整数');s.settings.health=action.health;s.settings.mana=action.mana;break;}
 case 'loot':{collectLoot(s,action.uids);break;}
 case 'equipBag':{ensureIdle(s);const item=s.bag.find(i=>i.uid===action.uid),data=items[item?.id];if(!data||data.class!==1||!data.ContainerSlots||data.BagFamily)throw new Error('需要普通背包');if(item.locked)throw new Error('请先解锁这个背包');const slot=s.bags.length<4?s.bags.length:s.bags.reduce((best,i,n)=>items[i.id].ContainerSlots<items[s.bags[best].id].ContainerSlots?n:best,0),old=s.bags[slot];if(old&&data.ContainerSlots<=items[old.id].ContainerSlots)throw new Error('背包栏已满，只能换上容量更大的背包');s.bag=s.bag.filter(i=>i.uid!==item.uid);if(old&&!old.issued)s.bag.push(old);s.bags[slot]={...item,count:1};break;}
 case 'cast':beginUtilitySpell(s,action.id,action.target);break;
 case 'usePortal':useClassPortal(s,action.id);break;
 default:throw new Error('尚未支持的操作');
 }
 if(['hunt','gather','conjure','cast','useHearth','useItem','useQuestItem','fly','enterDungeon','stockadesQuestStart','escortStart','rest','resurrect','revive'].includes(action.type))dismount(s);
 updateTravelMount(s);
 return s;
}
// Combat polling must not rebuild trainers, talents, the world map or the economy.
export function combatView(s){
 const battleView=battlePresentation(s);
 const ids=[...new Set([...(battleView?.spellIds||[]),...s.learned,...s.party.flatMap(c=>c.learned),...s.logs.map(l=>l.spellId).filter(Boolean)])];
 const combatSkills=ids.filter(id=>spells[id]).map(id=>{const info=spellInfo(s,id);return{spellId:id,name:nameOf('spells',id),icon:icon('spells',id),range:info?.range||0,radius:info?.radius||0,school:spells[id]?.School,nameEn:spells[id]?.SpellName};});
 return{battleView,combatSkills,stats:stats(s),characterAttributes:characterAttributes(s),resource:battleView?.units[s.id]?.resource,nextXp:s.level>=LEVEL_CAP?0:xpTable[s.level]?.xp_for_next_level||0,location:nodes[s.location],reincarnation:s.classId===7?reincarnationUse(s):null,canSoulstoneRevive:s.hp<=0&&!s.combat&&s.soulstone?.until>s.clock,questTools:questTools(s)};
}
export function view(s){
 const questViews=Object.values(quests).map(q=>{const p=questProgress(s,q.entry);return{...p,navigation:questNavigation(s,p)}});
 const classId=s.classId||8,raceId=s.raceId||1,classDef=classDefinitions.find(c=>c.id===classId),raceDef=raceDefinitions.find(r=>r.id===raceId),st=stats(s);
 const skillViews=[...new Map(trainingAbilities(classId).filter(a=>!(a.raceIds||a.startingRaces)?.length||(a.raceIds||a.startingRaces).includes(s.raceId||1)).map(a=>[a.spellId,a])).values()].map(a=>{const blocked=trainingBlocked(s,a),info=spellInfo(s,a.spellId),powerType=spells[a.spellId]?.PowerType;return{...a,details:spellbookDetails(s,a.petSpellId?spellInfo(s,a.petSpellId):info),name:nameOf('spells',a.petSpellId||a.spellId),nameEn:spells[a.petSpellId||a.spellId]?.SpellName,icon:icon('spells',a.petSpellId||a.spellId),known:abilityKnown(s,a),cast:info?.castMs,channelMs:(info?.AttributesEx&68)?info.durationMs:0,powerName:powerType===1?'怒气':powerType===3?'能量':'法力',powerCost:powerType===1?(info?.mana||0)/10:info?.mana||0,supported:!!a.petSpellId||supportedSpellNames.has(spells[a.spellId]?.SpellName||a.name),canTrain:!blocked,blockedReason:blocked,acquisitionLabel:({petTrainer:'宠物训练师',classQuest:'职业解锁（共用路线）',book:'技能书',talent:'天赋',racial:'种族能力',starting:'初始技能'})[a.acquisition]||'训练师'}});
 const talentView=t=>{const blocked=talentBlocked(s,t);return{...t,icon:icon('talents',t.id),rank:s.talents?.[t.id]||0,supported:supportedTalentNames.has(t.name),canLearn:!blocked,blockedReason:blocked}};
 const talentViews=Object.values(talents).filter(t=>t.classId===classId).map(talentView),treeViews=classTalentTrees.filter(t=>t.classId===classId).map(tree=>({...tree,talents:tree.talents.map(t=>talentView(talents[t.id]||t))}));
 const power=s.form==='bear'||s.form==='direBear'?'rage':s.form==='cat'?'energy':s.power;const resource=power==='rage'?{name:'怒气',value:Math.floor((s.rage||0)/10),max:100}:power==='energy'?{name:'能量',value:s.energy||0,max:st.maxEnergy||100}:{name:'法力',value:s.mana||0,max:st.maxMana};
 const resetCost=talentResetCost(s);
 const battleView=battlePresentation(s);
 const flight=flightNodes.includes(s.location)?{discovered:s.flightPoints.includes(s.location),routes:flights.filter(f=>f.a===s.location||f.b===s.location).map(f=>{const to=f.a===s.location?f.b:f.a;return{to,name:nodes[to].name,duration:f.duration,cost:f.cost,unlocked:s.flightPoints.includes(s.location)&&s.flightPoints.includes(to)};})}:null;
 return{partyUnlocked:partyUnlocked(s),interactions:localInteractions(s,questViews),city:cityView(s),flight,battleView,reincarnation:s.classId===7?reincarnationUse(s):null,canSoulstoneRevive:s.hp<=0&&!s.combat&&s.soulstone?.until>s.clock,...utilityView(s),...professionView(s),className:classDef?.name||'',raceName:raceDef?.name||'',faction:raceDef?.faction||'',resource,raceTraits:racialTraits(s),talentTrees:treeViews,talentResetCost:resetCost,canResetTalents:!talentResetBlocked(s),talentResetBlockedReason:talentResetBlocked(s),bankCapacity:bankCapacity(s),bankHere:bankHere(s),bankUpgradeCost:s.bankUpgrades<3?1000*(s.bankUpgrades+1):null,inventoryActions:Object.fromEntries(s.bag.map(i=>[i.uid,{transferBlockedReason:transferBlockedReason(i),protected:protectedItem(i),bankable:bankable(i),tradable:tradable(i)&&items[i.id]?.Quality>0,quote:marketPrice(i.id),equippable:!equipmentBlockedReason(s,i),equipBlockedReason:equipmentBlockedReason(s,i)}])),escort:escortView(s),escortNpc:s.escort?{...s.escort.npc,stats:stats(s.escort.npc)}:null,hearthstone:hearthstoneView(s),mounts:mountView(s),strategyMembers:[s,...s.party].map(c=>({id:c.id,name:c.name,classId:c.classId,rules:currentStrategyRules(c,c.rules||companionRules(c)||defaultClassRules(c.classId)),presets:strategyPresets(c),strategyProfiles:strategyProfiles(c),role:combatRole(c),policy:{...defaultPolicy,...c.strategyPolicy},autoBuffs:{...defaultAutoBuffs,...c.autoBuffs},potions:{...defaultPotions,...c.potions},skills:strategySpellIds(c).map(id=>({spellId:id,name:nameOf('spells',id),nameEn:spells[id]?.SpellName,icon:icon('spells',id),known:c.learned.includes(id),rank:spellChain[id]?.rank?`等级 ${spellChain[id].rank}`:''}))})),journey:journeyPosition(s),dungeon:dungeonView(s),dungeons:dungeonViews(s),stockadesQuestEvent:stockadesQuestEventView(s),recovery:recoveryView(s),combatSkills:[...new Set([...(classAbilities[classId]||[]).map(a=>a.spellId),...(battleView?.spellIds||[]),...s.learned,...s.party.flatMap(c=>c.learned),...s.logs.map(l=>l.spellId).filter(Boolean)])].filter(id=>spells[id]).map(id=>({spellId:id,name:nameOf('spells',id),icon:icon('spells',id),range:spellInfo(s,id)?.range||0,radius:spellInfo(s,id)?.radius||0,school:spells[id]?.School,nameEn:spells[id]?.SpellName})),candidates:candidates(s),party:s.party.map(c=>({...c,stats:stats(c),equippable:s.bag.filter(i=>!equipmentBlockedReason(c,i,undefined,s)).map(i=>i.uid)})),nextXp:s.level>=LEVEL_CAP?0:xpTable[s.level]?.xp_for_next_level||0,stats:st,characterAttributes:characterAttributes(s,st),location:nodes[s.location],map:Object.values(nodes).map(n=>({...n,hasFlight:flightNodes.includes(n.id),flightUnlocked:s.flightPoints.includes(n.id),travel:n.id===s.location&&s.activity.type!=='travel'?0:reachableTravelTime(s,n.id)})),monsters:monsterIdsAt(s.location).map(id=>({id,name:nameOf('npcs',id),min:creatures[id].MinLevel,max:creatures[id].MaxLevel,elite:!!creatures[id].Rank})),quests:questViews,questTools:questTools(s),shop:shop(s),gatherables:gatherables(s),bagCapacity:bagCapacity(s),skills:skillViews,talents:talentViews,canTrain:canTrainAt(s),hasFlight:flightNodes.includes(s.location)};
}
