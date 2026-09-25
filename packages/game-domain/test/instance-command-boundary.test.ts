import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';

test('an instance leader cannot bypass profession and manufacturing boundaries',async()=>{
 const store=new MemoryStore();let now=1000;const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>1234});
 const hero=(await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 await store.transaction(async tx=>{const c=await tx.get<any>('characters',hero);c.rules.location='goldshire';c.rules.level=5;c.rules.professions={herbalism:{skill:1,cap:75},mining:{skill:1,cap:75}};await tx.put('characters',c);await tx.put('wallets',{id:hero,characterId:hero,accountId:'a',balance:10000});});
 const instanceId=(await service.command('a',{type:'createInstance',requestId:'instance'})).instanceId;
 await service.command('a',{type:'startInstance',instanceId,requestId:'start'});now=61000;await service.work();
 for(const command of [{type:'learnProfession',id:'alchemy'},{type:'craft',id:'spell-3275',count:1},{type:'travel',to:'northwood'}])await assert.rejects(service.command('a',{...command,requestId:command.type}),/离开实例/);
 assert.equal(Object.keys((await service.snapshot('a')).state.professions).length,2);
});
