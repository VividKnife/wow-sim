import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationHost} from '../src/host.ts';
import {positionScene} from './support/position-scene.ts';

test('real owner restores station tasks and receipts, rejects foreign commanders, publishes position status',async()=>{
 const host=new SimulationHost(),state=positionScene(),instanceId='position-test';
 const input={instanceId,actorId:state.id,controllerGeneration:1,clientSequence:1,requestId:'station',command:{kind:'action' as const,action:{type:'combatCommand',order:'moveTo',encounterId:state.combat.id,memberIds:[state.id,state.party[0].id],destination:{x:10,y:0}}}};
 try{
  await host.admit({instanceId,ownerEpoch:1,state,controllers:[{actorId:state.id,accountId:'captain',generation:1,canPause:true}]},{realtime:false});
  await assert.rejects(host.input('other',input),/fenced/);
  const receipt=await host.input('captain',input);assert.equal(receipt.status,'applied');
  while(!(await host.advance(instanceId,1000)).complete){}
  const checkpoint=await host.checkpoint(instanceId);assert.equal(checkpoint.state.combat.command.movementTasks.length,2);
  await host.remove(instanceId);await host.restore(JSON.parse(JSON.stringify(checkpoint)),2,{realtime:false});
  assert.deepEqual(await host.input('captain',input),receipt);
  while(!(await host.advance(instanceId,12000)).complete){}
  const view=await host.presentation(instanceId,'captain',state.id,'combat');
  assert.equal(view.execution?.ownerEpoch,2);
  const tasks=(view.snapshot?.player as any).combat.command.movementTasks;
  assert.equal(tasks.length,2);assert.ok(tasks.every((t:any)=>t.status==='holding'));
  const saved=await host.checkpoint(instanceId);assert.equal(saved.state.combat.command.movementSequence,2,'retry must not reassign tasks');
 }finally{await host.close();}
});
