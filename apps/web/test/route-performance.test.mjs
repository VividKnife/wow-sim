import test from 'node:test';
import assert from 'node:assert/strict';
import {route,nodes,baseTravelSpeed} from '../../../packages/game-domain/src/rules/catalog.js';

test('a cold world map with the server movement buff stays within the route CPU budget',()=>{
 // Production gives even unmounted players 2x movement. That selects the
 // riding graph and previously ran a whole-world search for each destination.
 const started=performance.now();
 const destinations=Object.keys(nodes);
 for(const to of destinations){
  const result=route('brill',to,baseTravelSpeed*2,baseTravelSpeed*2);
  assert.ok(Number.isFinite(result.duration));
 }
 const elapsed=performance.now()-started;
 // Normal cold execution is single-digit milliseconds locally. Leave ample
 // room for CI contention, but reject the former multi-second repeated search.
 assert.ok(elapsed<1000,`${destinations.length} map routes took ${elapsed.toFixed(0)} ms (budget 1000 ms)`);
});
