import {instancePresentation} from './instance-presentation.js';
import {combatMembers} from './combat-members.js';
import {characterAttributes} from './character-attributes.js';

const playerKeys = ['contentPhase',
  'serverBuffs','id','name','classId','raceId','gender','growthPolicy','level','xp','hp','mana','rage','energy','power','form','stance','money','clock','wallAt',
  'activity','rest','location','visited','flightPoints','hearth','hearthReady','equipment','bag','bags','pending','bank','bankUpgrades',
  'auctions','marketHistory','marketStock','marketClock','party','pet','escort','combat','recentCorpses','lastCombat','dungeon','cast','groundEffects','learned','talents','quests',
  'completed','reputation','rules','settings','potions','mounts','riding','mounted','professions','professionCooldowns','resourceCooldowns','resourceStocks',
  'journey','logs','logSequence','totals','soulstone','bandageReady','nextPull','selectedAmmoId','townSupplies','townSupplyVisit'
] as const;

const viewKeys = [
  'playerEffects',
  'npcWorld','groupLoot',
  'arena','pvp','battleground',
  'partyBuffCheck','combatCommand','raidCommand','goldRaid','partyUnlocked','battleView','reincarnation','canSoulstoneRevive','skillUsesByTarget','skillUseReadyAt','environment','trackingKind','trackedTreasures','lockpicking',
  'trackedTargets','scouting','lockTargets','petControls','petStable','classPortals','skillUses','itemUses','itemBuffs','professions','professionRecipeCount','canTrainProfession',
  'resources','disenchantable','className','raceName','faction','resource','raceTraits','talentTrees','talentResetCost','canResetTalents',
  'talentResetBlockedReason','buildChangeBlockedReason','bankCapacity','bankHere','bankUpgradeCost','inventoryActions','escort','escortNpc','hearthstone','mounts',
  'strategyMembers','journey','dungeon','dungeons','dungeonQuests','stockadesQuestEvent','recovery','combatSkills','party','nextXp','stats','characterAttributes','location','map','monsters','quests',
  'questTools','shop','gatherables','bagCapacity','inventoryBags','generalBagFree','skills','talents','canTrain','hasFlight','city','flight','interactions','ammo','townSupplies'
] as const;

const actorKeys=['serverBuffs','npcPlayer','growthPolicy','serverBuffs','id','name','classId','raceId','gender','level','role','hp','mana','rage','energy','power','form','stance','position','positionY','maxHp','maxMana','spell','kind','autocastDisabled','mode','petUnit','totemUnit','ownerId','controlledBy','controlUntil','removed','dead','fleeing','stealthed','combatFacing','happiness','loyalty','trainingPoints','availableSkills','target','combo','comboTarget','nextSwing','swingStartedAt','nextAttack','nextRanged','rangedStartedAt','nextOffhand','offhandStartedAt','swing','moveSpeed','speed','rootUntil','stunUntil','fearUntil','polyUntil','slowUntil','slow','movementSlows','cast','cooldowns','categoryCooldowns','globalCooldowns','equipment','learned','rules','strategyPolicy','autoBuffs','potions','selectedAmmoId','buffs','classBuffs','talentBuffs','auras','dots','hots','periodicClass','absorb','manaShield','seal','judgement','reactiveClass','weaponEnchants','weaponEnchant','talentProcs','racialEffects','racialBuff','cannibalize','bloodrage','totemWeaponEnchant','lightwell','totems','stats','soulShardCount','creatureType','entry','rank','visual','sourceGuid','attackPower','armor','resistances','equippable'];
const enemyKeys=['modelAnimation',...actorKeys,'minDamage','maxDamage','attackTime','spells','threat','smite','capturePhase','captureUntil'];
const combatKeys=['lootGold','area','ground','id','runId','routeId','encounterId','startedAt','endedAt','dungeon','pull','command','participantIds','metrics','projectiles','actorsSnapshot'];
const dungeonKeys=['id','runId','cursor','position','startedAt','completedAt','metrics'];
const activityKeys=['completed','remaining','type','reason','paused','stopQueued','to','from','startedAt','endsAt','target','quest','spell','mount','caster','targets','routeId','journeySession','auto','flight','stopAtNext'];

