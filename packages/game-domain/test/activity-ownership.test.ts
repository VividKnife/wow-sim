import {seedCompanion} from './support/characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';

test('a travelling party member cannot settle or release its leader activity',async()=>{
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>1000});
 const hero=(await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 const roster=(await seedCompanion(service,'a',{type:'createCompanion',name:'Helper',classId:1,raceId:1,requestId:'helper'})).roster;
 const helper=roster.find(row=>row.id!==hero)!.id;
 await service.command('a',{type:'setParty',characterIds:[hero,helper],requestId:'party'});
 await service.command('a',{type:'travel',to:'northwood',requestId:'travel'});
 for(const type of ['sync','settings'])await assert.rejects(service.command('a',{type,characterId:helper,requestId:type}),/活动发起者/);
 assert.equal((await store.transaction(tx=>tx.list('actor_leases'))).length,2);
 assert.equal((await service.snapshot('a')).state.activity.type,'travel');
});
