import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {PostgresStore,type SqlPool} from '../../../packages/persistence/src/postgres.ts';
import {tables,type Store} from '../../../packages/persistence/src/store.ts';
import {SimulationRepository,type Ownership} from '../../../packages/persistence/src/simulation.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {newState,characterRules,persistAssets} from '../../../packages/game-domain/src/context.ts';
import {ResidentInstance} from '../src/instance.ts';
import {SimulationDirectory} from '../src/directory.ts';
import {runtimeVersion} from '../src/version.ts';

function embeddedPool(db:PGlite):SqlPool{
 let tail=Promise.resolve();
 return {async connect(){const before=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await before;
  return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}
for(const backend of ['memory','sql'] as const)test(`${backend}: save deletion atomically revokes every owner and cannot resurrect assets`,async()=>{
 const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
 if(raw instanceof PostgresStore)await raw.initialize();
 let fail=false;
 const faults:Store={read:work=>raw.read(work),heartbeat:(...args)=>raw.heartbeat(...args),close:()=>raw.close(),
  transaction:(work,options)=>raw.transaction(tx=>work({...tx,delete:async(table,id)=>{
   if(fail&&table==='accounts')throw new Error('Injected account deletion failure');await tx.delete(table,id);
  }}),options)};
 const store=residentStore(faults),game=new GameService(store,{contentVersion:'test',seed:()=>283});
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
 try{
  const input={name:'待删除角色',classId:8,raceId:1},save=await game.createSave('alice',input,'save');
  const other=await game.createSave('bob',{...input,name:'保留角色'},'other');
  const account=(await store.read(tx=>tx.get('accounts',save.id)))!;
  const secondary=newState('第二角色',8,1,284,Date.now(),'secondary');
  await store.transaction(async tx=>{
   const character={id:'secondary',accountId:save.id,kind:'companion' as const,rules:characterRules(secondary),professionReadyAt:{},resourceReadyAt:{}};
   await tx.insert('characters',character);await persistAssets(tx,character,secondary,'secondary-create');
  });
  const admissions=await Promise.all([characters.admission(save.id,account.primaryCharacterId),characters.admission(save.id,'secondary')]);
  const owners:Ownership[]=[];
  for(const admission of admissions){
   const owner=await repository.acquire(admission.instanceId,'host');owners.push(owner);
   await repository.commit(owner,1,new ResidentInstance({...admission,ownerEpoch:owner.epoch}).checkpoint());
  }
  const snapshot=()=>store.read(async tx=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await tx.list(table)).sort((a,b)=>a.id.localeCompare(b.id))]))));
  const before=await snapshot();
  await assert.rejects(characters.deleteSave('mallory',save.id),{code:'NOT_FOUND'});assert.deepEqual(await snapshot(),before);
  fail=true;await assert.rejects(characters.deleteSave('alice',save.id),/Injected/);fail=false;
  assert.deepEqual(await snapshot(),before,'revocation, assets and receipts must all roll back');
  const ids=await characters.deleteSave('alice',save.id);assert.deepEqual(new Set(ids),new Set(admissions.map(a=>a.instanceId)));
  const after=await snapshot();
  for(const table of tables)assert.equal(after[table].filter((row:any)=>row.accountId===save.id).length,0,table);
  assert.equal(after.accounts.some((row:any)=>row.id===save.id),false);
  assert.equal(after.account_presence.some((row:any)=>row.id===save.id),false);
  for(let i=0;i<owners.length;i++){
   const tombstone=after.simulation_owners.find((row:any)=>row.id===owners[i].id);
   assert.equal(tombstone.epoch,owners[i].epoch+1);assert.equal(tombstone.deleted.saveId,save.id);
   assert.equal(await repository.load(owners[i].id),null);
   await assert.rejects(repository.acquire(owners[i].id,'stale-admission'),/permanently deleted/);
   await assert.rejects(repository.renew(owners[i]),/fenced/);
   await assert.rejects(repository.commit(owners[i],2,new ResidentInstance({...admissions[i],ownerEpoch:owners[i].epoch}).checkpoint()),/fenced/);
  }
  assert.deepEqual(await characters.deleteSave('alice',save.id),ids);
  assert.deepEqual(await snapshot(),after,'retry must not mutate remaining accounts or recreate an owner');
  await assert.rejects(characters.deleteSave('mallory',save.id),{code:'NOT_FOUND'});
  await assert.rejects(game.createSave('alice',input,'save'),{code:'DELETED'});
  for(const table of tables)assert.deepEqual(after[table].filter((row:any)=>row.accountId===other.id),before[table].filter((row:any)=>row.accountId===other.id),table+' unrelated account');
 }finally{await store.close();}
});

