import {runtimeVersion} from '../../../apps/simulation-host/src/version.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {PostgresStore, type SqlPool} from '../../persistence/src/postgres.ts';
import type {Store, TableName} from '../../persistence/src/store.ts';
import {SimulationRepository} from '../../persistence/src/simulation.ts';
import {GameService} from '../src/service.ts';
import {ResidentCharacters} from '../src/resident-characters.ts';
import {residentStore, withResidentAuthority} from '../src/resident-store.ts';
import {ResidentInstance} from '../../../apps/simulation-host/src/instance.ts';
import {context, persistCharacter} from '../src/context.ts';
import {companionSkills} from '../src/rules/party.js';
import {stats} from '../src/rules/character.js';
import type {Character} from '../src/model.ts';
import {removeInvalidSave} from '../src/account-reset.ts';
import {unstuck} from '../src/unstuck.ts';

function embeddedPool(db: PGlite): SqlPool {
  let tail=Promise.resolve();
  return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(resolve=>{release=resolve;});await previous;
    return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}
for(const backend of ['memory','sql'] as const)test(`${backend}: retired personal runtime keeps committed progress and fences its old owner`,async()=>{
  const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
  if(raw instanceof PostgresStore)await raw.initialize();
  const store=residentStore(raw),game=new GameService(store,{contentVersion:'retirement-test'});
  try{
    const state=(await game.createAccount('alice',{name:'旧版本角色',classId:8,raceId:1},'create')).state;
    const previous=new ResidentCharacters(store,{version:{...runtimeVersion,contentHash:'previous-release'}});
    const admission=await previous.admission('alice',state.id);
    const repo=new SimulationRepository(store),owner=await repo.acquire(admission.instanceId,'old-host');
    await assert.rejects(new ResidentCharacters(store,{version:runtimeVersion}).retireIncompatibleInstance('alice',state.id),/执行权/);
    await repo.release(owner);
    await store.transaction(async tx=>{
      const presence=(await tx.get<{id:string;lastSeenAt:number}>('account_presence','alice'))!;
      await tx.put('account_presence',{...presence,lastSeenAt:Date.now()-3*60*60*1000});
    });
    const current=new ResidentCharacters(store,{version:runtimeVersion,
      retireState:(tx,character,now)=>unstuck.call(game,tx,character,now,'release-update',true)});
    await current.retireIncompatibleInstance('alice',state.id);
    assert.equal(await current.find('alice',state.id),null);
    assert.equal(await store.read(tx=>tx.get('simulation_residencies',admission.instanceId)),null);
    assert.equal((await store.read(tx=>tx.get<Character>('characters',state.id)))?.rules.level,state.level);
    assert.ok((await store.read(tx=>tx.get<{lastSeenAt:number}>('account_presence','alice')))?.lastSeenAt!>Date.now()-60_000);
    await assert.rejects(repo.acquire(admission.instanceId,'old-host'),/permanently transferred/);
    const next=await current.admission('alice',state.id);
    assert.notEqual(next.instanceId,admission.instanceId);
    assert.equal(next.state.level,state.level);
  }finally{await store.close();}
});
for(const backend of ['memory','sql'] as const)test(`${backend}: resident character fencing and fault rollback cover the real asset materializer`,async()=>{
  const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
  if(raw instanceof PostgresStore)await raw.initialize();
  const store=residentStore(raw),game=new GameService(store,{contentVersion:'resident-test',seed:()=>283});
  try{
    const a=(await game.createAccount('alice',{name:'甲',classId:8,raceId:1},'create')).state;
    const b=(await game.createAccount('bob',{name:'乙',classId:8,raceId:1},'create')).state;
    await store.transaction(async tx=>{const c=(await tx.get<Character>('characters',a.id))!,s=await context(tx,c,Date.now(),false);
      s.level=20;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;await persistCharacter(tx,c,s,s.wallAt,'level');});
    const characters=new ResidentCharacters(store,{version:runtimeVersion});
    const [admission,retry]=await Promise.all([characters.admission('alice',a.id),characters.admission('alice',a.id)]);
    assert.deepEqual(retry,admission);
    await assert.rejects(new ResidentCharacters(store,{version:{...runtimeVersion,rulesetVersion:'other'}}).admission('alice',a.id),/版本/);
    let failing=false,calls=0;
    const repository=new SimulationRepository(store,Date.now,async(tx,boundary)=>{
      calls++;await characters.commit(tx,boundary);if(failing)throw new Error('Injected after character, assets and outbox');
    });
    const owner=await repository.acquire(admission.instanceId,'host-a');
    const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch});
    await repository.commit(owner,1,runtime.checkpoint());
    const item=(await store.read(tx=>tx.list('items',{ownerCharacterId:a.id})))[0];
    const otherItem=(await store.read(tx=>tx.list('items',{ownerCharacterId:b.id})))[0];
    for(const mutation of [
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.delete('simulation_characters',a.id),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.delete('simulation_residencies',admission.instanceId),
      (tx:import('../../persistence/src/store.ts').Transaction)=>removeInvalidSave(tx,'alice'),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.delete('characters',a.id),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.delete('items',item.id),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.put('items',{...item,ownerCharacterId:b.id,accountId:'bob'}),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.put('items',{...otherItem,ownerCharacterId:a.id,accountId:'alice'}),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.put('wallets',{id:a.id,characterId:a.id,balance:100}),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.insert('reservations',{id:'reserve',payerId:a.id,recipientId:b.id}),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.insert('actor_leases',{id:a.id,actorId:a.id,ownerId:'another'}),
      (tx:import('../../persistence/src/store.ts').Transaction)=>tx.insert('instances',{id:'another',roster:[{characterId:a.id}]}),
    ])await assert.rejects(store.transaction(mutation),/模拟实例/);
    // The guard is actor-scoped, so unrelated characters remain writable.
    await store.transaction(tx=>tx.put('wallets',{id:b.id,characterId:b.id,accountId:'bob',balance:27}));
    const tables:TableName[]=['characters','wallets','items','ledger','outbox','simulation_owners','simulation_checkpoints','simulation_commits','account_presence'];
    const snapshot=()=>store.read(async tx=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await tx.list(table)]))));
    const before=await snapshot();
    assert.equal(runtime.input('alice',{instanceId:owner.id,actorId:a.id,controllerGeneration:1,clientSequence:1,requestId:'hunt',command:{kind:'hunt',monsterId:299}}).status,'applied');
    runtime.advance(runtime.wallAt+6000,100);
    runtime.recordPresence('alice',a.id,runtime.wallAt);
    const checkpoint=runtime.checkpoint();assert.ok(checkpoint.state.totals.kills>0);assert.ok(checkpoint.state.pending.length>0);
    failing=true;await assert.rejects(repository.commit(owner,2,checkpoint),/Injected/);
    assert.deepEqual(await snapshot(),before,'all checkpoint and asset mutations roll back together');
    failing=false;await repository.commit(owner,2,checkpoint);
    const after=await snapshot(),committedCalls=calls;
    assert.equal(after.account_presence.find((row:any)=>row.id==='alice').lastSeenAt,checkpoint.presence!.accounts[0][1]);
    await repository.commit(owner,2,checkpoint);assert.equal(calls,committedCalls);assert.deepEqual(await snapshot(),after);
    for(const drop of checkpoint.state.pending)assert.ok(after.items.some((row:any)=>row.id===drop.uid&&row.container==='pending'));
    await repository.release(owner);
    await assert.rejects(store.transaction(tx=>tx.delete('items',item.id)),/模拟实例/,'an unloaded runtime still owns recovery');
    const replacement=await repository.acquire(owner.id,'host-b');
    await assert.rejects(repository.commit(owner,3,checkpoint),/fenced/);
    await assert.rejects(store.transaction(tx=>withResidentAuthority(tx,owner,()=>tx.delete('items',item.id))),/失效/);
    await repository.commit(replacement,3,{...checkpoint,ownerEpoch:replacement.epoch});
    const restored=await snapshot();assert.deepEqual(restored.items,after.items);assert.deepEqual(restored.wallets,after.wallets);assert.deepEqual(restored.ledger,after.ledger);
  }finally{await store.close();}
});

