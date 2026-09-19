import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {seedCompanion} from './support/characters.ts';
import {makeItem} from '../src/rules/character.js';
import type {Item,Character} from '../src/model.ts';

async function fixture(){
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>1000});
 const hero=(await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 const helper=(await seedCompanion(service,'a',{name:'Helper',classId:1})).roster.find(c=>c.id!==hero)!.id;
 const add=async(owner:string,uid:string,id=2589,count=1,extra={})=>store.transaction(tx=>tx.insert('items',{id:uid,accountId:'a',ownerCharacterId:owner,container:'bag',position:100,data:{...makeItem({itemSequence:0},id,count),...extra},source:'test'}));
 const move=(items:any[],requestId='move',recipientId=helper,characterId=hero)=>service.command('a',{type:'transferItems',characterId,recipientId,items,requestId});
 const row=(uid:string)=>store.transaction(tx=>tx.get<Item>('items',uid));
 return {store,service,hero,helper,add,move,row};
}
test('batch transfer preserves bound equipment identity and metadata; split stacks merge and requests replay once',async()=>{
 const f=await fixture();
 await f.add(f.hero,'gear',80,1,{bound:true,ownerId:f.hero,enchant:123,durability:7});
 await f.add(f.hero,'cloth',2589,10);await f.add(f.helper,'existing',2589,15);
 const selection=[{uid:'gear',count:1},{uid:'cloth',count:7}];
 await f.move(selection);await f.move(selection);
 const gear=(await f.row('gear'))!;
 assert.equal(gear.ownerCharacterId,f.helper);assert.equal(gear.data.ownerId,f.helper);
 assert.equal(gear.data.enchant,123);assert.equal(gear.data.durability,7);assert.equal(gear.data.bound,true);
 assert.equal((await f.row('cloth'))!.data.count,3);
 const bag=(await f.service.snapshot('a',f.helper)).state.bag;
 assert.equal(bag.filter((i:any)=>i.id===2589).reduce((n:number,i:any)=>n+i.count,0),22);
 assert.equal((await f.row('existing'))!.data.count,20);
 await f.move([{uid:'gear',count:1}],'return',f.hero,f.helper);
 assert.equal((await f.row('gear'))!.ownerCharacterId,f.hero);
});
test('a full recipient bag accepts merging but rejects an overflowing batch atomically',async()=>{
 const f=await fixture();await f.add(f.hero,'cloth',2589,10);await f.add(f.hero,'gear',80);
 await f.add(f.helper,'existing',2589,15);
 const initial=(await f.service.snapshot('a',f.helper)).state.bag.length;
 for(let n=initial;n<16;n++)await f.add(f.helper,'filler'+n,80);
 await f.move([{uid:'cloth',count:5}]);
 await assert.rejects(f.move([{uid:'cloth',count:1},{uid:'gear',count:1}],'full'),/空间不足/);
 assert.equal((await f.row('cloth'))!.data.count,5);assert.equal((await f.row('gear'))!.ownerCharacterId,f.hero);
});
test('invalid selections, protected items, foreign actors and different locations cannot transfer',async()=>{
 const f=await fixture();await f.add(f.hero,'cloth',2589,10);
 for(const [n,items] of [[],[{uid:'cloth',count:0}],[{uid:'cloth',count:1.5}],[{uid:'cloth',count:11}],[{uid:'cloth',count:1},{uid:'cloth',count:1}],[{uid:'missing',count:1}]].entries())
  await assert.rejects(f.move(items,'invalid'+n));
 for(const [uid,extra]of [['locked',{locked:true}],['issued',{issued:true}]] as const){await f.add(f.hero,uid,2589,1,extra);await assert.rejects(f.move([{uid,count:1}],uid),/锁|配发/);}
 await assert.rejects(f.move([{uid:'cloth',count:10},{uid:'locked',count:1}],'batch-rollback'),/锁/);
 assert.equal((await f.row('cloth'))!.ownerCharacterId,f.hero);
 assert.equal((await f.row('cloth'))!.data.count,10);
 const foreign=(await f.service.createAccount('b',{name:'Foreign',classId:1,raceId:1},'create')).account.primaryCharacterId;
 await assert.rejects(f.move([{uid:'cloth',count:1}],'foreign',foreign),/不属于/);
 await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',f.helper))!;c.rules.location='stormwind';await tx.put('characters',c);});
 await assert.rejects(f.move([{uid:'cloth',count:1}],'remote'),/同一地点/);
 assert.equal((await f.row('cloth'))!.data.count,10);
});
test('followers can transfer between pulls but not during shared combat or travel',async()=>{
 const f=await fixture();await f.add(f.helper,'cloth',2589,3);
 await f.service.command('a',{type:'setParty',characterIds:[f.hero,f.helper],requestId:'party'});
 await f.store.transaction(async tx=>{
  const leader=(await tx.get<Character>('characters',f.hero))!,helper=(await tx.get<Character>('characters',f.helper))!;
  await tx.insert('activities',{id:'hunt',accountId:'a',actorId:f.hero,type:'personal',status:'running',location:leader.rules.location,startedAt:1000,settledUntil:1000,nextEventAt:2000,contentVersion:'test',rngState:leader.rules.rngState,engineActivity:{type:'hunt',target:299},participantIds:[f.hero,f.helper]});
  await f.service.lock(tx,leader,'activity','hunt');await f.service.lock(tx,helper,'activity','hunt');
 });
 await f.move([{uid:'cloth',count:1}],'follower',f.hero,f.helper);
 assert.equal((await f.store.transaction(tx=>tx.list('actor_leases'))).length,2);
 for(const mode of ['combat','travel']){
  await f.store.transaction(async tx=>{
   const c=(await tx.get<Character>('characters',f.hero))!;c.rules.combat=mode==='combat'?{id:'fight'}:null;await tx.put('characters',c);
   const a=(await tx.get('activities','hunt'))!;if(mode==='travel')a.engineActivity={type:'travel'};await tx.put('activities',a);
  });
  await assert.rejects(f.move([{uid:'cloth',count:1}],mode,f.hero,f.helper),/战斗或赶路/);
 }
 assert.equal((await f.row('cloth'))!.data.count,2);
});
