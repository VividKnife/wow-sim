import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {makeItem} from '../src/rules/character.js';
import {view} from '../src/rules/engine.js';
import {tradable} from '../src/rules/inventory.js';
import type {Item} from '../src/model.ts';

async function fixture(){
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>1000});
 const hero=(await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 const helper=(await service.command('a',{type:'createCompanion',name:'Helper',classId:8,raceId:1,requestId:'helper'})).roster.find(row=>row.id!==hero)!.id;
 await service.command('a',{type:'setParty',characterIds:[hero,helper],requestId:'party'});
 async function reward(uid:string,extra={}){
  const item={...makeItem({itemSequence:0},80),...extra};assert.equal(item.bound,true);
  await store.transaction(tx=>tx.insert('items',{id:uid,accountId:'a',ownerCharacterId:hero,container:'bag',position:100,data:item,source:'boss-loot'}));
 }
 const row=(uid:string)=>store.transaction(tx=>tx.get<Item>('items',uid));
 return {store,service,hero,helper,reward,row};
}

test('bound loot can move to an NPC, be replaced and return without duplication or loss of metadata',async()=>{
 const f=await fixture();
 await f.reward('loot',{durability:7,enchant:123,locked:true,ownerId:f.hero});
 const before=await f.service.snapshot('a');
 assert.ok(view(before.state).party.find((p:any)=>p.id===f.helper).equippable.includes('loot'));
 await f.service.command('a',{type:'equip',uid:'loot',target:f.helper,requestId:'equip'});
 assert.equal((await f.row('loot'))!.ownerCharacterId,f.helper);
 assert.equal((await f.row('loot'))!.data.ownerId,f.helper);
 await f.reward('replacement');
 await f.service.command('a',{type:'equip',uid:'replacement',target:f.helper,requestId:'replace'});
 assert.equal((await f.row('loot'))!.container,'bag');
 await f.service.command('a',{type:'equip',characterId:f.helper,uid:'loot',target:f.hero,requestId:'return'});
 const item=(await f.row('loot'))!;
 assert.equal(item.ownerCharacterId,f.hero);
 assert.equal(item.data.ownerId,f.hero);
 assert.equal(item.container,'equipment');
 assert.equal(item.data.bound,true);
 assert.equal(item.data.durability,7);
 assert.equal(item.data.enchant,123);
 assert.equal(item.data.locked,true);
 assert.equal(tradable(item.data),false);
 assert.equal((await f.store.transaction(tx=>tx.list<Item>('items'))).filter(i=>i.id==='loot').length,1);
});

test('issued equipment remains exclusive to its character',async()=>{
 const f=await fixture();await f.reward('issued',{issued:true,ownerId:f.hero});
 await assert.rejects(f.service.command('a',{type:'equip',uid:'issued',target:f.helper,requestId:'equip'}),/无法装备|配发装备/);
 assert.equal((await f.row('issued'))!.ownerCharacterId,f.hero);
});

test('bound equipment cannot be sent to another account',async()=>{
 const f=await fixture();await f.reward('loot');
 const other=(await f.service.createAccount('b',{name:'Other',classId:8,raceId:1},'create')).account.primaryCharacterId;
 await assert.rejects(f.service.command('a',{type:'equip',uid:'loot',target:other,requestId:'equip'}),/不能控制其他账号/);
 assert.equal((await f.row('loot'))!.ownerCharacterId,f.hero);
});
