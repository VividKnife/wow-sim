import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {PostgresStore,type SqlPool} from '../../persistence/src/postgres.ts';
import type {Store,TableName} from '../../persistence/src/store.ts';
import {SimulationRepository} from '../../persistence/src/simulation.ts';
import {residentPartyFixture as fixture} from './support/resident-party.ts';
import {ResidentCharacters} from '../src/resident-characters.ts';
import {residentStore} from '../src/resident-store.ts';
import {ResidentInstance} from '../../../apps/simulation-host/src/instance.ts';
import {runtimeVersion} from '../../../apps/simulation-host/src/version.ts';
import {resolveGroupLoot} from '../src/rules/group-loot.js';
import {createNpcMember} from '../src/rules/party.js';
import {enterDungeon} from '../src/rules/dungeon.js';
import {startCombat} from '../src/rules/combat.js';
import {makeItem} from '../src/rules/character.js';
import type {Character,Rules} from '../src/model.ts';
import {participantCheckpointState} from '../src/resident-participants.ts';

function embeddedPool(db:PGlite):SqlPool{
  let tail=Promise.resolve();
  return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(resolve=>{release=resolve;});await previous;
    return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}

for(const backend of ['memory','sql'] as const)test(backend+': one fenced room atomically materializes independent human assets and preserves them across retry/recovery',async()=>{
  const raw:Store=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
  if(raw instanceof PostgresStore)await raw.initialize();
  const store=residentStore(raw);
  try{
    const {admission,ids}=await fixture(store);
    const characters=new ResidentCharacters(store,{version:runtimeVersion});
    const repository=new SimulationRepository(store,Date.now,characters.commit);
    const owner=await repository.acquire(admission.instanceId,'host');
    const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch});
    assert.deepEqual(await characters.find('alice',ids[0]),await characters.find('bob',ids[1]));
    await assert.rejects(characters.find('alice',ids[1]),/不属于/);
    const receipt=runtime.input('bob',{instanceId:owner.id,actorId:ids[1],controllerGeneration:1,clientSequence:1,
      requestId:'own-settings',command:{kind:'action',action:{type:'settings',health:33,mana:44}}});
    assert.equal(receipt.status,'applied');
    await repository.commit(owner,1,runtime.checkpoint());
    assert.equal((await store.read(tx=>tx.get<Character>('characters',ids[1])))!.rules.settings.health,33);
    const tables:TableName[]=['characters','wallets','items','ledger','outbox','account_presence','accounts','simulation_checkpoints','simulation_commits','simulation_owners'];
    const snapshot=()=>store.read(async tx=>Object.fromEntries(await Promise.all(tables.map(async name=>[name,await tx.list(name)]))));
    const before=await snapshot();
    const checkpoint=runtime.checkpoint();
    const reward=makeItem(checkpoint.state,5187);
    checkpoint.state.groupLoot={pending:[{id:reward.uid,item:reward,members:[
      {id:ids[0],name:'alice',eligible:true,need:false,roll:1,tie:0},
      {id:ids[1],name:'bob',eligible:true,need:false,roll:100,tie:0}
    ]}],history:[]};
    resolveGroupLoot(checkpoint.state,reward.uid,'pass');
    assert.equal(checkpoint.state.groupLoot.pending.length,1);
    resolveGroupLoot(checkpoint.state,reward.uid,'greed',ids[1]);
    assert.equal(checkpoint.state.party[0].pending.at(-1).uid,reward.uid);
    checkpoint.state.money+=13;checkpoint.state.party[0].money+=29;
    checkpoint.state.party[0].bag.push(makeItem(checkpoint.state.party[0],159));
    const invalid=structuredClone(checkpoint);
    invalid.state.party[0].bag[0].uid=checkpoint.state.bag[0].uid;
    await assert.rejects(repository.commit(owner,2,invalid),/跨角色/);
    assert.deepEqual(await snapshot(),before,'second participant failure rolls back first participant and the room checkpoint');
    await repository.commit(owner,2,checkpoint);
    const committed=await snapshot();
    assert.equal(committed.wallets.find((row:Rules)=>row.id===ids[0])!.balance,1124);
    assert.equal(committed.wallets.find((row:Rules)=>row.id===ids[1])!.balance,2251);
    assert.equal(committed.items.filter((row:Rules)=>row.ownerCharacterId===ids[1]&&row.container==='bag').length,checkpoint.state.party[0].bag.length);
    assert.ok(committed.items.some((row:Rules)=>row.id===reward.uid&&row.ownerCharacterId===ids[1]&&row.container==='pending'));
    const notifications=committed.outbox.filter((row:Rules)=>row.businessKey==='simulation:shared:participants:2');
    assert.equal(notifications.length,2);assert.deepEqual(new Set(notifications.map((row:Rules)=>row.accountId)),new Set(['alice','bob']));
    await repository.commit(owner,2,checkpoint);assert.deepEqual(await snapshot(),committed);
    for(const id of ids)await assert.rejects(store.transaction(tx=>tx.put('wallets',{id,characterId:id,balance:0})),/模拟实例/);
    const wrong=structuredClone(checkpoint);wrong.controllers[1].accountId='alice';
    await assert.rejects(repository.commit(owner,3,wrong),/名册/);
    const missing=structuredClone(checkpoint);missing.state.party=[];
    await assert.rejects(repository.commit(owner,3,missing),/身份/);
    assert.deepEqual(await snapshot(),committed);
    await repository.release(owner);
    const next=await repository.acquire(owner.id,'replacement');
    await assert.rejects(repository.commit(owner,3,checkpoint),/fenced/);
    const restored=ResidentInstance.restore((await repository.load<typeof checkpoint>(owner.id))!.checkpoint,next.epoch);
    await repository.commit(next,3,restored.checkpoint());
    const recovered=await snapshot();
    assert.deepEqual(recovered.wallets,committed.wallets);
    assert.deepEqual(recovered.items,committed.items);
    assert.deepEqual(recovered.ledger,committed.ledger);
    assert.equal(restored.presentation('bob',ids[1]).snapshot!.player.money,2251);
    const persisted=await store.read(tx=>tx.get<Character>('characters',ids[1]));
    assert.equal(persisted!.rules.name,'bob');
  }finally{await store.close();}
});

