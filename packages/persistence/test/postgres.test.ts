import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PostgresStore} from '../src/postgres.ts';
import type {SqlPool} from '../src/postgres.ts';
import {GameService} from '../../game-domain/src/service.ts';

function embeddedPool(db:PGlite):SqlPool {
 let tail=Promise.resolve();
 return {
  async connect(){const prior=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await prior;
   return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};
  },
  end:()=>db.close(),
 };
}

test('PostgreSQL schema enforces uniqueness and rollback with real SQL',async()=>{
 const db=new PGlite(),store=new PostgresStore(embeddedPool(db));
 try{
  await store.initialize();await store.initialize();
  await store.transaction(async tx=>{
   await tx.insert('wallets',{id:'w',characterId:'char',balance:100});
   await tx.insert('actor_leases',{id:'job',actorId:'char'});
  });
  await assert.rejects(store.transaction(tx=>tx.insert('actor_leases',{id:'instance',actorId:'char'})),/unique/i);
  await assert.rejects(store.transaction(async tx=>{
   await tx.put('wallets',{id:'w',characterId:'char',balance:0});
   await tx.insert('outbox',{id:'award',status:'pending'});
   throw new Error('delivery failed');
  }),/delivery failed/);
  await store.transaction(async tx=>{
   assert.equal((await tx.get<any>('wallets','w')).balance,100);
   assert.deepEqual(await tx.list('outbox'),[]);
   assert.equal((await tx.list('actor_leases',{actorId:'char'})).length,1);
   await tx.delete('actor_leases','job');
  });
  await assert.rejects(db.query('INSERT INTO wallets(id,data) VALUES($1,$2)', ['bad',{id:'bad',balance:-1}]),/wallet_balance/);
  const columns=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='activities'");
  assert.ok(columns.rows.some((r:any)=>r.column_name==='next_event_at'));
 }finally{await store.close();}
});

test('invalid save recreation rolls back failed creation and persists a clean replacement in SQL', async () => {
 const store = new PostgresStore(embeddedPool(new PGlite()));
 try {
  await store.initialize();
  const service = new GameService(store, {contentVersion: 'test', now: () => 1000});
  const input = {name: 'Reborn', classId: 8, raceId: 1};
  const old = await service.createAccount('recreate', input, 'create');
  await service.command('recreate', {type: 'travel', to: 'goldshire', requestId: 'travel'});
  await store.transaction(async tx => {
   const row = (await tx.get('accounts', 'recreate'))!;
   delete row.lastSeenAt;
   await tx.put('accounts', row);
  });
  await assert.rejects(service.createAccount('recreate', {...input, classId: 999}, 'bad'), {code: 'INVALID_CHARACTER'});
  assert.ok(await store.transaction(tx => tx.get('characters', old.state.id)));
  assert.equal((await store.transaction(tx => tx.list('activities'))).length, 1);
  const created = await service.createAccount('recreate', input, 'create');
  assert.notEqual(created.state.id, old.state.id);
  await store.transaction(async tx => {
   assert.equal(await tx.get('characters', old.state.id), null);
   assert.deepEqual(await tx.list('items', {ownerCharacterId: old.state.id}), []);
   assert.deepEqual(await tx.list('activities'), []);
   assert.deepEqual(await tx.list('actor_leases'), []);
  });
  const restarted = new GameService(store, {contentVersion: 'test', now: () => 1000});
  assert.equal((await restarted.snapshot('recreate')).state.id, created.state.id);
  assert.equal((await restarted.createAccount('recreate', input, 'create')).state.id, created.state.id);
 } finally { await store.close(); }
});

test('store rejects unknown SQL identifiers and expired transaction handles',async()=>{
 const store=new PostgresStore(embeddedPool(new PGlite()));
 try{
  await store.initialize();let escaped:any;
  await store.transaction(async tx=>{escaped=tx;await tx.insert('accounts',{id:'a'});});
  await assert.rejects(escaped.get('accounts','a'),/closed/);
  await assert.rejects(store.transaction(tx=>tx.list('accounts; DROP TABLE wallets' as any)),/Unknown/);
  assert.equal((await store.transaction(tx=>tx.list('accounts'))).length,1);
 }finally{await store.close();}
});

test('a reserved manufacturing order survives a database restart and pays out once',async()=>{
 const db=new PGlite(),store=new PostgresStore(embeddedPool(db));
 await store.initialize();
 const service=new GameService(store,{contentVersion:'restart-test',now:()=>1000});
 const created=await service.createAccount('restart-account',{name:'制造师',classId:8,raceId:1},'create-account');
 const id=created.account.primaryCharacterId;
 await store.transaction(async tx=>{
  const character=await tx.get<any>('characters',id);character.rules.professions={firstaid:{skill:1,cap:75}};await tx.put('characters',character);
  await tx.insert('items',{id:'linen',accountId:'restart-account',ownerCharacterId:id,container:'bag',position:100,count:1,itemId:2589,data:{id:2589,count:1,bound:false},source:'test'});
 });
 await service.command('restart-account',{type:'craft',id:'spell-3275',count:1,requestId:'reserve-craft'});
 const archive=await db.dumpDataDir();await store.close();
 const restored=new PostgresStore(embeddedPool(new PGlite({loadDataDir:archive})));
 try{
  const resumed=new GameService(restored,{contentVersion:'restart-test',now:()=>4000});
  assert.deepEqual((await resumed.work()).errors,[]);assert.deepEqual((await resumed.work()).errors,[]);
  const snapshot=await resumed.snapshot('restart-account');
  assert.equal(snapshot.state.bag.filter((item:any)=>item.id===1251).reduce((sum:number,item:any)=>sum+item.count,0),1);
  assert.equal((await restored.transaction(tx=>tx.list('actor_leases'))).length,0);
  assert.equal((await restored.transaction(tx=>tx.list<any>('reservations')))[0].status,'consumed');
 }finally{await restored.close();}
});

test('offline pause survives SQL database reload and returns to the due index on reconnect', async () => {
 const db = new PGlite(), store = new PostgresStore(embeddedPool(db));
 await store.initialize();
 let now = 1000;
 const service = new GameService(store, {contentVersion: 'offline-test', now: () => now, offlineLimitMs: 2000});
 await service.createAccount('offline', {name: 'Traveller', classId: 8, raceId: 1}, 'create');
 await service.command('offline', {type: 'travel', to: 'goldshire', requestId: 'travel'});
 now = 20_000;
 assert.deepEqual((await service.work()).errors, []);
 assert.equal((await service.snapshot('offline')).state.clock, 3000);
 assert.equal((await service.work()).activities, 0);
 const archive = await db.dumpDataDir();
 await store.close();
 const restored = new PostgresStore(embeddedPool(new PGlite({loadDataDir: archive})));
 try {
  const resumed = new GameService(restored, {contentVersion: 'offline-test', now: () => now, offlineLimitMs: 2000});
  assert.equal((await resumed.work()).activities, 0);
  await resumed.snapshot('offline', undefined, true);
  now = 21_000;
  assert.deepEqual((await resumed.work()).errors, []);
  const snapshot = await resumed.snapshot('offline');
  assert.equal(snapshot.state.clock, 4000);
  assert.equal(snapshot.state.location, 'northshire');
 } finally {await restored.close();}
});
