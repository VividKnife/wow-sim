import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {startCombat} from '../src/rules/combat.js';
import {distance} from '../../sim-core/src/geometry.js';

function spawnDistance(classId:number,raceId:number,role?:'tank'|'melee'|'ranged'|'healer'){
 const state:any=createGame('Spawn test',1,1000,{classId,raceId});
 if(role)state.strategyPolicy={role};
 startCombat(state,[6]);
 return distance(state,state.combat.enemies[0]);
}

test('solo enemies spawn exactly 10 yards from melee roles',()=>{
 for(const role of ['tank','melee'] as const){
  assert.equal(spawnDistance(1,1,role),10);
 }
});

test('solo ranged characters begin at their longest hostile range',()=>{
 assert.equal(spawnDistance(8,1),35,'mage uses Fireball range');
 assert.equal(spawnDistance(3,2),35,'hunter uses Auto Shot range');
 assert.equal(spawnDistance(5,1),30,'priest ignores longer friendly healing range');
});
