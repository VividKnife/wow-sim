import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {advance} from '../src/rules/engine.js';

async function fixture() {
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
 await service.createAccount('a',{name:'任务测试',classId:8,raceId:1},'create');
 const started=await service.command('a',{type:'hunt',id:299,localClientId:'browser',requestId:'hunt'});
 const base={ownerId:started.localSimulation!.ownerId,characterId:started.state.id,clientId:'browser',contentVersion:'test'};
 const session=await service.localSimulation('a',{...base,type:'claim',requestId:'claim'});
 now=1100;
 const state=advance(session.state,now).state;
 const checkpoint={...base,type:'checkpoint',sessionId:session.session.id,sequence:1,state,requestId:'checkpoint'};
 const command={type:'settings',autoLoot:true,characterId:base.characterId,localClientId:base.clientId,localSessionId:session.session.id,localCheckpoint:checkpoint,requestId:'command'};
 return {store,service,session,checkpoint,command};
}

test('combined checkpoint and command commit once, including a lost response retry',async()=>{
 const f=await fixture();
 const result=await f.service.command('a',f.command);
 assert.equal(result.state.wallAt,f.checkpoint.state.wallAt);assert.equal(result.state.settings.autoLoot,true);
 const ledger=await f.store.read(tx=>tx.list('ledger'));
 const again=await f.service.command('a',f.command);
 assert.equal(again.revision,result.revision);assert.equal(again.state.settings.autoLoot,true);
 assert.deepEqual(await f.store.read(tx=>tx.list('ledger')),ledger);
 // The browser can resolve a lost response using the original checkpoint ACK.
 const ack=await f.service.localSimulation('a',f.checkpoint);
 assert.equal(ack.session.sequence,1);
 assert.equal((await f.service.snapshot('a')).state.settings.autoLoot,true);
 await assert.rejects(f.service.command('a',{...f.command,localCheckpoint:{...f.checkpoint,state:{...f.checkpoint.state,money:999}}}),{code:'REQUEST_REUSED'});
});

test('rejected command rolls back its checkpoint, assets, sequence and receipts together',async()=>{
 const f=await fixture(),before=await f.service.snapshot('a');
 const receipts=await f.store.read(tx=>tx.list('receipts'));
 await assert.rejects(f.service.command('a',{...f.command,autoLoot:'invalid'}),/自动拾取设置无效/);
 const after=await f.service.snapshot('a');
 assert.equal(after.state.wallAt,before.state.wallAt);assert.equal(after.revision,before.revision);
 assert.deepEqual(await f.store.read(tx=>tx.list('receipts')),receipts);
 assert.equal((await f.service.localSimulation('a',f.checkpoint)).session.sequence,1);
});

test('commands on newly looted items remap checkpoint IDs inside the transaction',async()=>{
 const f=await fixture();
 f.checkpoint.state.combat=null;
 f.checkpoint.state.pending.push({id:7074,uid:'new-drop',count:2});
 const result=await f.service.command('a',{...f.command,type:'loot',uids:['new-drop']});
 assert.equal(result.state.pending.some((item:any)=>item.id===7074),false);
 const looted=result.state.bag.find((item:any)=>item.id===7074);
 assert.equal(looted.count,2);assert.notEqual(looted.uid,'new-drop');
});

test('checkpoint ownership and command ownership must match before any state changes',async()=>{
 const f=await fixture(),before=await f.service.snapshot('a');
 for(const localCheckpoint of [null,{...f.checkpoint,type:'claim'},{...f.checkpoint,characterId:'other'},{...f.checkpoint,clientId:'other'},{...f.checkpoint,sessionId:'other'}]){
  await assert.rejects(f.service.command('a',{...f.command,localCheckpoint}),{code:'LOCAL_STATE'});
 }
 assert.equal((await f.service.snapshot('a')).revision,before.revision);
});

test('a checkpoint which finishes an activity permits the following command without a stale lease',async()=>{
 const f=await fixture();f.checkpoint.state.combat=null;f.checkpoint.state.activity={type:'idle'};f.checkpoint.state.rest=null;
 const result=await f.service.command('a',f.command);
 assert.equal(result.state.settings.autoLoot,true);assert.equal(result.localSimulation,null);
 assert.equal(await f.store.read(tx=>tx.get('actor_leases',f.command.characterId)),null);
});
