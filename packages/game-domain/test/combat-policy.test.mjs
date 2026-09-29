import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advanceOwned} from '../src/rules/engine.js';
import {startCombat,combatTick,selectCombatPolicy,executeCombatIntent} from '../src/rules/combat.js';
import {newCharacter} from '../src/rules/character.js';
import {policyState,receiveCombatIntent,grantCombatControl,wakeCombatPolicy,stepCombatPolicy,replayCombatIntent,flushQueuedCombatIntent} from '../src/rules/combat-policy.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';
function fixture(classId=8,id=133){
 const s=createGame('Policy',717,0,{classId,raceId:classId===3?3:classId===7?2:classId===11?4:1});s.level=60;s.learned.push(id);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rage=1000;s.energy=100;if(classId===2)s.hp=Math.floor(s.hp*.4);s.rules=[{spell:id,enabled:true,condition:'always',value:0}];s.strategyPolicy={waitForTank:false};
 startCombat(s,[636],true);delete s.combat.pull;s.position=0;s.positionY=0;s.nextSwing=999999;
 const e=s.combat.enemies[0];Object.assign(e,{hp:1000000,maxHp:1000000,position:3,positionY:0,nextAttack:999999,nextSpell:999999,rootUntil:999999});
 return s;
}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function envelope(s,intent,sequence=1){policyState(s);return {encounterId:s.combat.id,actorId:s.id,controller:'local',generation:1,sequence,observation:s.combat.policy.observation,expiresAt:s.clock+500,intent};}
for(const [classId,id]of [[1,7386],[2,635],[3,2973],[4,1752],[5,585],[7,403],[8,133],[9,686],[11,5176]])test(`class ${classId} policy is read-only and identical on a permitted observation`,()=>{
 const s=fixture(classId,id);const observation=projectCombatObservation(s),before=structuredClone(s);
 const a=selectCombatPolicy(freeze(s),s),b=selectCombatPolicy(freeze(observation),observation);
 assert.deepEqual(s,before);assert.deepEqual(b,a);assert.ok(a);
});
test('all rejected stale, duplicate, unauthorized and malformed actions preserve authoritative gameplay',()=>{
 const s=fixture(),intent={kind:'cast',spellId:133,targetId:s.combat.enemies[0].id},base=envelope(s,intent);
 for(const bad of [{...base,encounterId:'old'},{...base,generation:0},{...base,controller:'other'},{...base,sequence:0},{...base,observation:9999},{...base,expiresAt:-1}]){const before=structuredClone(s);assert.equal(receiveCombatIntent(s,bad).accepted,false);assert.deepEqual(s,before);}
 for(const bad of [{kind:'cast',spellId:999999,targetId:s.id},{kind:'cast',spellId:133,targetId:s.id},{kind:'move',mode:'toward',targetId:s.id,range:NaN}]){const before=structuredClone(s);assert.equal(executeCombatIntent(s,s,bad).accepted,false);assert.deepEqual(s,before);}
 assert.equal(receiveCombatIntent(s,base).accepted,true);const after=structuredClone(s);assert.equal(receiveCombatIntent(s,base).reason,'sequence');assert.deepEqual(s,after);
});
test('worker observations preserve charm allegiance and choose the same hostile target as local policy',()=>{
 const s=fixture(),charmed=s.combat.enemies[0];
 charmed.rootUntil=0;
 const hostile={...structuredClone(charmed),id:'enemy-1'};s.combat.enemies.push(hostile);
 charmed.controlledBy=s.id;charmed.controlUntil=10000;
 const observation=projectCombatObservation(s);
 assert.equal(observation.combat.enemies[0].controlledBy,s.id);
 assert.equal(observation.combat.enemies[0].controlUntil,10000);
 const local=selectCombatPolicy(s,s),worker=selectCombatPolicy(observation,observation);
 assert.equal(local.kind,'cast');assert.equal(local.targetId,hostile.id);assert.deepEqual(worker,local);
 assert.equal(executeCombatIntent(s,s,worker).accepted,true);
});
test('authority rejects stale attacks and casts when the observed enemy becomes charmed',()=>{
 for(const kind of ['attack','cast']){
  const s=fixture();s.combat.enemies[0].rootUntil=0;const observation=projectCombatObservation(s);
  const intent=kind==='cast'?selectCombatPolicy(observation,observation):{kind,targetId:observation.combat.enemies[0].id};
  assert.equal(intent.kind,kind);
  const target=s.combat.enemies[0];target.controlledBy=s.id;target.controlUntil=10000;
  const before=structuredClone(s);
  assert.deepEqual(executeCombatIntent(s,s,intent),{accepted:false,reason:'target-kind'});
  assert.deepEqual(s,before);
  delete target.controlledBy;target.controlUntil=0;
  assert.equal(executeCombatIntent(s,s,intent).accepted,true);
 }
});
test('queued spells revalidate charm allegiance before spending resources or starting a cast',()=>{
 const s=fixture(),target=s.combat.enemies[0];s.globalCooldowns={133:300};
 assert.equal(receiveCombatIntent(s,envelope(s,{kind:'cast',spellId:133,targetId:target.id})).queued,true);
 target.controlledBy=s.id;target.controlUntil=10000;s.clock=300;
 const mana=s.mana,hp=target.hp;
 assert.equal(flushQueuedCombatIntent(s,s),false);
 assert.equal(s.cast,null);assert.equal(s.mana,mana);assert.equal(target.hp,hp);
 assert.equal(policyState(s).slots[s.id].queued,null);
 assert.equal(policyState(s).receipts.at(-1).reason,'target-kind');
});
test('control handoff fences old worker output and preserves the earliest wake deadline',()=>{
 const s=fixture();const old=envelope(s,null);assert.equal(grantCombatControl(s,s.id,'leader'),2);assert.equal(receiveCombatIntent(s,old).reason,'controller');
 wakeCombatPolicy(s,[s.id],100);wakeCombatPolicy(s,[s.id],200);wakeCombatPolicy(s,[s.id],150);assert.equal(policyState(s).slots[s.id].dirty,100);
});
test('short spell queue starts at GCD release and revalidates resource loss',()=>{
 for(const resourceLoss of [false,true]){
  const s=fixture();s.rules=[];s.globalCooldowns={133:300};const input=envelope(s,{kind:'cast',spellId:133,targetId:s.combat.enemies[0].id});
  assert.equal(receiveCombatIntent(s,input).queued,true);assert.equal(s.cast,null);
  // Replay disables policy generation but continues every settlement tick.
  policyState(s).replay=true;if(resourceLoss)s.mana=0;
  s.clock=200;combatTick(s);assert.equal(s.cast,null);
  s.clock=300;combatTick(s);assert.equal(!!s.cast,!resourceLoss);if(s.cast)assert.equal(s.cast.startedAt,300);
 }
});
test('GCD sleeping does not suppress off-GCD reactions or pause accepted casts',()=>{
 const s=fixture();s.learned.push(2139);const enemy=s.combat.enemies[0];enemy.cast={spell:133,startedAt:0,until:5000};
 s.rules=[{spell:2139,enabled:true,condition:'targetCasting',value:0}];s.globalCooldowns={133:1500};
 combatTick(s);assert.equal(enemy.cast,null);assert.equal(s.combat.casts,1);
});
test('policy cadence is bounded and does not consume the combat RNG for idle decisions',()=>{
 const s=fixture();s.rules=[];const rng=s.rngState;
 for(s.clock=0;s.clock<10000;s.clock+=100)stepCombatPolicy(s,s);
 assert.ok(policyState(s).metrics.evaluations<=51);assert.equal(s.rngState,rng);
});
test('policy observation excludes inventory, history and hidden encounter plans',()=>{
 const s=fixture();s.bag=[{id:118,count:2,uid:'secret'}];s.combat.pendingSpawns=[{secret:'future'}];s.combat.raidEncounter={command:{healingMode:'conserve',secret:'boss-plan'}};
 const o=projectCombatObservation(s);assert.equal(o.bag,undefined);assert.equal(o.logs,undefined);assert.equal(o.rngState,undefined);assert.equal(o.combat.pendingSpawns,undefined);assert.deepEqual(o.combat.raidEncounter,{command:{healingMode:'conserve'}});assert.equal(o.inventoryCounts[118],2);assert.ok(!JSON.stringify(o).includes('secret'));
});
test('a normalized received input stream settles identically across coarse and fine replay',()=>{
 const initial=fixture();initial.rules=[];
 const first=envelope(initial,{kind:'cast',spellId:133,targetId:initial.combat.enemies[0].id});first.receivedAt=100;first.expiresAt=600;
 const cancel={...first,sequence:2,receivedAt:700,expiresAt:1200,intent:{kind:'cancel',spellId:133,startedAt:100}};
 function run(step){const s=structuredClone(initial);policyState(s).replay=true;for(const row of [first,cancel]){while(s.clock<row.receivedAt)advanceOwned(s,Math.min(row.receivedAt,s.wallAt+step));assert.equal(replayCombatIntent(s,row).accepted,true);}while(s.clock<3000)advanceOwned(s,Math.min(3000,s.wallAt+step));return s;}
 assert.deepEqual(run(1000),run(25));
});