function copy(value: unknown): any {
  // Keep in-memory Worker snapshots identical to their JSON representation.
  if (value === 0) return 0;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(copy);
  const result:Record<string,unknown>={};
  for(const [key,nested] of Object.entries(value as Record<string,unknown>))if(nested!==undefined)result[key]=copy(nested);
  return result;
}
type Projectors = Record<string,(value:any)=>any>;
function pick(source:Record<string,unknown>,keys:readonly string[],projectors?:Projectors){
 const target:Record<string,unknown>={};
 for(const key of keys)if(Object.hasOwn(source,key)&&source[key]!==undefined)target[key]=projectors?.[key]?projectors[key](source[key]):copy(source[key]);
 return target;
}
const ruleView=(rule:any)=>({...pick(rule||{},['spell','condition','value','enabled','target','count','health','mana']),...(Array.isArray(rule?.and)?{and:rule.and.map((clause:any)=>pick(clause,['condition','value']))}:{})});
const profileView=(profile:any)=>({...pick(profile,['name','totalRules','unavailableRules']),rules:(profile.rules||[]).map(ruleView),policy:pick(profile.policy||{},policyKeys),autoBuffs:pick(profile.autoBuffs||{},autoBuffKeys),potions:pick(profile.potions||{},['enabled','health','mana','healthItem','manaItem'])});
const policyKeys=['role','target','healing','threat','protectCC','waitForTank','pullDelaySeconds'];
const autoBuffKeys=['enabled','armor','int','sta','targets','refreshSeconds'];
// Project narrowed fields directly: copying whole characters/encounters before
// replacing them duplicates work and traverses private runtime state needlessly.
const actorProjectors:Projectors={
 rules:rules=>Array.isArray(rules)?rules.map(ruleView):copy(rules),
 strategyPolicy:value=>value?pick(value,policyKeys):copy(value),
 autoBuffs:value=>value?pick(value,autoBuffKeys):copy(value),
 potions:value=>value?pick(value,['enabled','health','mana','healthItem','manaItem']):copy(value)
};
const actorView=(actor:any)=>pick(actor||{},actorKeys,actorProjectors);
const enemyView=(enemy:any)=>pick(enemy||{},enemyKeys);
const combatProjectors:Projectors={actorsSnapshot:actors=>Array.isArray(actors)?actors.map(actorView):copy(actors)};
function combatView(combat:any,actorId:string){if(!combat)return combat;const result=pick(combat,combatKeys,combatProjectors);if(combat.lootGoldByActor)result.lootGold=combat.lootGoldByActor[actorId]??0;result.enemies=Array.isArray(combat.enemies)?combat.enemies.map(enemyView):[];return result;}
const dungeonView=(dungeon:any)=>dungeon?pick(dungeon,dungeonKeys):dungeon;
const candidateView=(candidate:any)=>pick(candidate||{},['serverBuffs','id','name','classId','role','roles','level','gearCap','canRecruit']);
const battleUnitKeys=['quickCasts','queuedSpellId','id','spellId','className','color','portrait','mode','resource','secondaryResource','hp','maxHp','level','combo','effects','cooldowns','totems','cast','globalCooldown','canCommand','petMode','happiness','loyalty','controlled','ownerName','controlUntil','shards','attack','offhand','movement'];
function battlePresentationView(battle:any){
 if(!battle)return battle;
 const result=pick(battle,['live','clock','spellIds','playerId','groundEffects']);
 const units:Record<string,unknown>={};
 for(const [id,unit] of Object.entries(battle.units||{}))units[id]=pick(unit as Record<string,unknown>,battleUnitKeys);
 result.units=units;
 return result;
}

