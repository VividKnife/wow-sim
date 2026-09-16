import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advance} from '../lib/game/engine.js';
import {startCombat,combatTick} from '../lib/game/combat.js';
import {armorReduction} from '../lib/game/character.js';
import * as enemySpells from '../lib/game/enemy-spells.js';
import {armorWithAuras,attackTimeMultiplier,hasAura} from '../lib/game/combat-auras.js';
import {enemyAITick} from '../lib/game/enemy-ai.js';
import {spells} from '../lib/game/catalog.js';
import {leaveDungeon} from '../lib/game/dungeon.js';

function encounter(entry){const s=createGame('测试',283,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];startCombat(s,[entry]);s.nextAction=s.nextSwing=1e9;const e=s.combat.enemies[0];e.position=s.position+4;e.nextAttack=1e9;return {s,e};}
const hurt=(s,e,c,amount)=>{c.hp=Math.max(0,c.hp-Math.round(amount));};

test('source Slam applies bounded damage and a three-second stun, with normal actions suppressed',()=>{
 const {s,e}=encounter(644),before=s.hp;
 assert.equal(enemySpells.castEnemySpell(s,e,s,6304,[s],hurt),true);
 const reduction=1-armorReduction(stats(s).armor,e.level);
 assert.ok(before-s.hp>=Math.round(64*reduction)&&before-s.hp<=Math.round(86*reduction));
 assert.equal(hasAura(s,12,2999),true);assert.equal(hasAura(s,12,3000),false);
 s.nextSwing=0;s.clock=100;combatTick(s);assert.equal(s.nextSwing,0);
});

test('a source cast spends mana once, persists over serialization, and is cancelled by stun',()=>{
 const {s,e}=encounter(4418),before=e.mana,hp=s.hp;
 assert.equal(enemySpells.castEnemySpell(s,e,s,9053,[s],hurt),true);
 assert.equal(e.mana,before-90);assert.equal(e.cast.until,3000);assert.equal(s.hp,hp);
 const restored=JSON.parse(JSON.stringify(s)),caster=restored.combat.enemies[0];restored.clock=3000;
 enemySpells.tickEnemySpell(restored,caster,[restored],hurt);assert.equal(restored.hp,hp);restored.clock=restored.combat.projectiles[0].landsAt;enemySpells.tickEnemyProjectiles(restored,[restored],hurt);
 assert.ok(hp-restored.hp>=64&&hp-restored.hp<=86);assert.equal(caster.cast,null);
 enemySpells.tickEnemySpell(restored,caster,[restored],hurt);assert.equal(caster.mana,before-90);
 const interrupted=encounter(4418);enemySpells.castEnemySpell(interrupted.s,interrupted.e,interrupted.s,9053,[interrupted.s],hurt);
 interrupted.e.stunUntil=5000;interrupted.s.clock=1000;enemySpells.tickEnemySpell(interrupted.s,interrupted.e,[interrupted.s],hurt);
 assert.equal(interrupted.e.cast,null);assert.equal(interrupted.s.hp,stats(interrupted.s).maxHp);
});

test('Pierce Armor expires at twenty seconds and does not stack with its own refresh',()=>{
 const {s,e}=encounter(598),armor=stats(s).armor;
 enemySpells.castEnemySpell(s,e,s,6016,[s],hurt);
 assert.equal(armorWithAuras(s,armor,0),armor*.5);
 s.clock=5000;enemySpells.castEnemySpell(s,e,s,6016,[s],hurt);
 assert.equal(armorWithAuras(s,armor,5000),armor*.5);
 assert.equal(armorWithAuras(s,armor,25000),armor);
});

test('Molten Metal has five thirty-damage ticks and the source attack-speed penalty',()=>{
 const {s,e}=encounter(1763);s.hp=1000;
 enemySpells.castEnemySpell(s,e,s,5213,[s],hurt);s.clock=2000;enemySpells.tickEnemySpell(s,e,[s],hurt);
 assert.equal(attackTimeMultiplier(s,s.clock),1.54);
 for(s.clock=2100;s.clock<=18000;s.clock+=100)enemySpells.tickEnemyAuras(s,[s],hurt);
 assert.equal(s.hp,850);assert.equal(attackTimeMultiplier(s,18000),1);
});

test('Cookie heals only on cast completion and caps the source healing at missing health',()=>{
 const {s,e}=encounter(645);e.hp=e.maxHp-7;
 enemySpells.castEnemySpell(s,e,e,5174,[s],hurt);assert.equal(e.hp,e.maxHp-7);
 s.clock=2000;enemySpells.tickEnemySpell(s,e,[s],hurt);assert.equal(e.hp,e.maxHp);
 assert.equal(s.logs.find(l=>l.kind==='heal').amount,7);
});

