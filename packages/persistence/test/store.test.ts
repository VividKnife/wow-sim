import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../src/memory.ts';

test('transactions roll back all asset and delivery writes on failure', async()=>{
 const store=new MemoryStore();
 await store.transaction(async tx=>{await tx.insert('wallets',{id:'a',characterId:'a',balance:10});});
 await assert.rejects(store.transaction(async tx=>{
  await tx.put('wallets',{id:'a',characterId:'a',balance:0});
  await tx.insert('outbox',{id:'award',topic:'settlement'});
  throw new Error('reward failed');
 }),/reward failed/);
 await store.transaction(async tx=>{assert.equal((await tx.get<any>('wallets','a')).balance,10);assert.deepEqual(await tx.list('outbox'),[]);});
});

test('concurrent consumers cannot spend the same balance', async()=>{
 const store=new MemoryStore();
 await store.transaction(tx=>tx.insert('wallets',{id:'a',characterId:'a',balance:10}));
 const spend=()=>store.transaction(async tx=>{
  const wallet=await tx.get<any>('wallets','a');
  await Promise.resolve();
  if(wallet.balance<10)throw new Error('insufficient');
  wallet.balance-=10;await tx.put('wallets',wallet);
 });
 const results=await Promise.allSettled([spend(),spend()]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await store.transaction(async tx=>assert.equal((await tx.get<any>('wallets','a')).balance,0));
});

test('detached reads, equality queries and unique actor leases',async()=>{
 const store=new MemoryStore();
 await store.transaction(async tx=>{
  await tx.insert('characters',{id:'a',accountId:'one',level:1});
  await tx.insert('characters',{id:'b',accountId:'two',level:1});
  const row=await tx.get<any>('characters','a');row.level=60;
  assert.equal((await tx.get<any>('characters','a')).level,1);
  assert.deepEqual((await tx.list<any>('characters',{accountId:'one'})).map(c=>c.id),['a']);
  await tx.insert('actor_leases',{id:'activity-a',actorId:'a'});
 });
 await assert.rejects(store.transaction(tx=>tx.insert('actor_leases',{id:'instance-a',actorId:'a'})),/unique/i);
 await assert.rejects(store.transaction(tx=>tx.put('wallets',{id:'a',characterId:'a',balance:-1})),/balance/i);
});

test('transaction handles expire and failed writes do not poison later transactions',async()=>{
 const store=new MemoryStore();let escaped:any;
 await store.transaction(async tx=>{escaped=tx;await tx.insert('accounts',{id:'a'});});
 await assert.rejects(escaped.put('accounts',{id:'late'}),/closed/i);
 await assert.rejects(store.transaction(tx=>tx.insert('accounts',{id:'a'})),/unique/i);
 await store.transaction(async tx=>{await tx.insert('accounts',{id:'b'});assert.equal((await tx.list('accounts')).length,2);});
});

test('due queue orders events deterministically, bounds work and excludes terminal activities',async()=>{
 const store=new MemoryStore();
 await store.transaction(async tx=>{
  for(const row of [{id:'b',status:'running',nextEventAt:10},{id:'a',status:'returning',nextEventAt:10},{id:'done',status:'completed',nextEventAt:0},{id:'later',status:'running',nextEventAt:30}])await tx.insert('activities',{...row,contentVersion:'current'});
  await tx.insert('activities',{id:'obsolete',status:'running',nextEventAt:0,contentVersion:'old'});
  assert.deepEqual((await tx.due<any>('activities',20,1,'current')).map(row=>row.id),['a']);
  assert.deepEqual((await tx.due<any>('activities',20,10,'current')).map(row=>row.id),['a','b']);
 });
 assert.deepEqual((await store.read(tx=>tx.due<any>('activities',20,1,'current'))).map(row=>row.id),['a']);
});
