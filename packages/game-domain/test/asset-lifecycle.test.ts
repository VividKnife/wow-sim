import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {context,persistAssets} from '../src/context.ts';
import {makeItem} from '../src/rules/character.js';
import {itemIdentity,nextItemIdentity} from '../src/rules/item-identity.js';
import {storageAction,auctionSell,settleAuctions} from '../src/rules/inventory.js';
import {collectLoot} from '../src/rules/loot.js';
import type {Character,Item,Rules} from '../src/model.ts';

async function fixture(){
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'identity-test',now:()=>1000,seed:()=>123});
 const a=(await service.createAccount('a',{name:'One',classId:8,raceId:1},'create')).state;
 const b=(await service.createAccount('b',{name:'Two',classId:8,raceId:1},'create')).state;
 const mutate=(id:string,key:string,action:(s:Rules)=>void)=>store.transaction(async tx=>{
  const c=(await tx.get<Character>('characters',id))!,s=await context(tx,c,1000,false);
  action(s);const before=structuredClone(s);
  await persistAssets(tx,c,s,key);
  assert.deepEqual(s,before,'persistence cannot rewrite identities in a detached runtime checkpoint');
  return s;
 });
 return {store,service,a,b,mutate};
}

test('item allocation is deterministic, scoped, checkpointable and does not consume RNG',()=>{
 const a={id:'a:b',itemSequence:0,rngState:123},b={id:'a%3Ab',itemSequence:0,rngState:123};
 assert.notEqual(itemIdentity(a),itemIdentity(b));
 const first=nextItemIdentity(a),saved=structuredClone(a),next=nextItemIdentity(a);
 assert.notEqual(first,next);assert.equal(nextItemIdentity(saved),next);assert.equal(a.rngState,123);
 const exhausted={id:'a',itemSequence:Number.MAX_SAFE_INTEGER};
 assert.throws(()=>nextItemIdentity(exhausted),/序号/);assert.equal(exhausted.itemSequence,Number.MAX_SAFE_INTEGER);
 assert.throws(()=>makeItem({itemSequence:0},2589),/身份/);
});

test('issued loot keeps its ID through durable pickup, storage, auction escrow and cancellation',async()=>{
 const f=await fixture(),ids=(s:Rules)=>[...s.bag,...s.bags,...Object.values(s.equipment)].map((i:any)=>i.uid);
 assert.equal(new Set([...ids(f.a),...ids(f.b)]).size,ids(f.a).length+ids(f.b).length,'starter items must be distinct for different characters');
 let uid='';
 await f.mutate(f.a.id,'drop',s=>{const item=makeItem(s,2589,2);uid=item.uid;s.pending.push({...item,lootBattleId:'kill-1'});});
 assert.equal((await f.store.read(tx=>tx.get<Item>('items',uid)))!.container,'pending');
 await f.mutate(f.a.id,'pickup',s=>collectLoot(s,[uid]));
 await f.mutate(f.a.id,'bank',s=>{s.location='stormwind';storageAction(s,{type:'bankDeposit',uid,count:2});});
 assert.equal((await f.store.read(tx=>tx.get<Item>('items',uid)))!.container,'bank');
 await f.mutate(f.a.id,'withdraw',s=>{s.location='stormwind';storageAction(s,{type:'bankWithdraw',uid,count:2});});
 await f.mutate(f.a.id,'list',s=>auctionSell(s,uid));
 const escrow=(await f.store.read(tx=>tx.get<Item>('items',uid)))!;
 assert.equal(escrow.container,'auctions');assert.equal(escrow.data.item.uid,uid);assert.equal(escrow.data.id,uid);
 await f.mutate(f.a.id,'cancel',s=>storageAction(s,{type:'auctionCancel',id:uid}));
 assert.equal((await f.store.read(tx=>tx.get<Item>('items',uid)))!.container,'bag');
 await f.mutate(f.a.id,'relist',s=>auctionSell(s,uid));
 const paid=await f.mutate(f.a.id,'sold',s=>{s.clock+=30000;settleAuctions(s);});
 assert.equal(await f.store.read(tx=>tx.get<Item>('items',uid)),null);
 assert.ok(paid.money>f.a.money);
 const again=await f.mutate(f.a.id,'retry-sale',s=>settleAuctions(s));assert.equal(again.money,paid.money);
});

test('asset-only writes save allocation cursors and rejected ownership or duplicate placement rolls back',async()=>{
 const f=await fixture();let first='',second='';
 await f.mutate(f.a.id,'first',s=>{const item=makeItem(s,25);first=item.uid;s.bag.push(item);});
 await f.mutate(f.a.id,'remove',s=>{s.bag=s.bag.filter((i:Rules)=>i.uid!==first);});
 await f.mutate(f.a.id,'second',s=>{const item=makeItem(s,25);second=item.uid;s.bag.push(item);});
 assert.notEqual(first,second,'removed IDs must not be reused after reload');
 const before=await f.store.read(async tx=>({items:await tx.list('items'),characters:await tx.list('characters'),wallets:await tx.list('wallets')}));
 await assert.rejects(f.mutate(f.b.id,'steal',s=>{s.bag.push({...makeItem(s,25),uid:second});s.money+=100;}),/跨角色/);
 await assert.rejects(f.mutate(f.a.id,'duplicate',s=>{s.bank.push({...s.bag.find((i:Rules)=>i.uid===second)});s.money+=100;}),/两个位置/);
 await assert.rejects(f.mutate(f.a.id,'replace-template',s=>{s.bag.find((i:Rules)=>i.uid===second).id=80;}),/替换物品类型/);
 assert.deepEqual(await f.store.read(async tx=>({items:await tx.list('items'),characters:await tx.list('characters'),wallets:await tx.list('wallets')})),before);
});
