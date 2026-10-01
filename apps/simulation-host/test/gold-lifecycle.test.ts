import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../../../packages/game-domain/src/molten-core-demo.ts';
import {SimulationHost} from '../src/host.ts';
import type {SimulationInput} from '../../../packages/protocol/src/simulation.ts';

test('resident gold raid requires settlement before exit and preserves a retried exit across recovery',async()=>{
 const host=new SimulationHost(),state=createMoltenCoreDemo().state;state.party=[];
 const instanceId='gold-lifecycle',accountId='leader';let sequence=0;
 const input=(action:Record<string,unknown>):SimulationInput=>({instanceId,actorId:state.id,controllerGeneration:1,
  clientSequence:++sequence,requestId:`command-${sequence}`,command:{kind:'action',action:action as {type:string}}});
 const send=(action:Record<string,unknown>)=>host.input(accountId,input(action));
 try{
  await host.admit({instanceId,ownerEpoch:1,state,controllers:[{actorId:state.id,accountId,generation:1,canPause:true}]},{realtime:false});
  for(const action of [{type:'enterDungeon',contentId:'onyxias-lair-gold'},{type:'goldPublish'},{type:'goldRecommend'},{type:'goldLaunch'}]){
   const receipt=await send(action);assert.equal(receipt.status,'applied',receipt.reason);
  }
  const before=(await host.checkpoint(instanceId)).state;
  assert.equal(before.party.length,39);
  const denied=await send({type:'goldLeave'});assert.equal(denied.status,'rejected');assert.match(denied.reason!,/结算/);
  assert.deepEqual((await host.checkpoint(instanceId)).state,before);
  const settled=await send({type:'goldSettle'});assert.equal(settled.status,'applied',settled.reason);
  const earned=(await host.checkpoint(instanceId)).state;
  const departure=input({type:'goldLeave'}),left=await host.input(accountId,departure);
  assert.equal(left.status,'applied',left.reason);
  const checkpoint=await host.checkpoint(instanceId);
  assert.equal(checkpoint.state.goldRaid.active,false);assert.equal(checkpoint.state.party.length,0);
  assert.equal(checkpoint.state.activity.type,'idle');assert.equal(checkpoint.state.money,earned.money);
  assert.deepEqual(checkpoint.state.pending,earned.pending);
  assert.deepEqual(checkpoint.state.goldRaid.settlement,earned.goldRaid.settlement);
  for(const npc of earned.party)assert.ok(checkpoint.state.npcWorld.residents.some((row:any)=>row.id===npc.id),'NPC identity survives departure');
  await host.remove(instanceId);await host.restore(checkpoint,2,{realtime:false});
  assert.deepEqual(await host.input(accountId,departure),left);
  assert.deepEqual((await host.checkpoint(instanceId)).state,checkpoint.state);
 }finally{await host.close();}
});