test('a sealed resident rejects direct domain write authority as well as checkpoint commits',async()=>{
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'test'});
 try{
  const s=(await game.createAccount('sealed-account',{name:'转移角色',classId:8,raceId:1},'create')).state;
  const characters=new ResidentCharacters(store,{version:runtimeVersion}),admission=await characters.admission('sealed-account',s.id);
  const repo=new SimulationRepository(store,Date.now,characters.commit),owner=await repo.acquire(admission.instanceId,'host');
  const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch});
  await repo.commit(owner,1,runtime.checkpoint());owner.commitSequence=1;
  await repo.seal(owner,'move-character');
  const before=await store.read(tx=>tx.get('wallets',s.id));
  await assert.rejects(store.transaction(tx=>withResidentAuthority(tx,owner,()=>tx.put('wallets',{
   id:s.id,accountId:'sealed-account',characterId:s.id,balance:999999
  }))),/失效/);
  assert.deepEqual(await store.read(tx=>tx.get('wallets',s.id)),before);
 }finally{await store.close();}
});

test('a batch checks ownership twice, independent of asset count, and a changed owner rolls back the batch',async()=>{
 const raw=new MemoryStore();let ownerReads=0;
 const observed:Store={read:work=>raw.read(work),heartbeat:(...args)=>raw.heartbeat(...args),close:()=>raw.close(),
  transaction:work=>raw.transaction(tx=>work({...tx,get:(table,id)=>{if(table==='simulation_owners')ownerReads++;return tx.get(table,id);}}))};
 const store=residentStore(observed),owner={id:'batch-room',ownerId:'host',epoch:1,expiresAt:Date.now()+60000,commitSequence:0};
 try{
  await raw.transaction(async tx=>{await tx.insert('simulation_owners',owner);await tx.insert('simulation_characters',{id:'hero',accountId:'alice',instanceId:owner.id});});
  ownerReads=0;
  await store.transaction(tx=>withResidentAuthority(tx,owner,async()=>{
   for(let i=0;i<100;i++)await tx.put('items',{id:'item:'+i,ownerCharacterId:'hero',accountId:'alice',container:'bag',position:i,data:{id:159,count:1}});
  }));
  assert.equal(ownerReads,2,'one before and one after the whole batch, not two hundred per-row owner reads');
  await assert.rejects(store.transaction(tx=>withResidentAuthority(tx,owner,async()=>{
   await tx.delete('items','item:0');await tx.put('simulation_owners',{...owner,epoch:2});
  })),/失效/);
  assert.ok(await store.read(tx=>tx.get('items','item:0')));
  assert.equal((await store.read(tx=>tx.get('simulation_owners',owner.id)))!.epoch,1);
 }finally{await store.close();}
});
