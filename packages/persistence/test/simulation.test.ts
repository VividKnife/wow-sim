import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../src/memory.ts';
import {PostgresStore, type SqlPool} from '../src/postgres.ts';
import {SimulationRepository, type DurableCheckpoint, type TransferBoundary} from '../src/simulation.ts';
import type {Store} from '../src/store.ts';
import {ResidentInstance} from '../../../apps/simulation-host/src/instance.ts';
import type {InstanceCheckpoint} from '../../../apps/simulation-host/src/instance.ts';
import {localScenarios, durableState} from '../../simulation-tests/support/baseline.ts';
import {characterRules, persistCharacter} from '../../game-domain/src/context.ts';
import type {Character} from '../../game-domain/src/model.ts';

function embeddedPool(db: PGlite): SqlPool {
  let tail = Promise.resolve();
  return {async connect() {
    const previous = tail; let release!: () => void; tail = new Promise(resolve => { release = resolve; }); await previous;
    return {query: async (sql, values) => sql.includes('CREATE TABLE') ? (await db.exec(sql), {rows: []}) : db.query(sql, values), release};
  }, end: () => db.close()};
}

test('lease expiry during domain writes rolls back assets and checkpoint together',async()=>{
  const store=new MemoryStore();let now=100;
  const repository=new SimulationRepository(store,()=>now,async tx=>{
    await tx.put('wallets',{id:'actor',characterId:'actor',balance:100});now=1100;
  });
  try{
    const owner=await repository.acquire('slow-commit','host',1000);
    await assert.rejects(repository.commit(owner,1,{instanceId:owner.id,ownerEpoch:owner.epoch,rulesetVersion:'rules',contentHash:'content'}),/fenced/);
    assert.equal(await repository.load(owner.id),null);
    assert.equal(await store.read(tx=>tx.get('wallets','actor')),null);
    assert.equal((await store.read(tx=>tx.get('simulation_owners',owner.id)))!.commitSequence,0);
  }finally{await store.close();}
});

