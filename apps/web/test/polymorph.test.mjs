import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {polymorphTarget,canPolymorph} from '../../../packages/game-domain/src/rules/polymorph.js';
import {protectCombatTarget,strategyAllows} from '../../../packages/game-domain/src/rules/combat-strategy.js';
import {spells} from '../../../packages/game-domain/src/rules/catalog.js';

function encounter(ids=[299,622]){
 const s=createGame('控场测试',283,0);s.level=20;s.learned=[118,133];s.mana=stats(s).maxMana;s.rules=[{spell:118,condition:'always',value:0,enabled:true},{spell:133,condition:'always',value:0,enabled:true}];
 startCombat(s,ids);for(const e of s.combat.enemies){e.position=20;e.rootUntil=100000;e.nextAttack=100000;e.ai={nextCheck:100000};}return s;
}
function resolvePoly(s,index=0,seed=123456789){
 s.cast={spell:118,target:s.combat.enemies[index].id,startedAt:0,until:100};s.nextAction=s.nextSwing=100000;s.rngState=seed;s.clock=100;combatTick(s);
}
test('polymorph controls an eligible elite, cancels its cast, and obeys spell resistance',()=>{
 const s=encounter([622]);s.combat.enemies[0].cast={spell:6660,target:s.id,until:10000};resolvePoly(s);
 assert.ok(s.combat.enemies[0].polyUntil>s.clock);assert.equal(s.combat.enemies[0].cast,null);
 const resisted=encounter([622]);resolvePoly(resisted,0,1);
 assert.ok(!(resisted.combat.enemies[0].polyUntil>resisted.clock));assert.ok(resisted.logs.some(l=>l.kind==='miss'&&l.spellId===118));
 const mechanical=encounter([2520]);resolvePoly(mechanical);
 assert.ok(!(mechanical.combat.enemies[0].polyUntil>mechanical.clock));
 const immune=encounter([1696]);resolvePoly(immune);
 assert.ok(!(immune.combat.enemies[0].polyUntil>immune.clock));
});

test('damaging a polymorphed target breaks control and stops its recovery',()=>{
 const s=encounter([622]);resolvePoly(s);const e=s.combat.enemies[0];e.hp=500;s.strategyPolicy={protectCC:false};
 s.cast={spell:133,target:e.id,startedAt:100,until:200};s.rngState=123456789;s.clock=200;combatTick(s);
 const impact=s.combat.projectiles[0].landsAt;s.clock=impact;combatTick(s);
 assert.ok(!(e.polyUntil>s.clock));const damaged=e.hp;assert.ok(damaged<500);
 s.clock=3000;combatTick(s);assert.ok(e.hp<=damaged);
});
test('an automatic polymorph rule controls a side target once, then resumes damage',()=>{
 const s=encounter();combatTick(s);assert.equal(s.cast?.spell,118);assert.equal(s.cast?.target,s.combat.enemies[1].id);
 s.rngState=123456789;for(let at=100;at<=2000;at+=100){s.clock=at;combatTick(s);}
 assert.ok(s.combat.enemies[1].polyUntil>s.clock);assert.equal(s.cast?.spell,133);assert.equal(s.cast?.target,s.combat.enemies[0].id);
});

test('polymorph searches side targets for the configured condition',()=>{
 const s=encounter([299,622,1731]);s.rules[0].condition='targetCasting';
 s.combat.enemies[2].cast={spell:6660,target:s.id,until:10000};combatTick(s);
 assert.equal(s.cast?.spell,118);assert.equal(s.cast?.target,s.combat.enemies[2].id);
});

test('automatic crowd control prioritizes a side caster over a miner without changing the damage focus',()=>{
 const s=encounter([299,598,1729]);combatTick(s);
 assert.equal(s.cast?.spell,118);assert.equal(s.cast?.target,s.combat.enemies[2].id);
});

test('two mages reserve different caster targets before either cast completes',()=>{
 const s=encounter([299,598,1729,1729]);s.position=-6; // Begin in the party backline so this test isolates simultaneous reservations.
 const mage={...structuredClone(s),id:'companion-mage',name:'第二法师',party:undefined};s.party=[mage];s.combat.participantIds.push(mage.id);
 combatTick(s);
 assert.equal(s.cast?.target,s.combat.enemies[2].id);
 assert.equal(mage.cast?.target,s.combat.enemies[3].id);
});

