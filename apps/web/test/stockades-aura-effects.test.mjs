import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {enemy} from '../../../packages/game-domain/src/rules/character.js';
import {enemyMeleeTick} from '../../../packages/game-domain/src/rules/enemy-melee.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {addCombatAura} from '../../../packages/sim-core/src/combat-auras.js';

test('Demoralizing Shout lowers player attack power and expires without permanently modifying stats',()=>{
 const s=createGame('挫志怒吼',77,0,{classId:1,raceId:1});s.level=30;s.time=0;
 const before=stats(s).attackPower;
 addCombatAura(s,{spell:13730,effect:1,type:99,amount:-10,until:10000},0);
 assert.equal(stats(s).attackPower,before-10);s.time=10000;assert.equal(stats(s).attackPower,before);
});

test('NPC damage-done auras modify real melee swings',()=>{
 const s=createGame('姿态',1,0);s.level=30;s.hp=stats(s).maxHp;const e=enemy(s,1711,'enemy');s.position=e.position=0;s.positionY=e.positionY=0;e.nextAttack=0;
 const b=structuredClone(s),f=structuredClone(e);addCombatAura(f,{spell:7376,effect:2,type:79,amount:-10,misc:127,until:10000},0);
 let base=0,reduced=0;enemyMeleeTick(s,e,s,[s],(_s,_e,_t,n)=>{base+=n;});enemyMeleeTick(b,f,b,[b],(_s,_e,_t,n)=>{reduced+=n;});
 assert.ok(base>0);assert.ok(Math.abs(reduced/base-.9)<.000001);
});

test('NPC defensive damage-taken aura reduces a real player attack',()=>{
 const s=createGame('格挡',12,0,{classId:1,raceId:1});s.level=30;s.hp=stats(s).maxHp;s.rules=[];startCombat(s,[1711]);
 s.position=s.combat.enemies[0].position=20;s.combat.enemies[0].hp=s.combat.enemies[0].maxHp=10000;
 const b=structuredClone(s);addCombatAura(b.combat.enemies[0],{spell:7376,effect:1,type:87,amount:-10,misc:127,until:10000},0);
 combatTick(s);combatTick(b);
 const base=10000-s.combat.enemies[0].hp,reduced=10000-b.combat.enemies[0].hp;
 assert.ok(base>0);assert.ok(Math.abs(reduced-Math.round(base*.9))<=1);
});
