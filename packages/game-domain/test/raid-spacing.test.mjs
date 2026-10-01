import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advanceOwned} from '../src/rules/engine.js';
import {newCharacter} from '../src/rules/character.js';
import {startCombat} from '../src/rules/combat.js';
import {positionPartyMember} from '../src/rules/combat-positioning.js';
import {selectCombatPolicy} from '../src/rules/bot-strategies.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';
import {distance} from '../../sim-core/src/geometry.js';

function fixture(classId=8){
 const s=createGame('分散队员',281,0,{classId,raceId:1});s.id='mage';
 const ally=newCharacter('附近队友',8,60,1);ally.id='ally';s.party=[ally];
 startCombat(s,[636],true);delete s.combat.pull;
 for(const c of [s,ally])Object.assign(c,{hp:stats(c).maxHp,mana:stats(c).maxMana,position:10,positionY:8,rules:[],strategyPolicy:{waitForTank:false}});
 const enemy=s.combat.enemies[0];Object.assign(enemy,{position:30,positionY:0,target:'outside',nextAttack:999999});
 s.target=enemy.id;s.raidTargetId=enemy.id;s.combat.raidEncounter={command:{formation:'spread',healingMode:'normal'}};
 return {s,ally,enemy};
}

test('spread order separates backline using ordinary bounded movement and visible observations',()=>{
 const {s,ally,enemy}=fixture(),before=structuredClone(s);
 const intent=selectCombatPolicy(s,s),o=projectCombatObservation(s);
 assert.equal(intent.kind,'move');assert.deepEqual(selectCombatPolicy(o,o),intent);assert.deepEqual(s,before);
 for(let tick=0;tick<20;tick++){
  const p={position:s.position,positionY:s.positionY};s.clock+=100;positionPartyMember(s,s);
  assert.ok(distance(p,s)<=.70000001);assert.ok(distance(s,enemy)<=25.00000001);
 }
 assert.ok(distance(s,ally)>=5.5);
 assert.equal(positionPartyMember(s,s),false,'sufficiently spaced units hold position');
});

test('compact formation, casting and roots do not cause spacing movement',()=>{
 const {s}=fixture();s.combat.raidEncounter.command.formation='compact';assert.equal(positionPartyMember(s,s),false);
 s.combat.raidEncounter.command.formation='spread';s.cast={spell:133,until:1000};assert.equal(positionPartyMember(s,s),false);
 s.cast=null;s.rootUntil=1000;assert.equal(positionPartyMember(s,s),false);
});

test('healers prioritize critical allies over ordinary spacing',()=>{
 const {s,ally}=fixture();s.strategyPolicy.role='healer';ally.hp=1;
 const before={x:s.position,y:s.positionY};assert.equal(positionPartyMember(s,s),false);
 assert.deepEqual({x:s.position,y:s.positionY},before);
});

test('spacing observations include visible terrain but exclude future encounter hazards',()=>{
 const {s}=fixture();Object.assign(s.combat.raidEncounter,{tactics:{avoidFire:true},nextSpecial:987654,
  fires:[{terrain:true,startedAt:0,until:10000,center:{x:11,y:8},radius:.5},
   {terrain:true,startedAt:5000,until:10000,center:{x:5,y:8},radius:3},
   {startedAt:0,until:10000,center:{x:15,y:8},radius:3,label:'secret-script'}]});
 const observed=projectCombatObservation(s);
 assert.equal(observed.combat.raidEncounter.fires.length,1);
 assert.equal(observed.combat.raidEncounter.nextSpecial,undefined);
 assert.ok(!JSON.stringify(observed).includes('secret-script'));
 assert.deepEqual(selectCombatPolicy(observed,observed),selectCombatPolicy(s,s));
});

function idleMelee(){
 const {s,ally,enemy}=fixture(4);
 s.strategyPolicy.role='melee';enemy.airborne=true;
 return {s,ally,enemy};
}

test('spread order separates idle melee when all visible enemies are airborne',()=>{
 const {s,ally}=idleMelee(),before=structuredClone(s);
 const intent=selectCombatPolicy(s,s),o=projectCombatObservation(s);
 assert.equal(intent.kind,'move');assert.deepEqual(selectCombatPolicy(o,o),intent);assert.deepEqual(s,before);
 for(let tick=0;tick<20;tick++){
  const p={position:s.position,positionY:s.positionY};s.clock+=100;positionPartyMember(s,s);
  assert.ok(distance(p,s)<=.70000001);
 }
 assert.ok(distance(s,ally)>=5.5);
 assert.equal(positionPartyMember(s,s),false);
});

test('melee returns to combat positioning when a ground add appears or the target lands',()=>{
 const {s,enemy}=idleMelee();
 s.combat.enemies.push({...enemy,id:'ground-add',airborne:false});
 assert.equal(positionPartyMember(s,s),false,'do not prioritize spacing over fighting ground adds');
 s.combat.enemies.pop();enemy.airborne=false;
 assert.equal(positionPartyMember(s,s),false,'ordinary melee targeting resumes after landing');
 s.strategyPolicy.role='tank';enemy.airborne=true;
 assert.equal(positionPartyMember(s,s),false,'ordinary spacing does not override tank assignment');
});

test('idle melee spacing respects compact orders, roots, casts and pull discipline',()=>{
 const {s,ally}=idleMelee();
 s.combat.raidEncounter.command.formation='compact';assert.equal(positionPartyMember(s,s),false);
 s.combat.raidEncounter.command.formation='spread';s.rootUntil=1000;assert.equal(positionPartyMember(s,s),false);
 s.rootUntil=0;s.cast={spell:133,until:1000};assert.equal(positionPartyMember(s,s),false);
 s.cast=null;s.strategyPolicy.waitForTank=true;ally.strategyPolicy.role='tank';
 assert.equal(positionPartyMember(s,s),false);
 s.clock=3000;assert.equal(positionPartyMember(s,s),true,'spacing starts only after the pull delay');
 s.petUnit=true;assert.equal(positionPartyMember(s,s),false);
});

test('idle melee formation survives a mid-movement snapshot in the actual rule loop',()=>{
 const {s,ally,enemy}=idleMelee();enemy.nextSpell=999999;
 advanceOwned(s,400);const restored=JSON.parse(JSON.stringify(s));
 for(let at=500;at<=4000;at+=100){advanceOwned(s,at);advanceOwned(restored,at);}
 assert.deepEqual(restored,s);
 assert.ok(distance(s,ally)>=5.5,'queued policy movement actually separates the actors');
});
