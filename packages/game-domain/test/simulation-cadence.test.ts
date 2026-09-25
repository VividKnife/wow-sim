import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationInterval, simulationTickBudget} from '../src/simulation-cadence.ts';
import {GameService} from '../src/service.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import type {Activity,Instance,Character} from '../src/model.ts';
import type {Store, Transaction} from '../../persistence/src/store.ts';

test('only recently observed combat uses the fast cadence',()=>{
 assert.equal(simulationInterval({},1000,1200),200);
 assert.equal(simulationInterval({},1000,6000),1000);
 assert.equal(simulationInterval(null,1000,1200),1000);
});
async function fixture(){
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>12345});
 const initial=await service.createAccount('a',{name:'实时',classId:8,raceId:1},'create');
 return {store,service,id:initial.state.id,time:(value:number)=>{now=value;}};
}
test('personal automatic combat publishes a recording and waits for its real deadline',async()=>{
 const f=await fixture();
 await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
 // First pull starts at the ordinary activity deadline, then combat is fast.
 f.time(2000);assert.deepEqual((await f.service.work()).errors,[]);
 let s=await f.service.snapshot('a',f.id,true);assert.ok(s.state.combat);
 const activity=s.activities.find(a=>a.type==='personal')!;
 assert.equal(s.combatMode,'recorded');assert.ok(s.playback);assert.equal(activity.nextEventAt,s.playback.endsAt);
 f.time(2200);assert.equal((await f.service.work()).activities,0);
 s=await f.service.snapshot('a',f.id,true);assert.equal(s.state.wallAt,2000);
 f.time(activity.nextEventAt);assert.deepEqual((await f.service.work()).errors,[]);
 assert.equal((await f.service.snapshot('a')).state.wallAt,activity.nextEventAt);
});
test('shared instances publish subsecond snapshots without waiting for a command',async()=>{
 const f=await fixture();
 const formed=await f.service.command('a',{type:'createInstance',requestId:'form'});
 await f.service.createAccount('b',{name:'访客',classId:1,raceId:1},'create');
 await f.service.command('b',{type:'joinInstance',instanceId:formed.instanceId,requestId:'join'});
 await f.service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
 let instance=(await f.store.transaction(tx=>tx.get<Instance>('instances',formed.instanceId!)))!;
 assert.ok(instance.simulation?.combat);assert.equal(instance.nextEventAt,1200);
 f.time(1200);assert.deepEqual((await f.service.work()).errors,[]);
 const snapshot=await f.service.snapshot('a',f.id,true);
 assert.equal(snapshot.state.wallAt,1200);assert.ok(snapshot.instance!.sequence>1);
 assert.equal(snapshot.combatMode,'realtime');assert.equal(snapshot.playback,null);
 instance=(await f.store.transaction(tx=>tx.get<Instance>('instances',formed.instanceId!)))!;
 assert.equal(instance.nextEventAt,1400);
});

test('polling heartbeat does not modify account revision or enter a critical transaction',async()=>{
 const f=await fixture();
 let critical=0,reads=0;
 const tracked:Store={close:async()=>{},heartbeat:f.store.heartbeat.bind(f.store),
  read:async work=>{reads++;return f.store.read(work);},
  transaction:async work=>{critical++;return f.store.transaction(work);}};
 const before=await f.store.read(tx=>tx.get('accounts','a'));
 const service=new GameService(tracked,{contentVersion:'test',now:()=>2200});
 await service.snapshot('a',f.id,true);
 assert.equal(critical,0);assert.equal(reads,1);
 assert.deepEqual(await f.store.read(tx=>tx.get('accounts','a')),before);
 assert.equal((await f.store.read(tx=>tx.get('account_presence','a')))!.lastSeenAt,2200);
 await service.snapshot('a',f.id,true);
 assert.equal(critical,0);
});

test('observed instance catch-up commits bounded progress and eventually catches up',async()=>{
 const f=await fixture();
 const formed=await f.service.command('a',{type:'createInstance',requestId:'form'});
 await f.service.createAccount('b',{name:'访客',classId:1,raceId:1},'create');
 await f.service.command('b',{type:'joinInstance',instanceId:formed.instanceId,requestId:'join'});
 await f.service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
 f.time(5000);await f.service.snapshot('a',f.id,true);
 assert.equal(simulationTickBudget(11000,11000),20);
 assert.equal(simulationTickBudget(1000,11000),20000);
 assert.deepEqual((await f.service.work()).errors,[]);
 let state=(await f.service.snapshot('a')).state;
 assert.ok(state.wallAt>1000&&state.wallAt<5000);
 for(let i=0;i<10&&state.wallAt<5000;i++){
  assert.deepEqual((await f.service.work()).errors,[]);
  state=(await f.service.snapshot('a')).state;
 }
 assert.equal(state.wallAt,5000);
});
