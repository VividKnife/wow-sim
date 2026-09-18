import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';

const enemyDistance=state=>Math.hypot(
 state.combat.enemies[0].position-state.position,
 state.combat.enemies[0].positionY-state.positionY,
);

test('personal combat spawns enemies 5-15 yards from melee classes',()=>{
 const distances=[];
 for(let seed=1;seed<=40;seed++){
  const state=createGame('近战开怪',seed,0,{classId:4,raceId:1});
  startCombat(state,[299]);
  distances.push(enemyDistance(state));
 }
 assert.ok(distances.every(distance=>distance>=5&&distance<=15));
 assert.ok(new Set(distances.map(distance=>distance.toFixed(6))).size>1);
});

test('personal combat spawns enemies 15-25 yards from ranged classes',()=>{
 const distances=[];
 for(let seed=1;seed<=40;seed++){
  const state=createGame('远程开怪',seed,0,{classId:8,raceId:1});
  startCombat(state,[299]);
  distances.push(enemyDistance(state));
 }
 assert.ok(distances.every(distance=>distance>=15&&distance<=25));
 assert.ok(new Set(distances.map(distance=>distance.toFixed(6))).size>1);
});

test('dungeon combat keeps its authored opening formation',()=>{
 const state=createGame('副本站位',1,0,{classId:8,raceId:1});
 startCombat(state,[299],true);
 assert.equal(enemyDistance(state),30);
});