test('SQL: actual hunting loot and its checkpoint commit together without remapping item identity',async()=>{
  const store=new PostgresStore(embeddedPool(new PGlite()));await store.initialize();
  let now=100,calls=0;
  const repository=new SimulationRepository(store,()=>now);
  try {
    const owner=await repository.acquire('asset-room','host-a',1000),initial=localScenarios().solo;
    const runtime=new ResidentInstance({instanceId:owner.id,ownerEpoch:owner.epoch,state:initial,controllers:[]});
    const character:Character={id:initial.id,accountId:'account',kind:'hero',rules:characterRules(initial),professionReadyAt:{},resourceReadyAt:{}};
    await store.transaction(tx=>persistCharacter(tx,character,initial,initial.wallAt,'initial-assets'));
    await repository.commit(owner,1,runtime.checkpoint());
    runtime.advance(5000,100);
    const checkpoint=runtime.checkpoint(),unchanged=structuredClone(checkpoint);
    assert.equal(checkpoint.state.totals.kills,1);assert.ok(checkpoint.state.pending.length>0);
    const drops=checkpoint.state.pending.map((item:any)=>({id:item.id,uid:item.uid,count:item.count}));
    const readAssets=()=>store.read(async tx=>({items:await tx.list('items'),wallets:await tx.list('wallets'),characters:await tx.list('characters'),ledger:await tx.list('ledger')}));
    const before=await readAssets();
    let fail=true;
    const settlement={encounterId:checkpoint.state.lastCombat.id,sequence:1,facts:{drops},apply:async(tx:import('../src/store.ts').Transaction,key:string)=>{
      calls++;
      const current=(await tx.get<Character>('characters',initial.id))!;
      await persistCharacter(tx,current,checkpoint.state,checkpoint.state.wallAt,key);
      if(fail)throw new Error('Injected failure after game asset writes');
    }};
    await assert.rejects(repository.commit(owner,2,checkpoint,settlement),/Injected failure/);
    assert.deepEqual(await readAssets(),before);assert.equal((await repository.load(owner.id))!.sequence,1);
    assert.deepEqual(checkpoint,unchanged,'a transaction cannot rewrite the runtime checkpoint');
    fail=false;await repository.commit(owner,2,checkpoint,settlement);
    const committed=await readAssets();
    for(const drop of drops){const row=committed.items.find(item=>item.id===drop.uid)!;assert.equal(row.container,'pending');assert.equal(row.data.count,drop.count);}
    assert.deepEqual(durableState((await repository.load<InstanceCheckpoint>(owner.id))!.checkpoint),durableState(checkpoint));
    await repository.commit(owner,2,checkpoint,settlement);
    now=1100;const replacement=await repository.acquire(owner.id,'host-b',1000);
    await repository.commit(replacement,3,{...checkpoint,ownerEpoch:replacement.epoch},settlement);
    assert.equal(calls,2,'only the failed attempt and first successful attempt execute domain writes');
    assert.deepEqual(await readAssets(),committed);
  } finally { await store.close(); }
});
for (const backend of ['memory', 'sql'] as const) test(`${backend}: fenced checkpoint, stable settlement across epochs, rollback and replay`, async () => {
  const store: Store = backend === 'memory' ? new MemoryStore() : new PostgresStore(embeddedPool(new PGlite()));
  if (store instanceof PostgresStore) await store.initialize();
  let now = 100;
  const repository = new SimulationRepository(store, () => now);
  try {
    const owner = await repository.acquire('room', 'host-a', 1000);
    await assert.rejects(repository.acquire('room', 'host-b'), /held/);
    const checkpoint = {instanceId: 'room', ownerEpoch: owner.epoch, rulesetVersion: 'rules', contentHash: 'content', rngState: 71};
    let calls = 0;
    const assets = async (tx: import('../src/store.ts').Transaction, businessKey: string) => {
      calls++; await tx.put('wallets', {id: 'wallet', characterId: 'actor', balance: 100});
      await tx.insert('outbox', {id: businessKey, status: 'pending'});
    };
    const settlement = {encounterId: 'boss', sequence: 1, facts: {gold: 100}, apply: assets};
    assert.equal((await repository.commit(owner, 1, checkpoint, settlement)).duplicate, false);
    assert.equal((await repository.commit(owner, 1, checkpoint, settlement)).duplicate, true);
    const reordered = {rngState: 71, contentHash: 'content', rulesetVersion: 'rules', ownerEpoch: owner.epoch, instanceId: 'room'};
    assert.equal((await repository.commit(owner, 1, reordered, settlement)).duplicate, true, 'SQL JSONB envelope key ordering is irrelevant');
    assert.equal(calls, 1);
    await assert.rejects(repository.commit(owner, 1, {...checkpoint, rngState: 72}), /reused/);
    await assert.rejects(repository.commit(owner, 2, {...checkpoint, rngState: 72}, {...settlement, sequence: 2, apply: async tx => {
      await tx.put('wallets', {id: 'wallet', characterId: 'actor', balance: 0}); throw new Error('database fault');
    }}), /database fault/);
    assert.equal((await repository.load('room'))!.sequence, 1);
    assert.equal((await store.read(tx => tx.get('wallets', 'wallet')))!.balance, 100);
    now = 1100;
    const replacement = await repository.acquire('room', 'host-b', 1000);
    assert.equal(replacement.epoch, owner.epoch + 1);
    await assert.rejects(repository.commit(owner, 2, checkpoint, settlement), /fenced/);
    await assert.rejects(repository.renew(owner), /fenced/);
    assert.equal((await repository.commit(replacement, 1, {...checkpoint, ownerEpoch: replacement.epoch}, settlement)).duplicate, true);
    assert.equal(calls, 1, 'changing epoch never grants the same reward twice');
    const loaded = await repository.load<typeof checkpoint>('room');
    assert.equal(loaded!.checkpoint.rngState, 71);
    await assert.rejects(repository.commit(replacement, 2, {...checkpoint, ownerEpoch: replacement.epoch, rulesetVersion: 'different'}), /version/);
    await assert.rejects(repository.commit(replacement, 2, {...checkpoint, ownerEpoch: replacement.epoch}, {...settlement, facts: {gold: 200}}), /facts changed/);
    await repository.commit(replacement, 2, {...checkpoint, ownerEpoch: replacement.epoch}, settlement);
    assert.equal(calls, 1, 'a new checkpoint sequence cannot duplicate the same encounter settlement');
    await repository.release(replacement);
    await assert.rejects(repository.commit(replacement, 2, {...checkpoint, ownerEpoch: replacement.epoch}), /fenced/);
  } finally { await store.close(); }
});

test('full combat checkpoints survive SQL JSONB round trips for all five workloads', async () => {
  const store = new PostgresStore(embeddedPool(new PGlite()));
  await store.initialize();
  const repository = new SimulationRepository(store, () => 1000);
  try {
    for (const [instanceId, state] of Object.entries(localScenarios())) {
      const owner = await repository.acquire(instanceId, 'host');
      const reference = new ResidentInstance({instanceId, ownerEpoch: owner.epoch, state, controllers: []});
      while (!reference.advance(5000).complete) {}
      await repository.commit(owner, 1, reference.checkpoint());
      const checkpoint = (await repository.load<InstanceCheckpoint>(instanceId))!.checkpoint;
      const resumed = ResidentInstance.restore(checkpoint, owner.epoch);
      while (!reference.advance(10000).complete) {}
      while (!resumed.advance(10000).complete) {}
      assert.deepEqual(durableState(resumed.checkpoint().state), durableState(reference.checkpoint().state), instanceId);
    }
  } finally { await store.close(); }
});

