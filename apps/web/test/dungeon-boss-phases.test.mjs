import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {dungeonBossTick,dungeonBossPhaseTick} from '../../../packages/game-domain/src/rules/dungeon-boss-ai.js';
import {castEnemySpell,tickEnemyAuras} from '../../../packages/game-domain/src/rules/enemy-spells.js';
import {dungeonRoute} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import {dungeonBossGuides} from '../../../packages/game-domain/src/rules/dungeon-boss-skills.js';
import {spells} from '../../../packages/game-domain/src/rules/catalog.js';
const encounter=ids=>{const s=createGame('首领',44,0);s.level=60;startCombat(s,ids,true);for(const e of s.combat.enemies)e.target=s.id;return s;};
const hurt=()=>{};
test('Doan shields at half health and begins a single delayed detonation, preserving state on reload',()=>{
 const s=encounter([6487]),e=s.combat.enemies[0];e.hp=e.maxHp*.4;
 assert.equal(dungeonBossTick(s,e,[s],hurt),true);assert.equal(e.dungeonBoss.phase,1);assert.ok(e.auras.some(a=>a.spell===9438));
 const restored=JSON.parse(JSON.stringify(s)),boss=restored.combat.enemies[0];restored.clock=2000;dungeonBossTick(restored,boss,[restored],hurt);
 assert.equal(boss.cast.spell,9435);assert.equal(boss.dungeonBoss.detonate,0);
});
test('cathedral commanders share one encounter and fake death never awards a duplicate kill',()=>{
 const route=dungeonRoute('scarlet-monastery-cathedral');assert.equal(route.filter(e=>e.creatureTemplateIds.includes(3977)).length,1);assert.ok(route.find(e=>e.creatureTemplateIds.includes(3977)).creatureTemplateIds.includes(3976));
 const s=encounter([3976,3977]),[m,w]=s.combat.enemies;
 dungeonBossPhaseTick(s,[s],hurt);assert.equal(w.removed,true);
 m.hp=0;dungeonBossPhaseTick(s,[s],hurt);assert.equal(m.hp,1);assert.equal(m.removed,true);assert.equal(w.removed,false);assert.equal(!!m.rewarded,false);
 w.hp=w.maxHp*.4;dungeonBossPhaseTick(s,[s],hurt);assert.equal(s.combat.cathedral.stage,'resurrection');
 s.clock+=7000;dungeonBossPhaseTick(s,[s],hurt);assert.equal(m.hp,m.maxHp);assert.equal(m.removed,false);assert.equal(s.combat.cathedral.stage,'together');
 m.hp=0;dungeonBossPhaseTick(s,[s],hurt);assert.equal(m.hp,0);
});
test('Herod death reinforcements spawn once and do not create extra persistent boss loot',()=>{
 const s=encounter([3975]),e=s.combat.enemies[0];e.hp=0;dungeonBossPhaseTick(s,[s],hurt);dungeonBossPhaseTick(s,[s],hurt);
 const trainees=s.combat.enemies.filter(e=>e.entry===6575);assert.equal(trainees.length,20);assert.ok(trainees.every(e=>e.rewarded&&e.hp>0));
});
test('Archaedas health waves spawn once while Thermaplugg bombs recur',()=>{
 const s=encounter([2748]),e=s.combat.enemies[0];e.hp=e.maxHp*.3;dungeonBossTick(s,e,[s],hurt);dungeonBossTick(s,e,[s],hurt);
 assert.equal(s.combat.enemies.filter(e=>e.entry===7076).length,4);assert.equal(s.combat.enemies.filter(e=>e.entry===10120).length,2);
 const t=encounter([7800]),boss=t.combat.enemies[0];dungeonBossTick(t,boss,[t],hurt);t.clock=10000;dungeonBossTick(t,boss,[t],hurt);assert.equal(t.combat.enemies.filter(e=>e.entry===7915).length,1);
});
test('every documented scripted boss spell is present in the authoritative spell catalog',()=>{for(const guide of Object.values(dungeonBossGuides))for(const id of guide.spells)assert.ok(spells[id],String(id));});
test('Whirlwind triggers its damage pulse and walking bombs explode only once',()=>{
 const s=encounter([3975]),e=s.combat.enemies[0];s.position=e.position;s.positionY=e.positionY;let damage=0;
 castEnemySpell(s,e,e,8989,[s],(_s,_e,_target,amount)=>{damage+=amount;},2);s.clock=2000;
 tickEnemyAuras(s,[s],(_s,_e,_target,amount)=>{damage+=amount;});assert.ok(damage>0,'Whirlwind must deal damage, not just display an aura');
 const t=encounter([7915]),bomb=t.combat.enemies[0];t.position=bomb.position;t.positionY=bomb.positionY;let explosions=0;
 assert.ok(castEnemySpell(t,bomb,bomb,11504,[t],()=>{explosions++;},2));assert.equal(bomb.hp,0);assert.equal(explosions,1);
 assert.equal(castEnemySpell(t,bomb,bomb,11504,[t],()=>{explosions++;},2),false);
});
