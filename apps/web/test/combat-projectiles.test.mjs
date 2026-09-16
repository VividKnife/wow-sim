import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,stats} from '../lib/game/engine.js';
import {startCombat,combatTick} from '../lib/game/combat.js';
import {castEnemySpell,tickEnemySpell,tickEnemyProjectiles} from '../lib/game/enemy-spells.js';
function fixture(){const s=createGame('弹道',283,0);s.level=20;s.hp=10000;s.mana=stats(s).maxMana;s.learned=[133];s.rules=[{spell:133,condition:'always',value:0,enabled:true}];startCombat(s,[299]);const e=s.combat.enemies[0];e.hp=e.maxHp=10000;e.rootUntil=1e9;e.nextAttack=1e9;return s;}
test('Fireball launches on cast completion and settles once after its flight',()=>{
 const s=fixture(),e=s.combat.enemies[0];combatTick(s);s.clock=s.cast.until;combatTick(s);
 assert.equal(e.hp,10000);assert.equal(s.combat.projectiles.length,1);const p=s.combat.projectiles[0];assert.ok(p.landsAt>s.clock);
 s.rules=[];s.nextSwing=1e9;s.clock=p.landsAt-1;combatTick(s);assert.equal(e.hp,10000);
 s.clock=p.landsAt;combatTick(s);assert.ok(e.hp<10000);const hp=e.hp;combatTick(s);assert.equal(e.hp,hp);
});
test('restoring an in-flight projectile produces the same damage and RNG',()=>{
 const s=fixture();combatTick(s);s.clock=s.cast.until;combatTick(s);s.rules=[];const end=s.combat.projectiles?.[0]?.landsAt;assert.ok(end);
 const restored=JSON.parse(JSON.stringify(s));s.clock=restored.clock=end;combatTick(s);combatTick(restored);assert.deepEqual(restored,s);
});
test('out of range at cast completion cancels the spell without a hit',()=>{
 const s=fixture();combatTick(s);s.combat.enemies[0].positionY=100;s.clock=s.cast.until;combatTick(s);
 assert.equal(s.combat.enemies[0].hp,10000);assert.ok(s.logs.some(l=>l.kind==='cancel'));
});
test('combat remains deterministic across wall-clock advance batch sizes with missiles',()=>{
 const s=fixture(),whole=advance(s,12000).state;let split=s;for(let t=500;t<=12000;t+=500)split=advance(split,t).state;
 assert.deepEqual(split,whole);
});
test('enemy missiles share authority flight timing and can outlive their caster',()=>{
 const s=fixture();startCombat(s,[4418]);s.nextAction=s.nextSwing=1e9;const e=s.combat.enemies[0],before=s.hp;
 const hurt=(state,c,target,amount)=>{target.hp-=Math.round(amount);};
 castEnemySpell(s,e,s,9053,[s],hurt);s.clock=e.cast.until;tickEnemySpell(s,e,[s],hurt);
 assert.equal(s.hp,before);assert.equal(s.combat.projectiles.length,1);
 const p=s.combat.projectiles[0];e.hp=0;s.clock=p.landsAt;tickEnemyProjectiles(s,[s],hurt);assert.ok(s.hp<before);
 const hp=s.hp;tickEnemyProjectiles(s,[s],hurt);assert.equal(s.hp,hp);
});
