import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {stats} from '../src/rules/character.js';

test('a visiting player keeps their learned abilities after shared-instance kills',async()=>{
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>1234});
 for(const account of ['a','b']){
  const id=(await service.createAccount(account,{name:account,classId:8,raceId:1},'create')).account.primaryCharacterId;
  await store.transaction(async tx=>{const c=await tx.get<any>('characters',id);c.rules.level=10;const st:any=stats(c.rules);c.rules.hp=st.maxHp;c.rules.mana=st.maxMana;await tx.put('characters',c);});
 }
 const before=(await service.snapshot('b')).state.learned;
 const instanceId=(await service.command('a',{type:'createInstance',requestId:'instance'})).instanceId;
 await service.command('b',{type:'joinInstance',instanceId,requestId:'join'});
 await service.command('a',{type:'startInstance',instanceId,requestId:'start'});
 now=61000;assert.deepEqual((await service.work()).errors,[]);
 assert.deepEqual((await service.snapshot('b')).state.learned,before);
});
