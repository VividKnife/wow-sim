import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {PostgresStore,type SqlPool} from '../../persistence/src/postgres.ts';
import type {Row} from '../../persistence/src/store.ts';
import {SimulationRepository} from '../../persistence/src/simulation.ts';
import {GameService} from '../src/service.ts';
import {ResidentCharacters} from '../src/resident-characters.ts';
import {residentStore} from '../src/resident-store.ts';
import {makeItem} from '../src/rules/character.js';
import {context,persistCharacter} from '../src/context.ts';
import {unstuck} from '../src/unstuck.ts';
import type {Character,Rules} from '../src/model.ts';
import {runtimeVersion} from '../../../apps/simulation-host/src/version.ts';
import {SimulationDirectory} from '../../../apps/simulation-host/src/directory.ts';

function pool(db:PGlite):SqlPool{
 let tail=Promise.resolve();
 return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(r=>release=r);await previous;
  return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}
for(const backend of ['memory','sql'])test(`${backend}: release update recovers a sole dungeon occupant without replaying old rules or changing assets`,async()=>{
 const raw=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));
 if(raw instanceof PostgresStore)await raw.initialize();
 const store=residentStore(raw),game=new GameService(store,{contentVersion:runtimeVersion.contentHash});
 const hero=(await game.createAccount('alice',{name:'副本猎人',classId:3,raceId:8},'create')).state;
 const room='dungeon:old-release';
 // A persisted old-version boundary, deliberately not executable by this release.
 await store.transaction(async tx=>{
  const character=(await tx.get<Character>('characters',hero.id))!,s=await context(tx,character,Date.now(),false);
  s.level=16;s.location='ragefire-chasm';s.money=12345;
  s.dungeonRoster={groupId:'group',dungeonId:'ragefire-chasm',leaderId:hero.id,members:[{id:hero.id,npc:false}]};
  s.sharedParty={leaderId:hero.id,participantIds:[hero.id]};s.dungeonPresentNpcIds=['npc:old'];
  s.groupLoot={pending:[{id:'unsettled-roll'}],history:[]};
  await persistCharacter(tx,character,s,s.wallAt,'fixture');
  await tx.insert('simulation_residencies',{id:room,characterId:hero.id,accountId:'alice',participants:[{characterId:hero.id,accountId:'alice'}],rulesetVersion:'previous-rules',contentHash:'previous-content',encodedAdmission:'not a current admission'});
  await tx.insert('simulation_characters',{id:hero.id,accountId:'alice',instanceId:room});
  await tx.insert('simulation_characters',{id:'npc:old',accountId:null,instanceId:room});
  await tx.insert('simulation_checkpoints',{id:room,encodedCheckpoint:JSON.stringify({state:{id:hero.id,level:16,dungeon:{id:'ragefire-chasm'}}})});
  await tx.insert('simulation_owners',{id:room,ownerId:'old-host',epoch:3,expiresAt:Date.now()+60000,commitSequence:7});
  await tx.insert('social_groups',{id:'group',instanceId:room,status:'matched',dungeonId:'ragefire-chasm',members:[{id:hero.id,npc:false}],entry:{id:'old-entry',requested:[hero.id],parked:{old:true}}});
  await tx.insert('social_groups',{id:'unrelated',instanceId:'dungeon:other',status:'matched',entry:{id:'keep'}});
 });
 const assets=()=>store.read(async tx=>({items:await tx.list('items'),wallets:await tx.list('wallets'),ledger:await tx.list('ledger')}));
 const before=await assets();
 const retired=new ResidentCharacters(store,{version:runtimeVersion,retireState:(tx,c,now)=>unstuck.call(game,tx,c,now,'retire',true)});
 try{
  await assert.rejects(retired.retireIncompatibleInstance('alice',hero.id),/执行权/);
  assert.equal((await store.read(tx=>tx.get('social_groups','group')))?.instanceId,room);
  await raw.transaction(async tx=>{const row=(await tx.get('simulation_owners',room))!;await tx.put('simulation_owners',{...row,expiresAt:0});});
  const failing=new ResidentCharacters(store,{version:runtimeVersion,retireState:async()=>{throw new Error('injected retirement failure');}});
  await assert.rejects(failing.retireIncompatibleInstance('alice',hero.id),/injected/);
  assert.equal((await store.read(tx=>tx.get('simulation_characters',hero.id)))?.instanceId,room);
  assert.equal((await store.read(tx=>tx.get('social_groups','group')))?.instanceId,room);
  assert.equal((await store.read(tx=>tx.get('simulation_owners',room)))?.transferred,undefined);
  // The ordinary login path performs recovery, then admits a valid new Worker.
  const repository=new SimulationRepository(store,Date.now,retired.commit);
  const directory=new SimulationDirectory(repository,{characters:retired});
  try{
   const route=await directory.openCharacter('alice',hero.id);
   assert.ok(route.instanceId.startsWith('personal:'));
   const view=await directory.presentation(route.instanceId,'alice',hero.id,'full',true);
   assert.equal(view.snapshot!.player.level,16);assert.equal(view.snapshot!.player.money,12345);
   assert.equal(view.snapshot!.player.dungeon,undefined);
   for(const key of ['dungeonRoster','dungeonPresentNpcIds','sharedParty'])assert.equal(view.snapshot!.player[key],undefined);
   assert.equal((view.snapshot!.player.groupLoot as Rules|undefined)?.pending.length??0,0);
   assert.deepEqual(await assets(),before);
   assert.equal(await store.read(tx=>tx.get('simulation_characters','npc:old')),null);
   assert.equal(await store.read(tx=>tx.get('simulation_residencies',room)),null);
   const group=(await store.read(tx=>tx.get('social_groups','group')))!;
   assert.equal(group.instanceId,undefined);assert.equal(group.entry,undefined);assert.equal(group.status,'forming');
   assert.deepEqual(group.members,[{id:hero.id,npc:false}]);
   assert.equal((await store.read(tx=>tx.get('social_groups','unrelated')))?.instanceId,'dungeon:other');
   await assert.rejects(repository.acquire(room,'stale-host'),/permanently transferred/);
   assert.deepEqual(await directory.openCharacter('alice',hero.id),route,'repeat login reuses the recovered owner');
  }finally{await directory.close();}
 }finally{await store.close();}
});

