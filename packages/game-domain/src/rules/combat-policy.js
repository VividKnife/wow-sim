import {selectRacialReaction} from './class-mechanics.js';
import {combatInputReadyReason,inputWaiting} from './combat-input.js';
import {spellInfo} from './character.js';
import {spells} from './catalog.js';
import {stats} from './character.js';
import {combatMembers} from './combat-members.js';
import {combatRole} from './combat-roles.js';
import {executeCombatIntent} from './combat.js';
import {selectCombatPolicy} from './bot-strategies.js';

export const POLICY_INTERVAL=200, SPELL_QUEUE_WINDOW=300, POLICY_REACTION=100;
const hosts=new WeakMap();
export function setCombatPolicyHost(state,host){if(host)hosts.set(state,host);else hosts.delete(state);}
const phase=id=>[...String(id)].reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,0)%POLICY_INTERVAL;
export function policyState(s){return s.combat.policy??={version:2,observation:0,slots:{},timeline:[],receipts:[],metrics:{evaluations:0,requests:0,rejected:0,queued:0}};}
function slotFor(s,c){const p=policyState(s);return p.slots[c.id]??={controller:'local',generation:1,sequence:0,next:0,reaction:0,dirty:null,queued:null,inflight:null};}
export function grantCombatControl(s,actorId,controller){
 const c=combatMembers(s).find(a=>a.id===actorId);if(!c)throw new Error('Unknown controlled actor');
 const slot=slotFor(s,c);slot.controller=controller;slot.generation++;slot.sequence=0;slot.queued=null;slot.inflight=null;slot.next=s.clock;return slot.generation;
}
export function wakeCombatPolicy(s,ids,at=s.clock+POLICY_REACTION){
 if(!s.combat)return;
 const selected=new Set(ids);
 for(const c of combatMembers(s))if(selected.has(c.id))wakeActor(s,c,at);
}
function wakeActor(s,c,at){const slot=slotFor(s,c);slot.dirty=slot.dirty==null?at:Math.min(slot.dirty,at);}
// Changes are coalesced once per tick. Only healers and the affected actor wake
// on critical health; cast/death/focus changes wake actors targeting that enemy.
// Keep numeric observations in the checkpoint so adoption does not produce
// extra reactions. Reuse entries and debuff arrays; do not serialize the team
// or repeatedly derive every healer's role for each changed recipient.
export function observePolicyChanges(s,actors){
 const p=policyState(s);p.observation++;
 const observed=p.observed??={actors:{},enemies:{},focus:null,initialized:false};
 const at=s.clock+POLICY_REACTION,changedTargets=new Set();let wakeHealers=false,wakeAll=false;
 for(const c of actors){
  const old=observed.actors[c.id]??={critical:false,debuffs:[],seen:0};
  const critical=c.hp>0&&c.hp<stats(c).maxHp*.4;
  if(critical&&!old.critical){wakeActor(s,c,at);wakeHealers=true;}
  old.critical=critical;old.seen=p.observation;
  let count=0,changed=false;
  for(const aura of c.auras||[])if(!aura.positive&&(aura.dispel||spells[aura.spell]?.Dispel)){
   const previous=old.debuffs[count];
   if(!previous||previous.spell!==aura.spell||previous.until!==aura.until)changed=true;
   const effect=previous??(old.debuffs[count]={});effect.spell=aura.spell;effect.until=aura.until;count++;
  }
  if(count&& (changed||old.debuffs.length!==count))wakeHealers=true;
  old.debuffs.length=count;
 }
 const focus=s.combat.command?.focusId??null;
 for(const e of s.combat.enemies){
  // No cast has no timestamp. Zero is a real cast start and must translate
  // with the room clock; using it as absence creates false wakes on transfer.
  const old=observed.enemies[e.id],alive=e.hp>0,spell=e.cast?.spell||0,startedAt=e.cast?(e.cast.startedAt||0):null;
  if(!old||old.alive!==alive||old.spell!==spell||old.startedAt!==startedAt){
   if(e.cast)wakeAll=true;else changedTargets.add(e.id);
  }
  const entry=old??(observed.enemies[e.id]={});
  entry.alive=alive;entry.spell=spell;entry.startedAt=startedAt;entry.seen=p.observation;
 }
 if(!observed.initialized||observed.focus!==focus)wakeAll=true;
 observed.focus=focus;observed.initialized=true;
 // Summons and despawns cannot leave an ever-growing observation history.
 for(const id in observed.actors)if(observed.actors[id].seen!==p.observation)delete observed.actors[id];
 for(const id in observed.enemies)if(observed.enemies[id].seen!==p.observation)delete observed.enemies[id];
 for(const c of actors)if(wakeAll||changedTargets.has(c.target)||wakeHealers&&combatRole(c)==='healer')wakeActor(s,c,at);
}
export function receiveCombatIntent(s,envelope){
 const reject=reason=>({accepted:false,reason});
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||typeof envelope.actorId!=='string')return reject('format');
 if(!s.combat||envelope.encounterId!==s.combat.id)return reject('encounter');
 if(s.combat.command?.paused)return reject('paused');
 const c=combatMembers(s).find(a=>a.id===envelope.actorId);if(!c)return reject('actor');
 const p=s.combat.policy||{observation:0,slots:{}},slot=p.slots[c.id]||{controller:'local',generation:1,sequence:0,next:0,reaction:0,dirty:null,queued:null,inflight:null};
 if(envelope.controller!==slot.controller||envelope.generation!==slot.generation)return reject('controller');
 if(!Number.isSafeInteger(envelope.sequence)||envelope.sequence<=slot.sequence)return reject('sequence');
 if(!Number.isSafeInteger(envelope.observation)||envelope.observation<0||envelope.observation>p.observation)return reject('observation');
 if(!Number.isFinite(envelope.expiresAt)||envelope.expiresAt<s.clock||envelope.expiresAt>s.clock+2000)return reject('expired');
 if(!s.combat.policy){policyState(s);return receiveCombatIntent(s,envelope);}
 p.slots[c.id]=slot;slot.sequence=envelope.sequence;slot.inflight=null;
 const received={...envelope,receivedAt:s.clock};p.timeline.push(received);if(p.timeline.length>2048)p.timeline.shift();
 const intent=envelope.intent;
 let result;
 if(!intent)result={accepted:true,idle:true};
 else if(intent.kind==='cast'){
  const sp=spells[intent.spellId],ready=Math.max(c.cast?.until||0,c.nextAction||0,sp?.StartRecoveryCategory?c.globalCooldowns?.[sp.StartRecoveryCategory]||0:0);
  if(sp?.StartRecoveryTime>0&&ready>s.clock&&ready-s.clock<=SPELL_QUEUE_WINDOW){slot.queued={intent,expiresAt:s.clock+SPELL_QUEUE_WINDOW,manual:envelope.controller==='manual'};p.metrics.queued++;result={accepted:true,queued:true};}
  else result=executeCombatIntent(s,c,intent);
 }else result=executeCombatIntent(s,c,intent);
 if(!result.accepted)p.metrics.rejected++;
 p.receipts.push({actorId:c.id,sequence:envelope.sequence,at:s.clock,...result});if(p.receipts.length>128)p.receipts.shift();
 return result;
}
export function flushQueuedCombatIntent(s,c){
 const slot=slotFor(s,c),queued=slot.queued;if(!queued)return false;
 if(!queued.manual&&s.clock>queued.expiresAt){slot.queued=null;return false;}
 if(c.cast)return false;
 if(queued.manual){
  const sp=spellInfo(c,queued.intent.spellId);
  if(inputWaiting(s,c,sp))return false;
  const target=[...combatMembers(s),...s.combat.enemies].find(a=>a.id===queued.intent.targetId);
  const reason=combatInputReadyReason(s,c,sp,target);
  if(reason){slot.queued=null;policyState(s).receipts.push({actorId:c.id,at:s.clock,queued:true,accepted:false,reason});return false;}
 }
 const result=executeCombatIntent(s,c,queued.intent,{manual:queued.manual});
 if(result.reason==='timing')return false;
 slot.queued=null;
 policyState(s).receipts.push({actorId:c.id,at:s.clock,queued:true,...result});
 policyState(s).receipts=policyState(s).receipts.slice(-128);
 return result.accepted;
}
export function stepCombatPolicy(s,c){
 if(s.combat.policy?.replay)return;
 if(c.totemUnit||c.escortNpc)return;
 const p=policyState(s),slot=slotFor(s,c),host=hosts.get(s);
 if(slot.queued?.manual)return;
 const configVersion=c.strategyRevision||0;
 if(slot.configVersion!==configVersion){slot.configVersion=configVersion;slot.next=s.clock;slot.reaction=s.clock;slot.queued=null;}
 if(slot.inflight!=null&&s.clock-slot.inflight<500)return;
 if(slot.inflight!=null){grantCombatControl(s,c.id,'local');host?.timeout?.(c.id);}
 const urgent=slot.dirty!=null&&slot.dirty<=s.clock;
 const routine=s.clock>=slot.next,react=s.clock>=slot.reaction;
 if(!urgent&&!routine&&!react)return;
 const window=Math.max(c.cast?.until||0,c.nextAction||0,c.globalCooldowns?.[133]||0);
 const regular=routine&&window-s.clock<=SPELL_QUEUE_WINDOW;
 if(routine)slot.next=regular?s.clock+POLICY_INTERVAL:Math.max(s.clock+POLICY_INTERVAL,window-SPELL_QUEUE_WINDOW);
 if(regular&&slot.sequence===0)slot.next+=phase(c.id);
 slot.reaction=s.clock+POLICY_INTERVAL;
 if(urgent)slot.dirty=null;
 if(!regular&&!urgent&&!react)return;
 const request={actorId:c.id,encounterId:s.combat.id,controller:slot.controller,generation:slot.generation,sequence:slot.sequence+1,observation:p.observation,expiresAt:s.clock+500,regular,urgent};
 if(host&&host.available?.(s,c)!==false){
  if(slot.controller!=='worker')request.generation=grantCombatControl(s,c.id,'worker');
  request.controller='worker';request.sequence=slot.sequence+1;slot.inflight=s.clock;p.metrics.requests++;host.request(s,request);return;
 }
 if(slot.controller!=='local'){request.generation=grantCombatControl(s,c.id,'local');request.controller='local';request.sequence=1;}
 p.metrics.evaluations++;const intent=selectCombatPolicy(s,c,{regular,urgent}),racial=selectRacialReaction(s,c);
 if(racial){receiveCombatIntent(s,{...request,intent:racial});request.sequence++;}
 receiveCombatIntent(s,{...request,intent});
}

