import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,advanceOwned,act} from '../src/rules/engine.js';
import {localScenarios} from './support/local-scenarios.ts';
import type {Rules} from '../src/model.ts';

for(const [name,initial] of Object.entries(localScenarios()))test(`${name}: exclusively owned Worker timeline matches immutable engine at every sample`,()=>{
 let expected=structuredClone(initial),actual=structuredClone(initial);
 const checkpoints:Rules[]=[];
 for(let time=50;time<=15000;time+=50){
  expected=advance(expected,time).state;
  const owned=actual;actual=advanceOwned(actual,time).state;
  assert.equal(actual,owned,'hot ticks do not copy the entire save');
  // Compare serialized state, including RNG, damage, movement, logs and loot.
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),`diverged at ${time}`);
  if(time===5000)checkpoints.push(structuredClone(actual));
 }
 assert.equal(checkpoints[0].wallAt,5000,'upload snapshots remain immutable');
 const before=JSON.stringify(actual);
 assert.throws(()=>act(actual,{type:'combatCommand',encounterId:'stale',order:'focus'},actual.wallAt));
 assert.equal(JSON.stringify(actual),before,'rejected input cannot mutate the owned simulation');
});
