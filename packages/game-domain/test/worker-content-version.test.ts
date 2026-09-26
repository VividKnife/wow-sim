import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';

test('workers skip incompatible activities before leases or simulation and cannot starve current work',async()=>{
 const store=new MemoryStore();let now=1000;
 const old=new GameService(store,{contentVersion:'old',now:()=>now,seed:()=>283});
 await old.createAccount('old-personal',{name:'Old',classId:8,raceId:1},'create');
 await old.command('old-personal',{type:'hunt',id:299,requestId:'hunt'});
 await old.createAccount('old-instance',{name:'Old party',classId:8,raceId:1},'create');
 const formed=await old.command('old-instance',{type:'createInstance',requestId:'form'});
 await old.command('old-instance',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
 const before=await store.read(async tx=>({activities:await tx.list('activities'),instances:await tx.list('instances'),leases:await tx.list('instance_leases')}));
 now=2000;
 const current=new GameService(store,{contentVersion:'current',now:()=>now,seed:()=>283});
 for(let i=0;i<10;i++)assert.deepEqual(await current.work(now+i,1),{activities:0,instances:0,errors:[]});
 assert.deepEqual(await store.read(async tx=>({activities:await tx.list('activities'),instances:await tx.list('instances'),leases:await tx.list('instance_leases')})),before);
 await current.createAccount('new',{name:'New',classId:8,raceId:1},'create');
 await current.command('new',{type:'hunt',id:299,requestId:'hunt'});
 now=3000;
 const result=await current.work(now,1);assert.equal(result.activities,1);assert.deepEqual(result.errors,[]);
 // Recovery does not advance old rules or require a working local session.
 const recovered=await current.command('old-personal',{type:'unstuck',requestId:'recover'});
 assert.equal(recovered.state.activity.type,'idle');assert.equal(recovered.localSimulation,null);
});