for(const backend of ['memory','sql'] as const)test(backend+': transfer seals bind an exact durable cursor and exclude ordinary owner writes',async()=>{
 const store:Store=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
 if(store instanceof PostgresStore)await store.initialize();
 let now=1000;
 const repo=new SimulationRepository(store,()=>now);
 try{
  const owner=await repo.acquire('sealed','host',1000);
  const checkpoint={instanceId:owner.id,ownerEpoch:owner.epoch,rulesetVersion:'rules',contentHash:'content'};
  await assert.rejects(repo.seal(owner,'move'),/missing/);
  await repo.commit(owner,1,checkpoint);
  await assert.rejects(repo.seal(owner,'move'),/changed/);
  owner.commitSequence=1;
  const sealed=await repo.seal(owner,'move');
  assert.deepEqual(await repo.seal(owner,'move'),sealed);
  await assert.rejects(repo.seal(owner,'other'),/Different/);
  await assert.rejects(repo.unseal(owner,'other'),/Different/);
  await assert.rejects(repo.commit(owner,2,checkpoint),/sealed/);
  await assert.rejects(repo.renew(owner),/sealed/);
  await assert.rejects(repo.release(owner),/sealed/);
  await repo.unseal(owner,'move');await repo.unseal(owner,'move');
  await repo.commit(owner,2,checkpoint);
  await assert.rejects(repo.unseal(owner,'move'),/changed/,'stale token cannot abort a later transfer');
  owner.commitSequence=2;await repo.seal(owner,'move-next');
  now=2001;
  await assert.rejects(repo.unseal(owner,'move-next'),/fenced/);
  const recovered=await repo.acquire('sealed','replacement');
  assert.equal(recovered.epoch,2);assert.equal(recovered.handoff,undefined);
  assert.equal((await repo.load('sealed'))!.sequence,2);
 }finally{await store.close();}
});

test('atomic transfer rejects stale cursors, expired sources and reused destinations without partial domain writes',async()=>{
 const store=new MemoryStore();let now=1000,calls=0;
 const repo=new SimulationRepository(store,()=>now);
 try{
  const sources=[];
  for(const id of ['one','two']){
   const owner=await repo.acquire(id,'host',1000);
   await repo.commit(owner,1,{instanceId:id,ownerEpoch:owner.epoch,rulesetVersion:'rules',contentHash:'content'});
   owner.commitSequence=1;sources.push(await repo.seal(owner,'join'));
  }
  const create=async(tx:import('../src/store.ts').Transaction,{destinations:[destination]}:any)=>{
   calls++;await tx.put('wallets',{id:'test-asset',balance:100});
   return [{instanceId:destination.id,ownerEpoch:destination.epoch,rulesetVersion:'rules',contentHash:'content'}];
  };
  await assert.rejects(repo.transfer('join',[{...sources[0],commitSequence:2},sources[1]],['target'],create),/cursor/);
  await assert.rejects(repo.transfer('different',sources,['target'],create),/cursor/);
  await assert.rejects(repo.transfer('join',sources,['one'],create),/sources/);
  assert.equal(calls,0);
  await assert.rejects(repo.transfer('join',sources,['target'],async(tx,c)=>{const result=await create(tx,c);now=2001;return result;}),/fenced/);
  assert.equal(await store.read(tx=>tx.get('wallets','test-asset')),null);
  assert.equal(await store.read(tx=>tx.get('simulation_owners','target')),null);
  assert.equal(await repo.load('target'),null);
  now=1500;
  await repo.acquire('occupied','another');
  await assert.rejects(repo.transfer('join',sources,['occupied'],create),/already exists/);
  assert.equal((await repo.transfer('join',sources,['target'],create)).duplicate,false);
  now=5000;assert.equal((await repo.transfer('join',sources,['target'],create)).duplicate,true,'lost response retries are safe even after original lease expiry');
  await assert.rejects(repo.acquire('one','resurrect'),/permanently transferred/);
  const target=await repo.acquire('target','recovered');assert.equal(target.commitSequence,1);
  assert.equal((await repo.commit(target,1,{instanceId:'target',ownerEpoch:target.epoch,rulesetVersion:'rules',contentHash:'content'})).duplicate,true);
 }finally{await store.close();}
});

