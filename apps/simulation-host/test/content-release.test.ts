import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
test('running residents receive server release on presentation and retain it after restart',async()=>{
 const store=new MemoryStore(),repository=new SimulationRepository(store),host=new SimulationHost();
 const state=createGame('版本同步',31,Date.now());
 const admission={instanceId:'release-live',state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]};
 let session:SimulationSession|undefined;
 try{
  session=await SimulationSession.open(host,repository,'host-a',admission);
  let view=await session.presentation('alice',state.id,'full');assert.equal(view.snapshot!.player.contentPhase,1);
  await store.transaction(tx=>tx.put('content_releases',{id:'world',phase:2}));
  view=await session.presentation('alice',state.id,'full');assert.equal(view.snapshot!.player.contentPhase,2);
  await session.close();session=await SimulationSession.open(host,repository,'host-b',admission);
  assert.equal((await session.presentation('alice',state.id,'full')).snapshot!.player.contentPhase,2);
 }finally{await session?.close();await host.close();await store.close();}
});
