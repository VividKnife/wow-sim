import test from 'node:test';
import assert from 'node:assert/strict';
import {stats} from '../src/rules/character.js';
import {combatMembers} from '../src/rules/combat-members.js';
import {observePolicyChanges,policyState} from '../src/rules/combat-policy.js';
import {referenceObservation,observationFixture} from './support/policy-observation.mjs';

test('40-person observations preserve reaction deadlines through health, dispel, cast, role and focus changes and restore',()=>{
 let current=observationFixture(),reference=structuredClone(current);
 for(let tick=0;tick<320;tick++){
  for(const s of [current,reference]){
   s.clock=tick*100;
   const actors=combatMembers(s),actor=actors[tick%actors.length],enemy=s.combat.enemies[tick%8];
   // Include multiple changes in one observation, not only single-unit hits.
   if(tick%11===0)for(const c of actors)c.hp=tick%22===0?1:stats(c).maxHp;
   switch(tick%10){
    case 0:actor.auras.push({spell:16403,dispel:1,until:s.clock+5000});break;
    case 1:for(const a of actor.auras)a.until+=1000;break;
    case 2:actor.auras.splice(0,1);break;
    case 3:actor.auras=[];break;
    case 4:enemy.cast={spell:133,startedAt:s.clock};break;
    case 5:enemy.cast=null;enemy.hp=0;break;
    case 6:enemy.hp=1000;actor.target=enemy.id;break;
    case 7:s.combat.command={focusId:enemy.id};break;
    case 8:actor.strategyPolicy={role:'healer'};actor.form='bear';break;
    case 9:delete actor.strategyPolicy;delete s.combat.command;break;
   }
   // Some earlier wakes remain pending. A later observation must not delay them.
   for(const slot of Object.values(policyState(s).slots))if(slot.dirty!==null&&slot.dirty<s.clock-100)slot.dirty=null;
  }
  observePolicyChanges(current,combatMembers(current));referenceObservation(reference,combatMembers(reference));
  assert.deepEqual(current.combat.policy.slots,reference.combat.policy.slots,'tick '+tick);
  assert.equal(current.combat.policy.observation,reference.combat.policy.observation);
  assert.equal(current.rngState,12345);
  if(tick%37===0){current=JSON.parse(JSON.stringify(current));reference=JSON.parse(JSON.stringify(reference));}
 }
});

test('unchanged observations reuse records, debounce urgent wakes and prune departed entities',()=>{
 const s=observationFixture();observePolicyChanges(s,combatMembers(s));
 const observed=s.combat.policy.observed,entry=observed.actors[s.id],debuffs=entry.debuffs,enemy=observed.enemies['enemy:0'];
 for(const slot of Object.values(s.combat.policy.slots))slot.dirty=null;
 for(let i=0;i<100;i++){s.clock+=100;observePolicyChanges(s,combatMembers(s));}
 assert.equal(s.combat.policy.observed,observed);assert.equal(observed.actors[s.id],entry);
 assert.equal(entry.debuffs,debuffs);assert.equal(observed.enemies['enemy:0'],enemy);
 assert.ok(Object.values(s.combat.policy.slots).every(slot=>slot.dirty===null));
 const departed=s.party.pop(),gone=s.combat.enemies.pop();
 observePolicyChanges(s,combatMembers(s));assert.equal(observed.actors[departed.id],undefined);assert.equal(observed.enemies[gone.id],undefined);
 s.party.push(departed);departed.hp=1;
 observePolicyChanges(s,combatMembers(s));assert.equal(s.combat.policy.slots[departed.id].dirty,s.clock+100);
});

test('a restored unchanged observation does not wake healers again and role changes are effective immediately',()=>{
 let s=observationFixture(5);s.party[0].auras=[{spell:16403,dispel:1,until:5000}];
 observePolicyChanges(s,combatMembers(s));
 for(const slot of Object.values(s.combat.policy.slots))slot.dirty=null;
 s=JSON.parse(JSON.stringify(s));s.clock=100;observePolicyChanges(s,combatMembers(s));
 assert.ok(Object.values(s.combat.policy.slots).every(slot=>slot.dirty===null));
 s.strategyPolicy={role:'healer'};s.party[0].auras[0].until=6000;
 observePolicyChanges(s,combatMembers(s));assert.equal(s.combat.policy.slots[s.id].dirty,200);
});

test('dispel observations distinguish refresh, partial removal, complete removal and reapplication',()=>{
 const s=observationFixture(5),healer=s.party[0],recipient=s.party[2];
 observePolicyChanges(s,combatMembers(s));
 const changes=[
  [[{spell:16403,dispel:1,until:5000},{spell:16403,dispel:1,until:6000}],true],
  [[{spell:16403,dispel:1,until:5000},{spell:16403,dispel:1,until:6000}],false],
  [[{spell:16403,dispel:1,until:5000}],true],
  [[{spell:16403,dispel:1,until:7000}],true],
  [[],false],
  [[{spell:16403,dispel:1,until:7000}],true],
  [[{spell:16403,dispel:1,until:7000},{spell:139,positive:true,until:8000}],false],
 ];
 for(const [auras,expected]of changes){
  for(const slot of Object.values(s.combat.policy.slots))slot.dirty=null;
  recipient.auras=auras;s.clock+=100;observePolicyChanges(s,combatMembers(s));
  assert.equal(s.combat.policy.slots[healer.id].dirty,expected?s.clock+100:null);
  assert.equal(s.combat.policy.slots[recipient.id].dirty,null);
 }
});
