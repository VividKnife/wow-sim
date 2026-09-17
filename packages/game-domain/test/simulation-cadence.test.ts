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
test('personal combat settles consecutive 200 ms updates and slows down after presence expires',async()=>{
 const f=await fixture();
 await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
 // First pull starts at the ordinary activity deadline, then combat is fast.
 f.time(2000);assert.deepEqual((await f.service.work()).errors,[]);
 let s=await f.service.snapshot('a',f.id,true);assert.ok(s.state.combat);
 let activity=s.activities.find(a=>a.type==='personal')!;assert.equal(activity.nextEventAt,2200);
 f.time(2200);await f.service.work();s=await f.service.snapshot('a',f.id,true);assert.equal(s.state.wallAt,2200);
 activity=s.activities.find(a=>a.type==='personal')!;assert.equal(activity.nextEventAt,2400);
 // Keep the fight alive so the offline cadence assertion is independent of DPS.
 await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',f.id))!;c.rules.hp=100000;await tx.put('characters',c);const a=(await tx.get<Activity>('activities',activity.id))!;a.engineActivity={type:'hunt',target:299};await tx.put('activities',a);});
 f.time(7200);await f.service.work();
 const offline=await f.store.transaction(tx=>tx.get<Activity>('activities',activity.id));
 assert.equal(offline?.status,'running');assert.equal(offline!.nextEventAt,8200);
});
test('shared instances publish subsecond snapshots without waiting for a command',async()=>{
 const f=await fixture();
 const formed=await f.service.command('a',{type:'createInstance',requestId:'form'});
 await f.service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
 let instance=(await f.store.transaction(tx=>tx.get<Instance>('instances',formed.instanceId!)))!;
 assert.ok(instance.simulation?.combat);assert.equal(instance.nextEventAt,1200);
 f.time(1200);assert.deepEqual((await f.service.work()).errors,[]);
 const snapshot=await f.service.snapshot('a',f.id,true);
 assert.equal(snapshot.state.wallAt,1200);assert.ok(snapshot.instance!.sequence>1);
 instance=(await f.store.transaction(tx=>tx.get<Instance>('instances',formed.instanceId!)))!;
 assert.equal(instance.nextEventAt,1400);
});

test('polling presence writes are throttled and commit before snapshot assembly',async()=>{
 const f=await fixture();
 const transactions: {writes:string[];reads:string[]}[]=[];
 const tracked:Store={close:async()=>{},transaction:async work=>f.store.transaction(async tx=>{
  const record={writes:[] as string[],reads:[] as string[]};transactions.push(record);
  const wrapped:Transaction={...tx,
   get:async (table,id)=>{record.reads.push(table);return tx.get(table,id);},
   put:async (table,row)=>{record.writes.push(table);return tx.put(table,row);}
  };
  return work(wrapped);
 })};
 const service=new GameService(tracked,{contentVersion:'test',now:()=>2200});
 await service.snapshot('a',f.id,true);
 const heartbeat=transactions.find(t=>t.writes.includes('accounts'))!;
 assert.ok(heartbeat);
 assert.deepEqual(heartbeat.reads,['accounts','accounts']);
 assert.ok(transactions.some(t=>t.reads.includes('characters')&&!t.writes.includes('accounts')));
 transactions.length=0;
 await service.snapshot('a',f.id,true);
 assert.ok(transactions.every(t=>!t.writes.includes('accounts')));
});

test('observed instance catch-up commits bounded progress and eventually catches up',async()=>{
 const f=await fixture();
 const formed=await f.service.command('a',{type:'createInstance',requestId:'form'});
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
