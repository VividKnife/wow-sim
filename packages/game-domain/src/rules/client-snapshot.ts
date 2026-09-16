import {combatMembers} from './combat-members.js';

const playerKeys = [
  'id','name','classId','raceId','level','xp','hp','mana','rage','energy','power','form','stance','money','clock','wallAt',
  'activity','rest','location','visited','flightPoints','hearth','hearthReady','equipment','bag','bags','pending','bank','bankUpgrades',
  'auctions','marketHistory','party','pet','escort','combat','lastCombat','dungeon','cast','groundEffects','learned','talents','quests',
  'completed','reputation','rules','settings','potions','mounts','riding','mounted','professions','professionCooldowns','resourceCooldowns',
  'logs','logSequence','totals','soulstone','bandageReady','nextPull'
] as const;

const viewKeys = [
  'battleView','reincarnation','canSoulstoneRevive','skillUsesByTarget','environment','trackingKind','trackedTreasures','lockpicking',
  'trackedTargets','scouting','lockTargets','petControls','classPortals','skillUses','itemUses','itemBuffs','professions','professionRecipeCount','canTrainProfession',
  'resources','disenchantable','className','raceName','faction','resource','raceTraits','talentTrees','talentResetCost','canResetTalents',
  'talentResetBlockedReason','bankCapacity','bankHere','bankUpgradeCost','inventoryActions','escort','escortNpc','hearthstone','mounts',
  'strategyMembers','journey','dungeon','recovery','combatSkills','candidates','party','nextXp','stats','location','map','monsters','quests',
  'questTools','shop','gatherables','bagCapacity','skills','talents','canTrain','hasFlight','city'
] as const;

const actorKeys=['id','name','classId','raceId','level','role','hp','mana','rage','energy','power','form','stance','position','positionY','maxHp','maxMana','spell','kind','petUnit','totemUnit','ownerId','controlledBy','controlUntil','removed','dead','fleeing','stealthed','happiness','loyalty','target','combo','comboTarget','nextSwing','swingStartedAt','nextAttack','nextRanged','rangedStartedAt','nextOffhand','offhandStartedAt','swing','moveSpeed','speed','rootUntil','stunUntil','fearUntil','polyUntil','slowUntil','slow','movementSlows','cast','cooldowns','globalCooldown','equipment','learned','rules','strategyPolicy','autoBuffs','potions','buffs','classBuffs','talentBuffs','auras','dots','hots','periodicClass','absorb','manaShield','seal','judgement','reactiveClass','weaponEnchants','weaponEnchant','talentProcs','racialEffects','racialBuff','cannibalize','bloodrage','totemWeaponEnchant','lightwell','totems','stats','soulShardCount','creatureType','entry','rank','visual','sourceGuid','attackPower','armor','resistances','equippable'];
const enemyKeys=[...actorKeys,'minDamage','maxDamage','attackTime','spells','threat','smite','capturePhase','captureUntil'];
const combatKeys=['id','runId','routeId','encounterId','startedAt','endedAt','dungeon','participantIds','metrics','projectiles','actorsSnapshot'];
const dungeonKeys=['id','runId','cursor','position','startedAt','completedAt','metrics'];
const activityKeys=['type','reason','to','from','startedAt','endsAt','target','quest','spell','caster','targets','routeId','auto','flight','stopAtNext'];