test('caster preference still obeys the selected rule and avoids targets with damage over time',()=>{
 const s=encounter([299,598,1729]);s.rules[0].condition='enemyNear';s.rules[0].value=10;
 s.combat.enemies[1].position=9;s.combat.enemies[1].positionY=0;s.combat.enemies[2].position=20;combatTick(s);
 assert.equal(s.cast?.target,s.combat.enemies[1].id);
 const dotted=encounter([299,598,1729]);dotted.combat.enemies[2].dots=[{remaining:3,next:100000}];combatTick(dotted);
 assert.equal(dotted.cast?.target,dotted.combat.enemies[1].id);
});

test('an active owned polymorph reserves that caster until it expires',()=>{
 const s=encounter([299,622,1731]);s.combat.enemies[1].polyUntil=5000;s.combat.enemies[1].polyCaster=s.id;combatTick(s);
 assert.equal(s.cast?.spell,133);assert.equal(s.cast?.target,s.combat.enemies[0].id);
});
test('an active caster takes priority over an idle mana user',()=>{
 const s=encounter([299,1729,1732]);s.combat.enemies[2].cast={spell:2138,target:s.id,until:10000};combatTick(s);
 assert.equal(s.cast?.target,s.combat.enemies[2].id);
});
test('a pirate casting a pet buff does not displace an idle mana caster',()=>{
 const s=encounter([299,657,1732]),pirate=s.combat.enemies[1];pirate.cast={spell:7389,target:pirate.id,until:10000};combatTick(s);
 assert.equal(s.cast?.target,s.combat.enemies[2].id);
});
test('another mage can control a second target while the first sheep is active',()=>{
 const s=encounter([299,1729,1729]);s.combat.enemies[1].polyUntil=5000;s.combat.enemies[1].polyCaster='companion-mage';combatTick(s);
 assert.equal(s.cast?.target,s.combat.enemies[2].id);
});
test('polymorph excludes a mind-controlled ally even when it is the preferred caster',()=>{
 const s=encounter([299,598,1729]),[focus,miner,caster]=s.combat.enemies;caster.controlledBy='companion-priest';
 assert.equal(canPolymorph(caster,spells[118]),false);
 assert.equal(polymorphTarget(s,s,focus,spells[118],s.rules[0])?.id,miner.id);
});
test('one caster can maintain only one polymorph and it heals ten percent per second',()=>{
 const s=encounter([622,1731]);resolvePoly(s);const first=s.combat.enemies[0];first.hp=500;
 s.clock=1100;combatTick(s);assert.equal(first.hp,500+Math.floor(first.maxHp/10));
 s.cast={spell:118,target:s.combat.enemies[1].id,startedAt:1100,until:1200};s.rngState=123456789;s.clock=1200;combatTick(s);
 assert.ok(!(first.polyUntil>s.clock));assert.ok(s.combat.enemies[1].polyUntil>s.clock);
});


test('last surviving sheep is attacked and awakened by real damage',()=>{
 const s=encounter(),[dead,sheep]=s.combat.enemies;dead.hp=0;
 sheep.polyUntil=60000;sheep.polyCaster=s.id;sheep.hp=sheep.maxHp;
 let damaged=false;
 for(s.clock=100;s.clock<10000;s.clock+=100){
  combatTick(s);
  if(s.logs.some(l=>l.actorId===s.id&&l.targetId===sheep.id&&l.amount>0&&['damage','impact'].includes(l.kind))){damaged=true;break;}
 }
 assert.ok(damaged);assert.equal(sheep.polyUntil,0);
});

test('multiple surviving sheep remain protected, but dead and removed enemies do not block finishing',()=>{
 const s=encounter(),[other,sheep]=s.combat.enemies;sheep.polyUntil=60000;other.polyUntil=60000;
 assert.equal(protectCombatTarget(s,sheep),true);
 assert.equal(strategyAllows(s,s,sheep,spells[133]),false);
 other.removed=true;
 assert.equal(protectCombatTarget(s,sheep),false);
 assert.equal(strategyAllows(s,s,sheep,spells[133]),true);
 assert.equal(sheep.polyUntil,60000);
});
