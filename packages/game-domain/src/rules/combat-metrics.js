import {finishJourneyBattle} from './journey.js';
import {battlePresentation} from './battle-presentation.js';
import {nodes} from './catalog.js';
import {stats} from './character.js';
// Authoritative counters, independent of the bounded presentation event log.
import {combatMembers} from './combat-members.js';
const fields=['damage','healing','hits','crits','periodicDamage','periodicHits','healHits','healCrits'];
const counters=()=>Object.fromEntries(fields.map(key=>[key,0]));
const finite=value=>Number.isFinite(value)?value:0;
function actorRow(metrics,actor){
 const id=String(actor.id);
 return metrics.actors[id]??=({actorId:id,name:actor.name||id,classId:actor.classId||0,...counters(),spells:{}});
}
export function initializeMetrics(s){
 const battle=s.combat;if(!battle)return null;
 battle.metrics??={version:1,actors:{},startedAt:s.clock,partial:battle.startedAt<s.clock};
 for(const actor of combatMembers(s,battle))actorRow(battle.metrics,actor);
 return battle.metrics;
}

// Normally called before changing HP. Callers that have already capped and
// applied the amount must explicitly pass effective:true.
export function recordMetric(s,actor,target,amount,detail={}){
 if(!s.combat||s.combat.endedAt!=null||!actor?.id)return 0;
 const healing=detail.kind==='healing',requested=Math.max(0,finite(amount));
 const available=healing?Math.max(0,finite(target?.maxHp)-finite(target?.hp)):Math.max(0,finite(detail.availableHp??target?.hp));
 const effective=detail.effective?requested:Math.min(requested,available);
 if(effective<=0)return 0;
 const metrics=initializeMetrics(s),row=actorRow(metrics,actor),spellId=detail.spellId??0;
 const spell=row.spells[String(spellId)]??=({spellId,label:detail.label||(spellId===0?'近战攻击':String(spellId)),...counters()});
 for(const entry of [row,spell]){
  if(healing){entry.healing+=effective;entry.healHits++;if(detail.critical)entry.healCrits++;}
  else{entry.damage+=effective;entry.hits++;if(detail.critical)entry.crits++;if(detail.periodic){entry.periodicDamage+=effective;entry.periodicHits++;}}
 }
 return effective;
}

function mergeActors(destination,source){
 for(const row of Object.values(source.actors)){
  const merged=actorRow(destination,{id:row.actorId,name:row.name,classId:row.classId});
  for(const key of fields)merged[key]+=finite(row[key]);
  for(const spell of Object.values(row.spells)){
   const current=merged.spells[String(spell.spellId)]??={spellId:spell.spellId,label:spell.label,...counters()};
   for(const key of fields)current[key]+=finite(spell[key]);
  }
 }
}

export function finishCombat(s){
 const battle=s.combat;if(!battle)return null;
 battle.endedAt??=s.clock;
 const actors=combatMembers(s,battle);
 for(const actor of [...actors,...(battle.enemies||[])])actor.cast=null;
 battle.projectiles=[];
 s.groundEffects=(s.groundEffects||[]).filter(area=>area.side!=='friendly');
 const snapshotFields=['bloodrage','totemWeaponEnchant','judgement','talentProcs','talentBuffs','racialEffects','racialBuff','cannibalize','lightwell','spell','until','petUnit','totemUnit','ownerId','kind','form','stance','focus','combo','comboTarget','classBuffs','buffs','dots','hots','periodicClass','absorb','manaShield','seal','reactiveClass','soulstone','weaponEnchants','weaponEnchant','equipment','totems','cooldowns','learned','globalCooldowns','categoryCooldowns','stealthed','weakenedSoulUntil','sprintUntil','innervateUntil','hawkHasteUntil','feignUntil','mode','loyalty','happiness','nextRanged','rangedStartedAt','nextOffhand','offhandStartedAt','escortNpc','entry','modelId','creatureType','family','id','name','classId','level','hp','mana','energy','rage','position','positionY','moveSpeed','nextSwing','swingStartedAt','auras','rootUntil','slowUntil','slow','movementSlows','stunUntil','polyUntil'];
 battle.actorsSnapshot??=JSON.parse(JSON.stringify(actors.map(actor=>{
  const derived=stats(actor);
  return {...Object.fromEntries(snapshotFields.map(key=>[key,actor[key]])),cast:null,stats:derived,
   soulShardCount:actor.id===s.id?s.bag.filter(i=>i.id===6265).reduce((n,i)=>n+i.count,0):0,
   maxHp:actor.currentMaxHp??actor.maxHp??derived.maxHp,maxMana:actor.currentMaxMana??actor.maxMana??derived.maxMana};
 })));
 if(!battle.endLogged){
  s.logs??=[];s.logSequence=(s.logSequence||0)+1;
  s.logs.push({id:s.logSequence,encounterId:battle.id??null,at:battle.endedAt,text:'战斗结束',kind:'combat-end'});
  if(s.logs.length>140)s.logs.splice(0,s.logs.length-140);
  battle.endLogged=true;
 }
 const dungeon=s.dungeon;
 if(battle.metrics&&battle.dungeon&&dungeon&&battle.runId===dungeon.runId&&!battle.metricsAggregated){
  if(dungeon.metrics?.runId!==dungeon.runId)dungeon.metrics={version:1,runId:dungeon.runId,actors:{},durationMs:0,segments:0};
  mergeActors(dungeon.metrics,battle.metrics);
  dungeon.metrics.durationMs+=Math.max(0,finite(battle.endedAt)-finite(battle.metrics.startedAt??battle.startedAt));
  dungeon.metrics.partial=!!(dungeon.metrics.partial||battle.metrics.partial);
  dungeon.metrics.segments++;battle.metricsAggregated=true;
 }
 s.lastCombat=battle;s.combat=null;
 finishJourneyBattle(s,battle);
 s.battleHistory??=[];
 if(battle.journeyId)s.battleHistory.push(JSON.parse(JSON.stringify({battle,location:nodes[s.location],view:battlePresentation(s),logs:s.logs.filter(event=>event.encounterId===battle.id)})));
 if(s.battleHistory.length>20)s.battleHistory.splice(0,s.battleHistory.length-20);
 return battle;
}