function copy(value: unknown): any {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(copy);
  const result:Record<string,unknown>={};
  for(const [key,nested] of Object.entries(value as Record<string,unknown>))if(nested!==undefined)result[key]=copy(nested);
  return result;
}
function pick(source:Record<string,unknown>,keys:readonly string[]){
 const target:Record<string,unknown>={};
 for(const key of keys)if(Object.hasOwn(source,key)&&source[key]!==undefined)target[key]=copy(source[key]);
 return target;
}
const ruleView=(rule:any)=>pick(rule||{},['spell','condition','value','enabled','target','count','health','mana']);
const policyKeys=['role','target','healing','threat','protectCC','waitForTank'];
const autoBuffKeys=['enabled','armor','int','sta','targets','refreshSeconds'];
const actorView=(actor:any)=>{const result=pick(actor||{},actorKeys);if(Array.isArray(actor?.rules))result.rules=actor.rules.map(ruleView);if(actor?.strategyPolicy)result.strategyPolicy=pick(actor.strategyPolicy,policyKeys);if(actor?.autoBuffs)result.autoBuffs=pick(actor.autoBuffs,autoBuffKeys);if(actor?.potions)result.potions=pick(actor.potions,['enabled','health','mana','healthItem','manaItem']);return result;};
const enemyView=(enemy:any)=>pick(enemy||{},enemyKeys);
function combatView(combat:any){if(!combat)return combat;const result=pick(combat,combatKeys);result.enemies=Array.isArray(combat.enemies)?combat.enemies.map(enemyView):[];if(Array.isArray(combat.actorsSnapshot))result.actorsSnapshot=combat.actorsSnapshot.map(actorView);return result;}
const dungeonView=(dungeon:any)=>dungeon?pick(dungeon,dungeonKeys):dungeon;
const candidateView=(candidate:any)=>pick(candidate||{},['id','name','classId','role','level','gearCap','canRecruit']);
const battleUnitKeys=['id','spellId','className','color','portrait','mode','resource','secondaryResource','hp','maxHp','level','combo','effects','cooldowns','totems','cast','globalCooldown','canCommand','petMode','happiness','loyalty','controlled','ownerName','controlUntil','shards','attack','offhand','movement'];
function battlePresentationView(battle:any){
 if(!battle)return battle;
 const result=pick(battle,['live','clock','spellIds','playerId','groundEffects']);
 const units:Record<string,unknown>={};
 for(const [id,unit] of Object.entries(battle.units||{}))units[id]=pick(unit as Record<string,unknown>,battleUnitKeys);
 result.units=units;
 return result;
}

export function projectClientSnapshot(state:Record<string,unknown>,view:Record<string,unknown>){
 if(!state||typeof state!=='object'||Array.isArray(state))throw new TypeError('state must be an object');
 if(!view||typeof view!=='object'||Array.isArray(view))throw new TypeError('view must be an object');
 const clientView=pick(view,viewKeys);
 if((view as any).battleView)clientView.battleView=battlePresentationView((view as any).battleView);
 if(Array.isArray((view as any).party))clientView.party=(view as any).party.map(actorView);
 if((view as any).escortNpc)clientView.escortNpc=actorView((view as any).escortNpc);
 if(Array.isArray((view as any).strategyMembers))clientView.strategyMembers=(view as any).strategyMembers.map((member:any)=>({id:member.id,name:member.name,classId:member.classId,rules:Array.isArray(member.rules)?member.rules.map(ruleView):[],policy:pick(member.policy||{},policyKeys),autoBuffs:pick(member.autoBuffs||{},autoBuffKeys),potions:pick(member.potions||{},['enabled','health','mana','healthItem','manaItem']),skills:copy(member.skills||[])}));
 if(clientView.battleView&&((state as any).combat||(state as any).lastCombat)){
  (clientView.battleView as Record<string,unknown>).actors=combatMembers(state as any,(state as any).combat||(state as any).lastCombat).map(actorView);
 }
 if(Array.isArray((view as any).candidates))clientView.candidates=(view as any).candidates.map(candidateView);
 const player=pick(state,playerKeys);
 player.activity=pick((state as any).activity||{},activityKeys);
 if((state as any).activity?.type==='travel'&&Array.isArray((state as any).activity.path))(player.activity as Record<string,unknown>).path=(state as any).activity.path.map((leg:any)=>pick(leg,['a','b','duration','distance','startProgress']));
 player.party=Array.isArray((state as any).party)?(state as any).party.map(actorView):[];
 if((state as any).pet)player.pet=actorView((state as any).pet);
 if((state as any).escort){player.escort=pick((state as any).escort,['id','questId','startedAt','waypoint','failed','completed']);if((state as any).escort.npc)(player.escort as Record<string,unknown>).npc=actorView((state as any).escort.npc);}
 if((state as any).combat)player.combat=combatView((state as any).combat);
 if((state as any).lastCombat)player.lastCombat=combatView((state as any).lastCombat);
 if((state as any).dungeon)player.dungeon=dungeonView((state as any).dungeon);
 return{player,view:clientView};
}