function activityView(activity:any){
 const result=pick(activity||{},activityKeys);
 if(activity?.type==='travel'&&Array.isArray(activity.path))result.path=activity.path.map((leg:any)=>pick(leg,['a','b','duration','distance','startProgress']));
 return result;
}
function escortView(escort:any){
 if(!escort)return copy(escort);
 const result=pick(escort,['id','questId','startedAt','waypoint','failed','completed']);
 if(escort.npc)result.npc=actorView(escort.npc);
 return result;
}
const strategyMemberView=(member:any)=>({id:member.id,name:member.name,classId:member.classId,role:member.role,presets:copy(member.presets||[]),strategyProfiles:(member.strategyProfiles||[]).map(profileView),rules:Array.isArray(member.rules)?member.rules.map(ruleView):[],policy:pick(member.policy||{},policyKeys),autoBuffs:pick(member.autoBuffs||{},autoBuffKeys),potions:pick(member.potions||{},['enabled','health','mana','healthItem','manaItem']),skills:copy(member.skills||[])});
const viewProjectors:Projectors={
 // Filter before copying the world quest catalog, not after cloning every row.
 quests:quests=>Array.isArray(quests)?quests.filter((q:any)=>q.active||q.canAccept||q.canTurnIn).map(copy):copy(quests),
 battleView:battle=>battle?battlePresentationView(battle):copy(battle),
 party:party=>Array.isArray(party)?party.map(actorView):copy(party),
 escortNpc:actor=>actor?actorView(actor):copy(actor),
 strategyMembers:members=>Array.isArray(members)?members.map(strategyMemberView):copy(members)
};
export function projectClientSnapshot(state:Record<string,unknown>,view:Record<string,unknown>,{instanceState=state}:{instanceState?:Record<string,unknown>}={}){
 if(!state||typeof state!=='object'||Array.isArray(state))throw new TypeError('state must be an object');
 if(!view||typeof view!=='object'||Array.isArray(view))throw new TypeError('view must be an object');
 const clientView=pick(view,viewKeys,viewProjectors);
 clientView.instanceScene=instancePresentation(instanceState);
 if(clientView.battleView&&((state as any).combat||(state as any).lastCombat)){
  (clientView.battleView as Record<string,unknown>).actors=combatMembers(state as any,(state as any).combat||(state as any).lastCombat).map(actorView);
 }
 if(Array.isArray((view as any).candidates))clientView.candidates=(view as any).candidates.map(candidateView);
 const player=pick(state,playerKeys,{
  activity:activityView,party:party=>Array.isArray(party)?party.map(actorView):[],
  pet:pet=>pet?actorView(pet):copy(pet),escort:escortView,
  combat:combat=>combatView(combat,(state as any).id),lastCombat:combat=>combatView(combat,(state as any).id),dungeon:dungeonView
 });
 player.battleHistory=((state as any).battleHistory||[]).map((entry:any)=>({battle:combatView(entry.battle,(state as any).id),location:copy(entry.location),view:battlePresentationView(entry.view),logs:copy(entry.logs)}));
 if(!Object.hasOwn(player,'activity'))player.activity=activityView(state.activity);
 if(!Object.hasOwn(player,'party'))player.party=[];
 return{player,view:clientView};
}

// The recorder must not clone inventories, trainers or old encounter histories
// on every simulation tick. Keep the same allowlists as live projection.
export function projectCombatPlayback(state:any,battle:any,wallAt:number){
 const player=pick(state,['id','clock','hp','mana','rage','energy','power','form','stance','cast','logs','logSequence']);
 player.wallAt=wallAt;
 player.combat=combatView(state.combat,state.id);
 player.lastCombat=combatView(state.lastCombat,state.id);
 player.party=(state.party||[]).map(actorView);
 if(state.pet)player.pet=actorView(state.pet);
 const projected=battlePresentationView(battle);
 if(projected)projected.actors=combatMembers(state,state.combat||state.lastCombat).map((actor:any)=>({...actorView(actor),...(!actor.petUnit&&!actor.escortNpc&&actor.classId?{characterAttributes:characterAttributes(actor)}:{})}));
 return {player,view:{battleView:projected}};
}

/** Live Worker projection. Attribute descriptions are metadata refreshed at most
 * once per simulation second; each actor is projected once and referenced by ID.
 * Historical playback keeps its independent complete snapshots above. */
export function createCombatFrameProjector(){
 let attributes=new Map<string,any>(),at=-Infinity,encounter:string|undefined;
 return (state:any,battle:any,wallAt:number,force=false)=>{
  if(force||state.combat?.id!==encounter||state.clock-at>=1000){
   attributes=new Map(combatMembers(state,state.combat||state.lastCombat).filter((a:any)=>!a.petUnit&&!a.escortNpc&&a.classId).map((a:any)=>[a.id,characterAttributes(a)]));at=state.clock;encounter=state.combat?.id;
  }
  const members=combatMembers(state,state.combat||state.lastCombat),owners=[state,...(state.party||[])];
  const actors=Object.fromEntries([...new Map([...owners,...members].map((a:any)=>[a.id,a])).values()].map((actor:any)=>[actor.id,{...actorView(actor),...(attributes.has(actor.id)?{characterAttributes:attributes.get(actor.id)}:{})}]));
  const player=pick(state,['id','clock','hp','mana','rage','energy','power','form','stance','cast','logSequence']);
  player.wallAt=wallAt;player.combat=combatView(state.combat,state.id);player.lastCombat=state.combat?null:combatView(state.lastCombat,state.id);
  player.party=(state.party||[]).map((a:any)=>a.id);if(state.pet)player.pet=actorView(state.pet);
  const projected=battlePresentationView(battle);if(projected)projected.actors=members.map((a:any)=>a.id);
  return {player,view:{battleView:projected},actors};
 };
}
