import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationHost} from '../src/host.ts';
import {SimulationSession} from '../src/session.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {localScenarios} from '../../../packages/simulation-tests/support/baseline.ts';
import {inputConfirmation,validateSimulationInput,isPublishedInputReceipt,type SimulationCommand} from '../../../packages/protocol/src/simulation.ts';
import type {InstanceCheckpoint} from '../src/instance.ts';

test('confirmation is server-selected and asset/lifecycle intentions cannot downgrade it',()=>{
 for(const type of ['buy','sell','loot','turnin','equip','talent','goldBid','goldSettle','groupLoot','npcMatchSupply','enterDungeon','leaveDungeon'])
  assert.equal(inputConfirmation({kind:'action',action:{type}}),'durable',type);
 for(const kind of ['pause','resume','loot','questTurnIn','travel'] as const)assert.equal(inputConfirmation({kind} as SimulationCommand),'durable');
 for(const order of ['pause','resume','prepare','takeover','unknown'])assert.equal(inputConfirmation({kind:'action',action:{type:'combatCommand',order}}),'durable');
 for(const order of ['moveTo','cast','stopCast','focus','mark','mode','kite','cancelMove'])assert.equal(inputConfirmation({kind:'action',action:{type:'combatCommand',order}}),'applied');
 assert.equal(inputConfirmation({kind:'action',action:{type:'raidOrder',order:'focusBoss'}}),'applied');
 const input={instanceId:'room',actorId:'hero',controllerGeneration:1,clientSequence:1,requestId:'request',command:{kind:'action' as const,action:{type:'buy',id:1,count:1,confirmation:'applied'}}};
 assert.throws(()=>validateSimulationInput(input),/fields/);
 assert.equal(isPublishedInputReceipt({requestId:'request',inputSequence:1,effectiveWallAt:0,simTime:0,status:'applied',durable:false}),false);
});

test('live combat skips per-command SQL, durable boundaries save the batch, and host loss restores only the saved state',async()=>{
 const store=new MemoryStore();let offset=0,host=new SimulationHost();
 const repository=new SimulationRepository(store,()=>Date.now()+offset);let session:SimulationSession|undefined;
 try{
  const state=localScenarios().dungeon,instanceId='ordinary-control';
  session=await SimulationSession.open(host,repository,'host',{instanceId,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]},{checkpointMs:10000});
  let writes=0,reads=0;const commit=repository.commit.bind(repository),read=store.read.bind(store),transaction=store.transaction.bind(store);
  repository.commit=async(...args)=>{writes++;return commit(...args);};
  store.read=(...args)=>{reads++;return read(...args);};
  let transactions=0;store.transaction=(...args)=>{transactions++;return transaction(...args);};
  const intent=(n:number,command:SimulationCommand)=>({instanceId,actorId:state.id,controllerGeneration:1,clientSequence:n,requestId:'input:'+n,command});
  const command:SimulationCommand={kind:'action',action:{type:'combatCommand',order:'holdFire',encounterId:state.combat.id,enabled:true}};
  for(let n=1;n<=20;n++){
   const receipt=await session.input('alice',intent(n,command));assert.equal(receipt.status,'applied',receipt.reason);
   assert.equal(receipt.confirmation,'applied');assert.equal(receipt.durable,false);
  }
  assert.equal(writes,0);assert.equal(reads,0);assert.equal(transactions,0,'no repository reads, checkpoints, renewals or transactions for individual combat intentions');
  const presentation=await session.presentation('alice',state.id,'combat');
  assert.ok(presentation.execution!.receipts.every(r=>r.confirmation==='applied'&&!r.durable));
  const pause=await session.input('alice',intent(21,{kind:'pause',encounterId:state.combat.id}));
  assert.equal(pause.confirmation,'durable');assert.equal(pause.durable,true);assert.equal(writes,1);
  const saved=(await repository.load<InstanceCheckpoint>(instanceId))!.checkpoint;
  assert.equal(saved.inputSequence,21);assert.equal(saved.appliedInputSequence,21);assert.equal(saved.state.combat.command.holdFire,true);
  assert.equal(saved.state.combat.command.paused,true);
  const retry=await session.input('alice',intent(20,command));assert.equal(retry.durable,true);assert.equal(writes,1,'retry observes saved status without another checkpoint');
  const volatile=await session.input('alice',intent(22,{kind:'action',action:{type:'combatCommand',order:'holdFire',encounterId:state.combat.id,enabled:false}}));
  assert.equal(volatile.status,'applied');assert.equal(volatile.durable,false);assert.equal(writes,1);
  // Stop the actual Worker without a final session checkpoint; advance only
  // the repository lease clock, as in the process recovery fault tests.
  await host.close();await session.discard();session=undefined;offset=31000;host=new SimulationHost();
  session=await SimulationSession.open(host,repository,'replacement',{instanceId,state,controllers:[{actorId:state.id,accountId:'alice',generation:1,canPause:true}]},{checkpointMs:10000});
  const recovered=await session.presentation('alice',state.id,'combat');
  assert.equal(recovered.execution!.ownerEpoch,2);assert.equal(recovered.execution!.clientSequence,21);
  assert.equal(recovered.execution!.receipts.some(r=>r.requestId==='input:22'),false,'uncommitted input is not silently replayed');
  const restored=(await repository.load<InstanceCheckpoint>(instanceId))!.checkpoint;
  assert.equal(restored.state.combat.command.holdFire,true);assert.equal(restored.state.combat.command.paused,true);
 }finally{await session?.close();await host.close();await store.close();}
});