for(const backend of ['memory','sql'])test(`${backend}: one sealed room partitions atomically, survives a second-target write failure and recovers independently`,async()=>{
 const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
 if(raw instanceof PostgresStore)await raw.initialize();
 let fail=false,now=1000,calls=0;
 const store:Store={read:work=>raw.read(work),close:()=>raw.close(),heartbeat:(...args)=>raw.heartbeat(...args),
  transaction:(work,options)=>raw.transaction(tx=>work({...tx,put:async(table,row)=>{
   await tx.put(table,row);
   if(fail&&table==='simulation_checkpoints'&&row.id==='split:b')throw new Error('second target storage failure');
  }}),options)};
 const repo=new SimulationRepository(store,()=>now);
 type Checkpoint=DurableCheckpoint&{units:string[];rngState:number};
 try{
  let source=await repo.acquire('shared','host',1000);
  const original:Checkpoint={instanceId:source.id,ownerEpoch:source.epoch,rulesetVersion:'rules',contentHash:'content',units:['a','b'],rngState:283};
  await repo.commit(source,1,original);source.commitSequence=1;source=await repo.seal(source,'split');
  const create:TransferBoundary<Checkpoint>=async(tx,{destinations,sources})=>{
   calls++;await tx.put('wallets',{id:'boundary-asset',balance:100});
   return destinations.map((d,i)=>({...sources[0].checkpoint,instanceId:d.id,ownerEpoch:d.epoch,units:[sources[0].checkpoint.units[i]]}));
  };
  const ids=['split:a','split:b'];
  for(const invalid of [[],['split:a','split:a'],['split:a',''],Array.from({length:41},(_,i)=>'room:'+i)])
   await assert.rejects(repo.transfer('split',[source],invalid,create),/Invalid/);
  const unchanged=async()=>{
   assert.deepEqual((await repo.load<Checkpoint>('shared'))!.checkpoint,original);
   assert.equal((await store.read(tx=>tx.get('simulation_owners','shared')))!.transferred,undefined);
   for(const id of ids){assert.equal(await repo.load(id),null);assert.equal(await store.read(tx=>tx.get('simulation_owners',id)),null);}
   assert.equal(await store.read(tx=>tx.get('wallets','boundary-asset')),null);
   assert.equal(await store.read(tx=>tx.get('receipts','simulation-transfer:split')),null);
  };
  for(const corrupt of [
   (rows:Checkpoint[])=>rows.slice(0,1),
   (rows:Checkpoint[])=>[rows[0],rows[0]],
   (rows:Checkpoint[])=>[rows[0],{...rows[1],instanceId:'foreign'}],
   (rows:Checkpoint[])=>[rows[0],{...rows[1],ownerEpoch:2}],
   (rows:Checkpoint[])=>[rows[0],{...rows[1],rulesetVersion:'foreign'}],
  ]){
   await assert.rejects(repo.transfer<Checkpoint>('split',[source],ids,async(tx,c)=>corrupt(await create(tx,c))),/checkpoint/);await unchanged();
  }
  await assert.rejects(repo.transfer<Checkpoint>('split',[source],ids,async(tx,c)=>{
   c.sources[0].checkpoint.rulesetVersion='foreign';return create(tx,c);
  }),/checkpoint/);await unchanged();
  fail=true;await assert.rejects(repo.transfer('split',[source],ids,create),/second target storage failure/);await unchanged();
  fail=false;
  assert.deepEqual(await repo.transfer('split',[source],ids,create),{instanceIds:ids,duplicate:false});
  const committedCalls=calls;now=5000;
  assert.equal((await repo.transfer('split',[source],ids,create)).duplicate,true);assert.equal(calls,committedCalls);
  await assert.rejects(repo.transfer('split',[source],['split:a','another'],create),/reused/);
  await assert.rejects(repo.acquire('shared','stale'),/permanently transferred/);
  await assert.rejects(repo.commit(source,2,original),/fenced/);
  assert.equal(await repo.load('shared'),null);
  assert.deepEqual((await store.read(tx=>tx.get('simulation_owners','shared')))!.transferred.destinationIds,ids);
  for(const [i,id]of ids.entries()){
   const checkpoint=(await repo.load<Checkpoint>(id))!.checkpoint,owner=await repo.acquire(id,'recovered:'+i);
   assert.deepEqual(checkpoint.units,[i?'b':'a']);assert.equal(checkpoint.rngState,283);
   assert.equal(owner.epoch,2);assert.equal(owner.commitSequence,1);
   assert.equal((await repo.commit(owner,1,{...checkpoint,ownerEpoch:owner.epoch})).duplicate,true);
   await repo.commit(owner,2,{...checkpoint,ownerEpoch:owner.epoch,rngState:284+i});
  }
  assert.equal((await repo.load<Checkpoint>(ids[0]))!.checkpoint.rngState,284);
  assert.equal((await repo.load<Checkpoint>(ids[1]))!.checkpoint.rngState,285);
 }finally{await store.close();}
});
