import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';

const enemyDistance=state=>Math.hypot(
 state.combat.enemies[0].position-state.position,
 state.combat.enemies[0].positionY-state.positionY,
);

test('personal combat opens at ten yards for melee classes',()=>{
 const distances=[];
 for(let seed=1;seed<=40;seed++){
  const state=createGame('近战开怪',seed,0,{classId:4,raceId:1});
  startCombat(state,[299]);
  distances.push(enemyDistance(state));
 }
 assert.ok(distances.every(distance=>distance===10));
});

test('personal combat opens at the available ranged strategy range',()=>{
 const distances=[];
 for(let seed=1;seed<=40;seed++){
  const state=createGame('远程开怪',seed,0,{classId:8,raceId:1});
  startCombat(state,[299]);
  distances.push(enemyDistance(state));
 }
 assert.ok(distances.every(distance=>distance===35));
});

test('dungeon combat keeps its authored opening formation',()=>{
 const state=createGame('副本站位',1,0,{classId:8,raceId:1});
 startCombat(state,[299],true);
 assert.equal(enemyDistance(state),30);
});
