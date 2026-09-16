import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
function fixture(spell){const s=createGame('法术测试',19,0);s.level=20;s.learned.push(spell);s.mana=stats(s).maxMana;s.rules=[{spell,condition:'always',value:0,enabled:true}];startCombat(s,[299]);s.combat.enemies[0].hp=s.combat.enemies[0].maxHp=100000;s.combat.enemies[0].low=s.combat.enemies[0].high=0;return s;}
test('a single Blizzard channel deals exactly eight ticks and leaves no residual damage aura',()=>{
 const s=fixture(10);s.combat.enemies[0].rootUntil=100000;combatTick(s);s.rules=[];
 for(let t=100;t<=17000;t+=100){s.clock=t;combatTick(s);}
 assert.equal(s.combat.damage['法术测试 · 暴风雪'],200);
 assert.equal(s.combat.enemies[0].dots.filter(d=>d.spell===10).length,0);
});
test('repeated Fireball refreshes its own damage aura rather than stacking copies',()=>{
 const s=fixture(133);for(let t=0;t<=7000;t+=100){s.clock=t;combatTick(s);assert.ok(s.combat.enemies[0].dots.filter(d=>d.spell===133).length<=1);}
});
test('a resisted Frostbolt applies neither damage nor its slow effect',()=>{
 const s=createGame('命中',21,0);s.level=4;s.learned=[116];s.mana=1000;s.rules=[{spell:116,condition:'always',value:0,enabled:true}];startCombat(s,[299]);s.combat.enemies[0].level=4;s.combat.enemies[0].hp=10000;s.combat.enemies[0].rootUntil=1000000;
 for(let t=0;t<=1400;t+=100){s.clock=t;combatTick(s);}s.clock=1500;combatTick(s);const impact=s.combat.projectiles[0].landsAt;s.rules=[];s.nextSwing=1e9;s.rngState=1;s.clock=impact;combatTick(s);
 assert.ok(s.logs.some(l=>l.text.includes('抵抗了')));assert.equal(s.combat.enemies[0].slowUntil,0);assert.deepEqual(s.combat.damage,{});
});