test('private projections use the requested full character, isolate caches, profiles and logs, and never alter authoritative state',async()=>{
  const store=residentStore(new MemoryStore());
  try{
    const {admission,ids}=await fixture(store);
    admission.state.logs.push({id:777,kind:'quest',encounterId:null,text:'PRIVATE-ALICE-QUEST',at:1000});
    const runtime=new ResidentInstance({...admission,ownerEpoch:1});
    const before=runtime.checkpoint();
    const alice=runtime.presentation('alice',ids[0]),bob=runtime.presentation('bob',ids[1]);
    assert.equal(alice.snapshot!.player.id,ids[0]);assert.equal(bob.snapshot!.player.id,ids[1]);
    assert.equal(alice.snapshot!.player.money,1111);assert.equal(bob.snapshot!.player.money,2222);
    assert.equal((bob.snapshot!.player as Rules).bag[0].uid,admission.state.party[0].bag[0].uid);
    const text=JSON.stringify(bob);
    assert.equal(text.includes(admission.state.bag[0].uid),false);
    assert.equal(text.includes(admission.state.bank[0].uid),false);
    assert.equal(text.includes('PRIVATE-ALICE'),false);
    assert.equal(text.includes('PRIVATE-BOB'),true);
    assert.deepEqual(runtime.checkpoint(),before);
    assert.equal(runtime.presentation('bob',ids[1]),bob,'same actor reuses the cached projection');
    assert.equal(runtime.presentation('alice',ids[0]).snapshot!.player.id,ids[0],'switching actor cannot reuse someone else private cache');
    assert.throws(()=>runtime.presentation('bob',ids[0]),/denied/);
    const detached=participantCheckpointState(admission.state,ids[1]);
    const count=admission.state.party[0].bag.length;detached.bag.length=0;assert.equal(admission.state.party[0].bag.length,count);
  }finally{await store.close();}
});

test('a controller cannot turn a truncated bot record into a persistent human',async()=>{
  const store=residentStore(new MemoryStore());
  try{
    const {admission}=await fixture(store);
    delete admission.state.party[0].bank;
    assert.throws(()=>new ResidentInstance({...admission,ownerEpoch:1}),/完整状态/);
  }finally{await store.close();}
});

test('different viewers share the same preparation positions and encounter while retaining private characters and receipts',async()=>{
  const store=residentStore(new MemoryStore());
  try{
    const {admission,ids}=await fixture(store);
    admission.state.level=20;admission.state.location='deadmines';admission.state.party[0].level=20;
    for(const role of ['warrior','priest','rogue'])createNpcMember(admission.state,role);
    enterDungeon(admission.state);
    let runtime=new ResidentInstance({...admission,ownerEpoch:1});
    const left=runtime.presentation('alice',ids[0]),right=runtime.presentation('bob',ids[1]);
    assert.deepEqual(left.snapshot!.view.instanceScene,right.snapshot!.view.instanceScene);
    assert.equal((right.snapshot!.view.instanceScene as Rules).memberCount,5);
    startCombat(admission.state,[299],true);delete admission.state.combat.pull;
    admission.state.logs.push(
      {id:901,at:1000,encounterId:admission.state.combat.id,kind:'damage',text:'PUBLIC-DAMAGE'},
      {id:902,at:1000,encounterId:admission.state.combat.id,kind:'quest',text:'PRIVATE-QUEST'});
    runtime=new ResidentInstance({...admission,ownerEpoch:1});
    runtime.input('alice',{instanceId:admission.instanceId,actorId:ids[0],controllerGeneration:1,clientSequence:1,requestId:'PRIVATE-REQUEST',
      command:{kind:'action',action:{type:'settings',health:50,mana:60}}});
    const a=runtime.presentation('alice',ids[0],'combat'),b=runtime.presentation('bob',ids[1],'combat');
    assert.deepEqual(a.snapshot!.player.combat,b.snapshot!.player.combat);
    assert.ok(JSON.stringify(b).includes('PUBLIC-DAMAGE'));
    assert.equal(JSON.stringify(b).includes('PRIVATE-QUEST'),false);
    assert.equal(JSON.stringify(b).includes('PRIVATE-REQUEST'),false);
    assert.equal(b.execution!.receipts.length,0);
    assert.equal(b.snapshot!.view.instanceScene,null);
  }finally{await store.close();}
});
