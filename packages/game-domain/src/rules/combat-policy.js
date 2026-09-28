import {selectRacialReaction} from './class-mechanics.js';
import {spells} from './catalog.js';
import {stats} from './character.js';
import {combatMembers} from './combat-members.js';
import {combatRole} from './combat-roles.js';
import {selectCombatPolicy,executeCombatIntent} from './combat.js';

export const POLICY_INTERVAL=200, SPELL_QUEUE_WINDOW=300, POLICY_REACTION=100;
const hosts=new WeakMap();
export function setCombatPolicyHost(state,host){if(host)hosts.set(state,host);else hosts.delete(state);}
const phase=id=>[...String(id)].reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,0)%POLICY_INTERVAL;
export function policyState(s){return s.combat.policy??={version:1,observation:0,slots:{},timeline:[],receipts:[],metrics:{evaluations:0,requests:0,rejected:0,queued:0}};}
function slotFor(s,c){const p=policyState(s);return p.slots[c.id]??={controller:'local',generation:1,sequence:0,next:0,reaction:0,dirty:null,queued:null,inflight:null};}
export function grantCombatControl(s,actorId,controller){
 const c=combatMembers(s).find(a=>a.id===actorId);if(!c)throw new Error('Unknown controlled actor');
 const slot=slotFor(s,c);slot.controller=controller;slot.generation++;slot.sequence=0;slot.queued=null;slot.inflight=null;slot.next=s.clock;return slot.generation;
}
export function wakeCombatPolicy(s,ids,at=s.clock+POLICY_REACTION){
 if(!s.combat)return;
 for(const c of combatMembers(s))if(ids.includes(c.id)){const slot=slotFor(s,c);slot.dirty=slot.dirty==null?at:Math.min(slot.dirty,at);}
}
// Changes are coalesced once per tick. Only healers and the affected actor wake
// on critical health; cast/death/focus changes wake actors targeting that enemy.
export function observePolicyChanges(s,actors){
 const p=policyState(s);p.observation++;
 const old=p.observed||{},next={};const wake=new Set();
 for(const c of actors){const critical=c.hp>0&&c.hp<stats(c).maxHp*.4;next[c.id]=critical?1:0;if(critical&&old[c.id]!==1){wake.add(c.id);for(const healer of actors)if(combatRole(healer)==='healer')wake.add(healer.id);}
  const debuffs=(c.auras||[]).filter(a=>!a.positive&&(a.dispel||spells[a.spell]?.Dispel)).map(a=>a.spell+':'+a.until).join(',');
  next['debuff:'+c.id]=debuffs;if(debuffs&&old['debuff:'+c.id]!==debuffs)for(const healer of actors)if(combatRole(healer)==='healer')wake.add(healer.id);
 }
 const focus=s.combat.command?.focusId??null;
 for(const e of s.combat.enemies){const key='enemy:'+e.id,value=`${e.hp>0}:${e.cast?.spell||0}:${e.cast?.startedAt||0}`;next[key]=value;if(old[key]!==value)for(const c of actors)if(c.target===e.id||e.cast)wake.add(c.id);}
 if(old.focus!==focus)for(const c of actors)wake.add(c.id);next.focus=focus;p.observed=next;
 wakeCombatPolicy(s,[...wake]);
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
 if(s.clock>queued.expiresAt){slot.queued=null;return false;}
 if(c.cast)return false;
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
 const config=JSON.stringify([c.rules,c.strategyPolicy,c.potions]);
 if(slot.config!==config){slot.config=config;slot.next=s.clock;slot.reaction=s.clock;slot.queued=null;}
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
 if(ready<=s.clock||ready-s.clock>SPELL_QUEUE_WINDOW)return false;
 invalidatePolicyIntents(s,[c.id]);slotFor(s,c).queued={intent,expiresAt:s.clock+SPELL_QUEUE_WINDOW,manual:true};return true;
}