test('enemy event timers and casts produce identical results in whole and split advances',()=>{
 const {s}=encounter(4418);s.hp=2000;
 const whole=advance(s,12000).state;let split=s;
 for(let t=1000;t<=12000;t+=1000)split=advance(split,t).state;
 assert.deepEqual(split,whole);assert.ok(whole.logs.some(l=>l.kind==='cast'&&l.actorId.startsWith('enemy-')));
});

test('persistent harmful auras continue after their caster dies and the encounter ends',()=>{
 const {s,e}=encounter(1763);enemySpells.castEnemySpell(s,e,s,5213,[s],hurt);
 s.clock=2000;enemySpells.tickEnemySpell(s,e,[s],hurt);
 s.lastCombat=s.combat;s.combat=null;s.nextTick=2100;s.nextRegen=1e9;s.wallAt=2000;
 const hp=s.hp,result=advance(s,18000).state;
 assert.equal(hp-result.hp,150);assert.equal(result.auras.length,0);
 assert.equal(result.logs.filter(l=>l.periodic&&l.spellId===5213).length,5);
});

test('Flamestrike ground damage remains at its cast location when actors move',()=>{
 const {s,e}=encounter(1729);enemySpells.castEnemySpell(s,e,s,11829,[s],hurt);
 s.clock=3000;enemySpells.tickEnemySpell(s,e,[s],hurt);const hp=s.hp;
 s.position=20;s.clock=5000;enemySpells.tickEnemyAuras(s,[s],hurt);assert.equal(s.hp,hp);
 s.position=0;s.clock=7000;enemySpells.tickEnemyAuras(s,[s],hurt);assert.equal(s.hp,hp-16);
});

test('departing an instance clears ground zones but preserves attached harmful auras',()=>{
 const {s,e}=encounter(1729);enemySpells.castEnemySpell(s,e,s,11829,[s],hurt);
 s.clock=3000;enemySpells.tickEnemySpell(s,e,[s],hurt);assert.equal(s.groundEffects.length,1);
 s.combat=null;s.dungeon={id:'deadmines'};s.auras=[{spell:5213,type:3,until:10000}];leaveDungeon(s);
 assert.equal(s.groundEffects.length,0);assert.equal(s.auras[0].spell,5213);
 s.groundEffects=[{spell:11829}];startCombat(s,[598]);assert.equal(s.groundEffects.length,0);
});

test('pirate Attack targets the original summoned pet and never buffs the pirate',()=>{
 const {s,e}=encounter(657);e.spawnEventRolls={65701:true};combatTick(s);
 const pet=s.combat.enemies.find(u=>u.summonedBy===e.id);assert.equal(pet?.entry,3450);
 s.clock=2000;enemySpells.tickEnemySpell(s,e,[s],hurt);
 assert.equal(hasAura(e,9,s.clock),false);assert.equal(hasAura(pet,9,s.clock),true);
});

test('VanCleef summons exactly two living allies once below half health, including after reload',()=>{
 const {s,e}=encounter(639);e.hp=Math.floor(e.maxHp*.49);e.target=s.id;
 enemyAITick(s,e,[s],hurt);s.clock=500;enemyAITick(s,e,[s],hurt);
 assert.equal(s.combat.enemies.filter(u=>u.summonedBy===e.id&&u.entry===636).length,2);
 const restored=JSON.parse(JSON.stringify(s));restored.clock=1000;
 enemyAITick(restored,restored.combat.enemies[0],[restored],hurt);
 assert.equal(restored.combat.enemies.filter(u=>u.summonedBy===e.id).length,2);
});

test('low-health fleeing expires after the pinned ten-second panic interval',()=>{
 const {s,e}=encounter(598);e.hp=Math.floor(e.maxHp*.1);e.target=s.id;
 enemyAITick(s,e,[s],hurt);s.clock=500;enemyAITick(s,e,[s],hurt);
 assert.equal(e.fleeUntil,10500);assert.equal(e.fleeing,true);
 s.clock=10500;enemyAITick(s,e,[s],hurt);assert.equal(e.fleeing,false);
});

test('enemy spell miss uses the player-target level curve rather than the NPC-target curve',()=>{
 const chance=enemySpells.enemySpellMissChance;
 assert.equal(chance({level:18},{level:18},spells[9053]),.04);
 assert.equal(chance({level:17},{level:20},spells[9053]),.13);
 assert.equal(chance({level:22},{level:18},spells[9053]),.01);
 assert.equal(chance({level:18},{level:18},spells[6304]),.05);
 assert.equal(chance({level:18},{level:18},spells[5213]),0);
});