// Feed a recorded authoritative receive timeline into the same queue/executor.
// The caller advances settlement to each receivedAt with policy.replay enabled.
export function replayCombatIntent(s,record){
 if(s.clock!==record.receivedAt)throw new Error('Replay must advance to authoritative receive time');
 const c=combatMembers(s).find(a=>a.id===record.actorId);if(!c)throw new Error('Replay actor missing');
 const p=policyState(s),slot=slotFor(s,c);p.replay=true;
 slot.controller=record.controller;slot.generation=record.generation;
 p.observation=Math.max(p.observation,record.observation);
 return receiveCombatIntent(s,record);
}

export function invalidatePolicyIntents(s,ids){
 for(const c of combatMembers(s))if(ids.includes(c.id)){
  const slot=slotFor(s,c);slot.generation++;slot.sequence=0;slot.inflight=null;slot.queued=null;slot.next=s.clock;slot.reaction=s.clock;c.policyMovement=null;
 }
}
export function queueManualCombatIntent(s,c,intent){
 const sp=spells[intent.spellId],ready=Math.max(c.cast?.until||0,c.nextAction||0,sp?.StartRecoveryCategory?c.globalCooldowns?.[sp.StartRecoveryCategory]||0:0);
 if(ready<=s.clock)return false;
 invalidatePolicyIntents(s,[c.id]);slotFor(s,c).queued={intent,manual:true};return true;
}
