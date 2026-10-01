import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PostgresStore} from '../src/postgres.ts';
import {DatabaseOperationError} from '../src/store.ts';
import type {SqlPool} from '../src/postgres.ts';
import {GameService} from '../../game-domain/src/service.ts';
import {advance} from '../../game-domain/src/rules/engine.js';

function embeddedPool(db:PGlite):SqlPool {
 let tail=Promise.resolve();
 return {
  async connect(){const prior=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await prior;
   return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};
  },
  end:()=>db.close(),
 };
}

test('SQL due query filters rule versions before LIMIT for activities and instances',async()=>{
 const store=new PostgresStore(embeddedPool(new PGlite()));
 try{
  await store.initialize();
  await store.transaction(async tx=>{
   for(const table of ['activities','instances'] as const){
    await tx.insert(table,{id:'old',status:'running',nextEventAt:0,contentVersion:'old'});
    await tx.insert(table,{id:'new',status:'running',nextEventAt:10,contentVersion:'current'});
    assert.deepEqual((await tx.due<any>(table,20,1,'current')).map(row=>row.id),['new']);
   }
  });
  for(const table of ['activities','instances'] as const)assert.deepEqual((await store.read(tx=>tx.due<any>(table,20,1,'old'))).map(row=>row.id),['old']);
 }finally{await store.close();}
});



test('PostgreSQL schema enforces uniqueness and rollback with real SQL',async()=>{
 const db=new PGlite(),store=new PostgresStore(embeddedPool(db));
 try{
  await store.initialize();await store.initialize();
  await store.transaction(async tx=>{
   await tx.insert('wallets',{id:'w',characterId:'char',balance:100});
   await tx.insert('actor_leases',{id:'job',actorId:'char'});
  });
  await assert.rejects(store.transaction(tx=>tx.insert('actor_leases',{id:'instance',actorId:'char'})),error=>error instanceof DatabaseOperationError && (error.cause as any)?.code==='23505');
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
   const row = (await tx.get('account_presence', 'recreate'))!;
   delete row.lastSeenAt;
   await tx.put('account_presence', row);
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

test('ownership lookups use generated-column indexes while preserving exact JSON containment semantics',async()=>{
 const db=new PGlite(),observed:{sql:string;values?:any[]}[]=[],base=embeddedPool(db);
 const pool:SqlPool={connect:async()=>{const client=await base.connect();return {...client,query:async(sql,values)=>{if(sql.startsWith('SELECT data FROM items WHERE'))observed.push({sql,values});return client.query(sql,values);}};},end:()=>base.end()};
 const store=new PostgresStore(pool);
 try{
  await store.initialize();
  // Many independent owners make an unscoped scan observably different from
  // the ownership index; this is not just an assertion about SQL spelling.
  await db.exec(`INSERT INTO items(id,data) SELECT 'i'||n,jsonb_build_object('id','i'||n,'ownerCharacterId','owner-'||n,'accountId','a-'||n,'count',1) FROM generate_series(1,3000) n;
   INSERT INTO items(id,data) VALUES ('missing','{"id":"missing"}'),('null','{"id":"null","ownerCharacterId":null}'),('number','{"id":"number","ownerCharacterId":7}'),('string','{"id":"string","ownerCharacterId":"7"}');ANALYZE items;`);
  const rows=await store.read(tx=>tx.list<any>('items',{ownerCharacterId:'owner-1573',accountId:'a-1573'}));
  assert.deepEqual(rows.map(r=>r.id),['i1573']);
  const {sql,values}=observed.at(-1)!;
  const plan=await db.query('EXPLAIN (FORMAT JSON) '+sql,values);
  const encoded=JSON.stringify(plan.rows);
  assert.match(encoded,/items_(?:owner|account)_idx/);assert.doesNotMatch(encoded,/Seq Scan/);
  assert.deepEqual((await store.read(tx=>tx.list<any>('items',{ownerCharacterId:null}))).map(r=>r.id),['null']);
  assert.deepEqual((await store.read(tx=>tx.list<any>('items',{ownerCharacterId:7}))).map(r=>r.id),['number']);
  assert.deepEqual((await store.read(tx=>tx.list<any>('items',{ownerCharacterId:'7'}))).map(r=>r.id),['string']);
  assert.deepEqual(await store.read(tx=>tx.list('items',{'ownerCharacterId); DROP TABLE items;--':'owner-1'})),[]);
  assert.equal((await store.read(tx=>tx.list('items'))).length,3004);
 }finally{await store.close();}
});
