import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {spellInfo} from '../../../packages/game-domain/src/rules/character.js';

function priest(){
 const s=createGame('Player priest',37,0,{classId:5,raceId:1});s.level=3;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 startCombat(s,[257]);const enemy=s.combat.enemies[0];enemy.position=3;enemy.positionY=0;enemy.nextAttack=100000;enemy.rootUntil=100000;
 return s;
}
test('player priest obeys healing rules instead of the companion 85 percent rescue threshold',()=>{
 const s=priest();s.hp=Math.floor(stats(s).maxHp*.7);combatTick(s);
 assert.equal(s.cast?.spell,585);assert.equal(s.logs.some(l=>l.kind==='cast'&&l.spellId===2050),false);
});
test('player priest does not interrupt configured Smite for the companion rescue policy',()=>{
 const s=priest();s.hp=Math.floor(stats(s).maxHp*.7);s.cast={spell:585,target:s.combat.enemies[0].id,startedAt:0,until:6000};s.nextAction=6000;s.clock=700;
 combatTick(s);assert.equal(s.cast?.spell,585);assert.equal(s.cast.until,6000);
});
test('disabled player healing and shielding stay disabled while injured',()=>{
 const s=priest();s.learned.push(17);s.rules=[];s.hp=Math.floor(stats(s).maxHp*.3);s.combat.enemies[0].target=s.id;const mana=s.mana;
 combatTick(s);assert.equal(s.cast,null);assert.equal(s.absorb,undefined);assert.equal(s.mana,mana);
});
test('player priest spends the last affordable Smite cost and still heals below its configured threshold',()=>{
 const s=priest();s.mana=spellInfo(s,585).mana;combatTick(s);assert.equal(s.cast?.spell,585);assert.equal(s.mana,0);
 const hurt=priest();hurt.hp=Math.floor(stats(hurt).maxHp*.4);combatTick(hurt);assert.equal(hurt.cast?.spell,2050);
});
test('player priest without mana can finish a real low-level enemy with equipped weapon attacks',()=>{
 const s=priest();s.mana=0;s.rules=[];s.lastManaUse=0;s.combat.enemies[0].hp=8;
 const result=advance(s,20000).state;
 assert.equal(result.combat,null);assert.equal(result.totals.kills,1);
 assert.ok(result.logs.some(l=>l.kind==='damage'&&l.actorId===s.id&&!l.spellId));
});
