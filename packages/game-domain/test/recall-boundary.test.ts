import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';

test('personal combat cannot release its actor lease through background recall',async()=>{
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>12345});
 const hero=(await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 await store.transaction(async tx=>{const character=await tx.get<any>('characters',hero);character.rules.location='northwood';await tx.put('characters',character);});
 await service.command('a',{type:'hunt',id:6,requestId:'hunt'});
 now=2100;assert.deepEqual((await service.work()).errors,[]);
 const snapshot=await service.snapshot('a');assert.ok(snapshot.state.combat);
 const activity=snapshot.activities.find(row=>row.status==='running')!;
 await assert.rejects(service.command('a',{type:'recall',activityId:activity.id,requestId:'recall'}),/召回只适用于/);
 assert.ok(await store.transaction(tx=>tx.get('actor_leases',hero)));
 await assert.rejects(service.command('a',{type:'createInstance',requestId:'instance'}),/另一项活动/);
});