test('manual casts have a 300ms replaceable queue and stop-cast fences late policy replies',async()=>{
 const {commandCombatCast}=await import('../src/rules/combat.js');
 const {combatCommandAction}=await import('../src/rules/combat-command.js');
 const s=fixture();s.globalCooldowns={133:300};const old=envelope(s,{kind:'cast',spellId:133,targetId:s.combat.enemies[0].id});
 commandCombatCast(s,s,133,s.combat.enemies[0].id);assert.equal(policyState(s).slots[s.id].queued.manual,true);
 assert.equal(receiveCombatIntent(s,old).reason,'controller');
 s.clock=300;combatTick(s);assert.equal(s.cast.startedAt,300);assert.equal(s.cast.commanded,true);
 combatCommandAction(s,{order:'stopCast',encounterId:s.combat.id,memberId:s.id});assert.equal(s.cast,null);assert.equal(policyState(s).slots[s.id].queued,null);
 const t=fixture();t.globalCooldowns={133:301};const before=structuredClone(t);assert.throws(()=>commandCombatCast(t,t,133,t.combat.enemies[0].id));assert.deepEqual(t,before);
});

test('accepted policy damage continues through projectile settlement in a recorded replay',()=>{
 const initial=fixture();initial.rules=[];const targetId=initial.combat.enemies[0].id;
 const records=[{...envelope(initial,{kind:'cast',spellId:133,targetId}),receivedAt:100,expiresAt:600},{...envelope(initial,{kind:'cast',spellId:133,targetId},2),receivedAt:3500,expiresAt:4000}];
 function run(step){const s=structuredClone(initial);policyState(s).replay=true;for(const record of records){while(s.wallAt<record.receivedAt)advanceOwned(s,Math.min(record.receivedAt,s.wallAt+step));assert.ok(replayCombatIntent(s,record).accepted);}while(s.wallAt<8000)advanceOwned(s,Math.min(8000,s.wallAt+step));return s;}
 const a=run(1000),b=run(25);assert.deepEqual(a,b);assert.ok(a.logs.some(l=>l.kind==='damage'&&l.actorId===a.id));
});

test('pause rejects late policy output without mutation and resume fences the old generation',async()=>{
 const {combatCommandAction}=await import('../src/rules/combat-command.js');
 const s=fixture(),intent={kind:'cast',spellId:133,targetId:s.combat.enemies[0].id},old=envelope(s,intent);
 combatCommandAction(s,{order:'pause',encounterId:s.combat.id});
 const paused=structuredClone(s);
 assert.equal(receiveCombatIntent(s,old).reason,'paused');
 assert.equal(executeCombatIntent(s,s,intent).reason,'paused');
 assert.deepEqual(s,paused);
 combatCommandAction(s,{order:'resume',encounterId:s.combat.id});
 assert.equal(receiveCombatIntent(s,old).reason,'controller');
 assert.equal(s.cast,null);
});