for(const backend of ['memory','sql'])test(`${backend}: a non-leader recovers all shared dungeon members atomically and concurrent logins keep private assets`,async()=>{
 const raw=backend==='memory'?new MemoryStore():new PostgresStore(pool(new PGlite()));
 if(raw instanceof PostgresStore)await raw.initialize();
 const store=residentStore(raw),game=new GameService(store,{contentVersion:runtimeVersion.contentHash});
 const accounts=['alice','bob','offline'],ids:string[]=[],states:Rules[]=[];
 const room='dungeon:shared-release';
 for(const [index,account] of accounts.entries()){
  const hero=(await game.createAccount(account,{name:account,classId:8,raceId:1},'create')).state;ids.push(hero.id);
  await store.transaction(async tx=>{
   const c=(await tx.get<Character>('characters',hero.id))!,s=await context(tx,c,Date.now(),false);
   s.level=20+index;s.location='ragefire-chasm';s.money=1111*(index+1);
   s.bag.push(makeItem(s,159));s.bank.push(makeItem(s,159));
   s.strategyProfiles=[{name:`private-${account}`,rules:[],policy:{},autoBuffs:{},potions:{}}];
   s.dungeonSaves={'own-progress':{owner:account}};
   s.sharedParty={leaderId:ids[0],participantIds:ids};s.dungeonRoster={groupId:'group'};
   s.groupLoot={pending:[{id:'unallocated'}],history:[]};
   await persistCharacter(tx,c,s,s.wallAt,'fixture:'+account);states.push(s);
  });
 }
 await raw.transaction(async tx=>{
  const participants=ids.map((characterId,i)=>({characterId,accountId:accounts[i]}));
  await tx.insert('simulation_residencies',{id:room,accountId:'alice',characterId:ids[0],participants,rulesetVersion:'old',contentHash:'old',encodedAdmission:'old unexecutable admission'});
  for(const p of participants)await tx.insert('simulation_characters',{id:p.characterId,accountId:p.accountId,instanceId:room});
  await tx.insert('simulation_characters',{id:'npc:guest',accountId:null,instanceId:room});
  await tx.insert('npc_characters',{id:'npc:guest',accountId:null,rules:{level:23},realm:'public'});
  await tx.insert('wallets',{id:'npc:guest',characterId:'npc:guest',accountId:null,balance:777});
  await tx.insert('simulation_owners',{id:room,ownerId:'old-host',epoch:2,expiresAt:0,commitSequence:9});
  await tx.insert('simulation_checkpoints',{id:room,encodedCheckpoint:JSON.stringify({state:{...states[0],party:states.slice(1),dungeon:{id:'ragefire-chasm'}}})});
  await tx.insert('social_groups',{id:'group',instanceId:room,status:'matched',dungeonId:'ragefire-chasm',entry:{id:'expired',requested:ids},members:ids.map(id=>({id,npc:false}))});
  await tx.insert('social_groups',{id:'other-group',instanceId:'dungeon:other',status:'matched'});
 });
 const dump=()=>store.read(async tx=>{
  const result:Record<string,unknown>={};
  for(const table of ['characters','items','wallets','ledger','npc_characters','account_presence','simulation_owners','simulation_residencies','simulation_characters','social_groups'] as const)result[table]=await tx.list(table);
  return result;
 });
 const before=await dump(),calls:string[]=[];
 const current=new ResidentCharacters(store,{version:runtimeVersion,retireState:async(tx,c,now)=>{
  calls.push(c.id);await unstuck.call(game,tx,c,now,'retire:'+c.id,true);
 }});
 try{
  // No caller may use another participant's account/actor pair.
  await assert.rejects(current.retireIncompatibleInstance('bob',ids[0]),/不属于/);
  assert.deepEqual(await dump(),before);
  // Matching-version rooms are never cancelled by this recovery path.
  const original=(await store.read(tx=>tx.get('simulation_residencies',room)))!;
  await raw.transaction(tx=>tx.put('simulation_residencies',{...original,...runtimeVersion}));
  const compatible=await dump();
  await current.retireIncompatibleInstance('bob',ids[1]);
  assert.deepEqual(await dump(),compatible);
  await raw.transaction(tx=>tx.put('simulation_residencies',original));
  // Every member must match the last committed checkpoint before any are reset.
  const saved=(await store.read(tx=>tx.get('simulation_checkpoints',room)))!;
  const broken=JSON.parse(saved.encodedCheckpoint);broken.state.party.pop();
  await raw.transaction(tx=>tx.put('simulation_checkpoints',{...saved,encodedCheckpoint:JSON.stringify(broken)}));
  await assert.rejects(current.retireIncompatibleInstance('bob',ids[1]),/角色状态不一致/);
  assert.deepEqual(await dump(),before);
  await raw.transaction(tx=>tx.put('simulation_checkpoints',saved));
  // A missing member claim must block the entire room, not abandon that member.
  await raw.transaction(tx=>tx.delete('simulation_characters',ids[2]));
  await assert.rejects(current.retireIncompatibleInstance('bob',ids[1]),/归属/);
  await raw.transaction(tx=>tx.insert('simulation_characters',{id:ids[2],accountId:'offline',instanceId:room}));
  assert.deepEqual(await dump(),before);
  // Fence checks apply to the shared owner even when the caller is not leader.
  for(const extra of [{expiresAt:Date.now()+60000},{handoff:{id:'in-flight'}}]){
   await raw.transaction(async tx=>{const owner=(await tx.get('simulation_owners',room))!;await tx.put('simulation_owners',{...owner,...extra});});
   await assert.rejects(current.retireIncompatibleInstance('bob',ids[1]),/执行权/);
   await raw.transaction(tx=>tx.put('simulation_owners',(before.simulation_owners as Row[])[0]));
   assert.deepEqual(await dump(),before);
  }
  let count=0;
  const failing=new ResidentCharacters(store,{version:runtimeVersion,retireState:async(tx,c,now)=>{
   await unstuck.call(game,tx,c,now,'rollback:'+c.id,true);
   if(++count===2)throw new Error('second participant failed');
  }});
  await assert.rejects(failing.retireIncompatibleInstance('bob',ids[1]),/second participant/);
  assert.equal(count,2);assert.deepEqual(await dump(),before,'even the already-recovered leader is rolled back');
  // The non-leader starts recovery while the leader independently logs in.
  const repository=new SimulationRepository(store,Date.now,current.commit),directory=new SimulationDirectory(repository,{characters:current});
  try{
   const [bob,alice]=await Promise.all([directory.openCharacter('bob',ids[1]),directory.openCharacter('alice',ids[0])]);
   const routes=[alice,bob];
   assert.deepEqual(calls,ids,'each human is recovered exactly once, including the offline member');
   assert.equal((await store.read(tx=>tx.list('simulation_characters',{instanceId:room}))).length,0);
   assert.equal(await current.find('offline',ids[2]),null,'offline members do not acquire an active personal room');
   assert.notEqual(routes[0].instanceId,routes[1].instanceId);
   for(const i of [0,1]){
    const view=await directory.presentation(routes[i].instanceId,accounts[i],ids[i],'full',true),player=view.snapshot!.player;
    assert.equal(player.id,ids[i]);assert.equal(player.level,20+i);assert.equal(player.money,1111*(i+1));
    const personal=(await current.find(accounts[i],ids[i]))!.state;
    assert.deepEqual(personal.dungeonSaves,states[i].dungeonSaves);
    assert.deepEqual(personal.bag,states[i].bag);assert.deepEqual(personal.bank,states[i].bank);
    assert.deepEqual(personal.strategyProfiles,states[i].strategyProfiles);
    assert.ok(!JSON.stringify(view).includes(`private-${accounts[1-i]}`),'presentation cannot expose a teammate private strategy');
    assert.equal(player.dungeon,undefined);assert.equal(player.sharedParty,undefined);assert.equal(player.dungeonRoster,undefined);
   }
   const after=await dump();
   for(const table of ['items','wallets','ledger','npc_characters'])assert.deepEqual(after[table],before[table],table);
   const offline=(await store.read(tx=>tx.get<Character>('characters',ids[2])))!;
   assert.equal(offline.rules.sharedParty,undefined);assert.equal(offline.rules.dungeonRoster,undefined);
   assert.deepEqual(offline.rules.dungeonSaves,states[2].dungeonSaves);
   const group=(await store.read(tx=>tx.get('social_groups','group')))!;
   assert.equal(group.status,'forming');assert.equal(group.entry,undefined);assert.equal(group.instanceId,undefined);
   assert.deepEqual(group.members,ids.map(id=>({id,npc:false})));
   assert.equal((await store.read(tx=>tx.get('social_groups','other-group')))?.instanceId,'dungeon:other');
   await assert.rejects(repository.acquire(room,'old-host'),/permanently transferred/);
   const late=await directory.openCharacter('offline',ids[2]);
   assert.ok(late.instanceId.startsWith('personal:'));assert.ok(routes.every(r=>r.instanceId!==late.instanceId));
   const lateView=await directory.presentation(late.instanceId,'offline',ids[2],'full',true);
   assert.equal(lateView.snapshot!.player.money,3333);assert.equal(lateView.snapshot!.player.level,22);
  }finally{await directory.close();}
 }finally{await store.close();}
});
