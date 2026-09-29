import {combatMembers} from './combat-members.js';
import {potions} from './profession-data.js';
import {spells} from './catalog.js';

// Explicit observable fields. No logs, loot, bags, economy, saved encounters,
// future spawns, boss scripts or encounter plans cross the policy boundary.
const actorFields=`id mode targetId racialReady classId raceId level role hp mana rage energy focus power time position positionY maxHp maxMana target combo comboTarget nextAction nextSwing nextRanged nextOffhand cast cooldowns categoryCooldowns globalCooldowns form stance learned talents buffs classBuffs itemBuffs talentBuffs auras dots hots periodicClass absorb manaShield seal judgement reactiveClass weaponEnchants weaponEnchant talentProcs racialEffects racialBuff cannibalize bloodrage totemWeaponEnchant lightwell rootUntil stunUntil fearUntil polyUntil slowUntil slow movementSlows moveSpeed speed sprintUntil silenceUntil schoolLockouts weakenedSoulUntil stealthed invisible combatFacing combatMotion castRangeFailure fade feignUntil feignResisted parryUntil dodgeUntil revengeUntil overpowerUntil inCombat pvp teamId arenaTargetId arenaControlSpell arenaControlTarget arenaInterruptSpell arenaInterruptTarget arenaRetreatTarget arenaWaitingBurst arenaBurstSpells raidTargetId raidReservedSpells partyBlessingPrepared hunterPet petUnit totemUnit escortNpc ownerId kind spell entry armor attackPower resistances creatureType rank capturePhase captureUntil controlledBy controlUntil removed dead airborne tauntedBy tauntUntil sunder threat trap thorns enrage vampiricEmbrace environment classDetection potionReady npcPlayer ammunition`.split(' ');
const ownedFields=['rules','strategyPolicy','potions'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
function actorView(actor,owned){
 const result=pick(actor,actorFields);
 result.equipment=Object.fromEntries(Object.entries(actor.equipment||{}).map(([slot,item])=>[slot,pick(item,['id','enchant','durability'])]));
 if(owned){Object.assign(result,pick(actor,ownedFields));
  const needed=new Set(Object.keys(potions).map(Number));for(const id of actor.learned||[])for(let n=1;n<=8;n++)if(spells[id]?.['Reagent'+n]>0)needed.add(spells[id]['Reagent'+n]);
  result.inventoryCounts={};for(const item of actor.bag||[])if(needed.has(item.id)&&!item.locked&&!item.issued)result.inventoryCounts[item.id]=(result.inventoryCounts[item.id]||0)+item.count;
 }
 if(actor.pet)result.pet=actorView(actor.pet,false);
 if(actor.totems)result.totems=Object.fromEntries(Object.entries(actor.totems).map(([key,t])=>[key,{...pick(t,actorFields),...pick(t,['name','until','next','effects','totemUnit'])}]));
 return result;
}
export function projectCombatObservation(s,controlledIds=combatMembers(s).filter(c=>!c.petUnit&&!c.totemUnit&&!c.escortNpc).map(c=>c.id)){
 if(!s.combat)return null;
 const owned=new Set(controlledIds),members=combatMembers(s),p=s.combat.policy||{observation:0};
 const result={...actorView(s,owned.has(s.id)),clock:s.clock,version:1,observation:p.observation,
  party:(s.party||[]).map(c=>actorView(c,owned.has(c.id))),
  combat:{...pick(s.combat,['id','startedAt','pvp','area','pull','participantIds','controlTargetId','stealthUsers','engagedMemberIds']),
   command:s.combat.command?pick(s.combat.command,['focusId','holdFire','orders','mode','memberModes']):null,
   enemies:s.combat.enemies.map(e=>actorView(e,false)),
   ...(s.combat.raidEncounter?{raidEncounter:{command:s.combat.raidEncounter.command?pick(s.combat.raidEncounter.command,['healingMode']):null}}:{})},
  groundEffects:(s.groundEffects||[]).map(e=>pick(e,['caster','spell','until','radius','position','positionY'])),
 };
 if(s.arenaActors)result.arenaActors=members.map(c=>actorView(c,owned.has(c.id)));
 if(s.escort?.npc)result.escort={npc:actorView(s.escort.npc,false)};
 return structuredClone(result);
}
