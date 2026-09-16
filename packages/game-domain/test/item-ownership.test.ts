import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {makeItem} from '../src/rules/character.js';

test('bind-on-pickup rewards cannot transfer to a companion before first equip',async()=>{
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>1000});
 const hero=(await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 const helper=(await service.command('a',{type:'createCompanion',name:'Helper',classId:8,raceId:1,requestId:'helper'})).roster.find(row=>row.id!==hero)!.id;
 await service.command('a',{type:'setParty',characterIds:[hero,helper],requestId:'party'});
 const item=makeItem({itemSequence:0},80);assert.equal(item.bound,true);
 await store.transaction(tx=>tx.insert('items',{id:'reward-item',accountId:'a',ownerCharacterId:hero,container:'bag',position:100,data:item,source:'quest-reward'}));
 await assert.rejects(service.command('a',{type:'equip',uid:'reward-item',target:helper,requestId:'equip'}),/绑定装备不能转移/);
 assert.equal((await store.transaction(tx=>tx.get<any>('items','reward-item'))).ownerCharacterId,hero);
 assert.ok((await service.snapshot('a')).state.bag.some((row:any)=>row.uid==='reward-item'));
});