test('deleting an active room drains the worker and cached routes cannot reopen it',async()=>{
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'test',seed:()=>283});
 const save=await game.createSave('alice',{name:'删除中的法师',classId:8,raceId:1},'save'),account=(await store.read(tx=>tx.get('accounts',save.id)))!;
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
 const errors:unknown[]=[],directory=new SimulationDirectory(repository,{characters,onError:(_id,e)=>errors.push(e)});
 try{
  const admission=await characters.admission(save.id,account.primaryCharacterId),identity=await directory.openCharacter(save.id,account.primaryCharacterId);
  const input={instanceId:identity.instanceId,actorId:account.primaryCharacterId,controllerGeneration:1,clientSequence:1,requestId:'hunt',command:{kind:'hunt' as const,monsterId:299}};
  assert.equal((await directory.input(save.id,input)).status,'applied');
  assert.deepEqual(await directory.deleteSave('alice',save.id),{deleted:true});
  assert.equal(directory.inspect().instances,0);assert.equal(directory.inspect().shards[0].instances,0);
  assert.equal(await repository.load(identity.instanceId),null);
  await assert.rejects(directory.presentation(identity.instanceId,save.id,account.primaryCharacterId,'full',true),/不属于/);
  await assert.rejects(directory.input(save.id,input),/不属于/);
  await assert.rejects(directory.open(admission),/permanently deleted/);
  assert.deepEqual(await directory.deleteSave('alice',save.id),{deleted:true});assert.deepEqual(errors,[]);
 }finally{await directory.close();await store.close();}
});

test('deletion fences an admission that has not acquired its first owner yet',async()=>{
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'test',seed:()=>283});
 try{
  const save=await game.createSave('alice',{name:'待入场角色',classId:8,raceId:1},'unopened');
  const account=(await store.read(tx=>tx.get('accounts',save.id)))!;
  const characters=new ResidentCharacters(store,{version:runtimeVersion}),admission=await characters.admission(save.id,account.primaryCharacterId);
  assert.equal(await store.read(tx=>tx.get('simulation_owners',admission.instanceId)),null);
  await characters.deleteSave('alice',save.id);
  const owner=(await store.read(tx=>tx.get('simulation_owners',admission.instanceId)))!;
  assert.equal(owner.epoch,1);assert.equal(owner.deleted.saveId,save.id);
  await assert.rejects(new SimulationRepository(store).acquire(admission.instanceId,'late-host'),/permanently deleted/);
 }finally{await store.close();}
});

test('deletion wins over a delayed checkpoint and drains its rejected commit without reviving the save',async()=>{
 const store=residentStore(new MemoryStore()),game=new GameService(store,{contentVersion:'test',seed:()=>283});
 const save=await game.createSave('alice',{name:'提交中的角色',classId:8,raceId:1},'pending');
 const account=(await store.read(tx=>tx.get('accounts',save.id)))!;
 const characters=new ResidentCharacters(store,{version:runtimeVersion}),repository=new SimulationRepository(store,Date.now,characters.commit);
 const directory=new SimulationDirectory(repository,{characters});let unblock=()=>{};
 try{
  const identity=await directory.openCharacter(save.id,account.primaryCharacterId),commit=repository.commit.bind(repository);
  let entered=()=>{};
  const began=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{unblock=r;});
  repository.commit=async(...args)=>{entered();await gate;return commit(...args);};
  const pending=directory.checkpoint(identity.instanceId).then(()=>null,error=>error);await began;
  const deleting=directory.deleteSave('alice',save.id);
  const end=Date.now()+5000;
  while(await store.read(tx=>tx.get('accounts',save.id))){
   assert.ok(Date.now()<end,'deletion must revoke before waiting for the worker IO tail');
   await new Promise(r=>setTimeout(r,10));
  }
  unblock();assert.match(String(await pending),/fenced/);await deleting;
  assert.equal(directory.inspect().instances,0);assert.equal(directory.inspect().shards[0].instances,0);
  assert.equal(await repository.load(identity.instanceId),null);
 }finally{unblock();await directory.close();await store.close();}
});
