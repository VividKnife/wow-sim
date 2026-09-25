import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {enemy} from '../src/rules/character.js';
import {tickEnemyAuras} from '../src/rules/enemy-spells.js';

test('hostile periodic self damage uses enemy health instead of player stat rows',()=>{
 const s:any=createGame('光环探针',73,0);
 const mob:any=enemy(s,785,'hostile');
 s.clock=2000;
 mob.auras=[{spell:8699,type:3,amount:15,school:3,caster:mob.id,casterName:mob.name,
  until:10000,interval:2000,next:2000}];
 s.combat={enemies:[mob]};
 const before=mob.hp;
 tickEnemyAuras(s,[s],()=>{throw new Error('enemy self damage must not use player damage handling');});
 assert.equal(mob.hp,before-15);
 assert.equal(mob.auras[0].next,4000);
 assert.equal(s.logs.at(-1).targetId,mob.id);
});
