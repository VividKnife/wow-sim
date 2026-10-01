import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {stats,roll} from '../../../packages/game-domain/src/rules/character.js';
import {creatures} from '../../../packages/game-domain/src/rules/catalog.js';
import {creditCombatKill} from '../../../packages/game-domain/src/rules/combat-rewards.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {ensureNpcWorld,syncNpcWorld} from '../../../packages/game-domain/src/rules/npc-world.js';
import {creditKill,lootRows} from '../../../packages/game-domain/src/rules/quests.js';
import {projectClientSnapshot} from '../../../packages/game-domain/src/rules/client-snapshot.ts';
import {participantPresentationState} from '../../../packages/game-domain/src/resident-participants.ts';
import {residentPartyFixture} from '../../../packages/game-domain/test/support/resident-party.ts';
import {ResidentCharacters} from '../../../packages/game-domain/src/resident-characters.ts';
import {residentStore} from '../../../packages/game-domain/src/resident-store.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {PostgresStore,type SqlPool} from '../../../packages/persistence/src/postgres.ts';
import {SimulationRepository} from '../../../packages/persistence/src/simulation.ts';
import {ResidentInstance} from '../src/instance.ts';
import {runtimeVersion} from '../src/version.ts';
import type {Rules} from '../../../packages/game-domain/src/model.ts';

const human=(id:string):Rules=>{const c:Rules=createGame(id,283,0,{characterId:id});c.level=24;c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;c.quests[387]={kills:{}};return c;};
function embeddedPool(db:PGlite):SqlPool{
 let tail=Promise.resolve();
 return {async connect(){const previous=tail;let release!:()=>void;tail=new Promise(resolve=>{release=resolve;});await previous;
  return {query:async(sql,values)=>sql.includes('CREATE TABLE')?(await db.exec(sql),{rows:[]}):db.query(sql,values),release};},end:()=>db.close()};
}

test('one coin roll is conserved across actual members including dead humans, excluding pets, totems and outsiders',()=>{
 const s=human('root'),a=human('alice'),b=human('bob');s.party=[a,b];b.hp=0;
 a.pet={id:'pet',petUnit:true};a.totems={fire:{id:'totem',totemUnit:true}};
 s.combat={id:'reward-boundary',participantIds:[a.id,b.id,'pet','totem']};
 const before=[s.money,a.money,b.money],rngCopy=structuredClone(s),raw=creatures[1706];
 const expected=roll(rngCopy,raw.MinLootGold,raw.MaxLootGold);
 creditCombatKill(s,1706);
 assert.equal(s.money,before[0]);assert.deepEqual(s.quests[387].kills,{});
 assert.equal(a.quests[387].kills[1706],1);assert.equal(b.quests[387].kills[1706],1);
 assert.equal(a.totals.kills,1);assert.equal(b.totals.kills,1);
 const shares=[a.money-before[1],b.money-before[2]];
 assert.equal(shares.reduce((n,v)=>n+v,0),expected);assert.ok(Math.abs(shares[0]-shares[1])<=1);
 assert.equal(s.rngState,rngCopy.rngState,'sharing consumes no additional combat randomness');
 assert.deepEqual(s.combat.lootGoldByActor,{alice:shares[0],bob:shares[1]});
 for(const [actor,share]of [[s,0],[a,shares[0]],[b,shares[1]]] as const){
  const publicState=projectClientSnapshot(participantPresentationState(s,actor.id),{}).player as Rules;
  assert.equal(publicState.combat.lootGold,share);
  assert.equal(Object.hasOwn(publicState.combat,'lootGoldByActor'),false,'other wallets are not projected');
 }
});

test('NPC coin shares credit the durable wallet and survive NPC synchronization; gold raid cash remains spendable',()=>{
 const s=human('root');ensureNpcWorld(s,1);const profile=s.npcWorld.residents[0];
 const npc=structuredClone(profile.unit);s.party=[npc];s.combat={id:'npc-rewards',participantIds:[s.id,npc.id]};
 const before=profile.wallet;creditCombatKill(s,1706);
 assert.equal(profile.wallet-before,s.combat.lootGoldByActor[npc.id]);
 const awarded=profile.wallet;syncNpcWorld(s);assert.equal(profile.wallet,awarded);
 npc.goldNpc=true;npc.money=profile.wallet;
 creditCombatKill(s,1706);assert.ok(npc.money>awarded);assert.equal(profile.wallet,npc.money);
 syncNpcWorld(s);assert.equal(profile.wallet,npc.money);
});

test('shared quest credit reads encounter context without granting another characters scripted attempt',()=>{
 const s=human('alice');s.quests[434]={kills:{}};
 const battle={quest:434,questEventAttempt:7};
 creditKill(s,1754,battle);assert.deepEqual(s.quests[434].kills,{});
 s.stockadesQuestEvent={stage:'combat',attempt:6};
 creditKill(s,1754,battle);assert.deepEqual(s.quests[434].kills,{});
 s.stockadesQuestEvent.attempt=7;creditKill(s,1754,battle);
 assert.equal(s.quests[434].kills[1754],1);assert.equal(s.combat,null);
});

test('quest drops reach each eligible human with distinct identities, while common equipment rolls only once for actual participants',()=>{
 const s=human('root'),a=human('alice'),b=human('bob');s.party=[a,b];
 for(const c of [s,a,b])c.quests[386]={kills:{}};
 s.dungeon={id:'stockades'};s.sharedParty={leaderId:b.id,participantIds:[s.id,a.id,b.id]};
 s.combat={id:'quest-drops',participantIds:[a.id,b.id]};
 const questRow={item:3630,ChanceOrQuestChance:-100,groupid:0,mincountOrRef:1,maxcount:1,condition_id:0};
 const oneHuman=structuredClone(s);oneHuman.combat.participantIds=[a.id];
 lootRows(oneHuman,[questRow],0,true);lootRows(s,[questRow],0,true);
 assert.equal(s.rngState,oneHuman.rngState,'personal quest copies do not reroll the loot table');
 assert.equal(s.pending.length,0,'a quest holder outside the encounter receives nothing');
 assert.equal(a.pending[0].id,3630);assert.equal(b.pending[0].id,3630);
 assert.notEqual(a.pending[0].uid,b.pending[0].uid);
 const satisfiedRng=s.rngState;lootRows(s,[questRow],0,true);
 assert.equal(a.pending.length,1);assert.equal(b.pending.length,1);assert.equal(s.rngState,satisfiedRng);
 lootRows(s,[{...questRow,item:5201,ChanceOrQuestChance:100}],0,true);
 assert.equal(s.groupLoot.pending.length,1,'ordinary equipment is not multiplied by human count');
 assert.deepEqual(s.groupLoot.pending[0].members.map((m:Rules)=>m.id),[a.id,b.id]);
});

test('a root character without the quest cannot suppress a teammates quest item, and restored pending items satisfy the requirement',()=>{
 const s=human('root'),a=human('alice');s.party=[a];a.quests[386]={kills:{}};
 s.combat={id:'member-quest',participantIds:[s.id,a.id]};
 const row={item:3630,ChanceOrQuestChance:-100,groupid:0,mincountOrRef:1,maxcount:1,condition_id:0};
 lootRows(s,[row],0,true);assert.equal(s.pending.length,0);assert.equal(a.pending[0].id,3630);
 const restored=JSON.parse(JSON.stringify(s)),before=JSON.stringify(restored);
 lootRows(restored,[row],0,true);assert.equal(JSON.stringify(restored),before);
});

for(const backend of ['memory','sql'] as const)test(backend+': a real shared kill persists individual rewards and restores without duplication',async()=>{
 const raw=backend==='memory'?new MemoryStore():new PostgresStore(embeddedPool(new PGlite()));
 if(raw instanceof PostgresStore)await raw.initialize();
 const store=residentStore(raw);
 try{
  const {admission,ids}=await residentPartyFixture(store,1000,state=>{
   for(const c of [state,...state.party]){c.level=24;c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;c.quests[387]={kills:{}};c.quests[386]={kills:{}};}
   state.sharedParty={leaderId:state.party[0].id,participantIds:[state.id,state.party[0].id]};
   startCombat(state,[1706],true);state.combat.enemies[0].hp=0;
   lootRows(state,[{item:3630,ChanceOrQuestChance:-100,groupid:0,mincountOrRef:1,maxcount:1,condition_id:0}],0,true);
  });
  const chars=new ResidentCharacters(store,{version:runtimeVersion}),repo=new SimulationRepository(store,Date.now,chars.commit);
  const owner=await repo.acquire(admission.instanceId,'first');
  combatTick(admission.state);assert.equal(admission.state.combat,null);
  const runtime=new ResidentInstance({...admission,ownerEpoch:owner.epoch}),checkpoint=runtime.checkpoint();
  const battle=checkpoint.state.lastCombat,expected=ids.map((id,i)=>(i+1)*1111+battle.lootGoldByActor[id]);
  const rewards=[checkpoint.state,...checkpoint.state.party].map((c:Rules)=>c.pending.find((i:Rules)=>i.id===3630).uid);
  assert.notEqual(rewards[0],rewards[1]);
  assert.ok(checkpoint.state.party[0].totals.xp>0,'human experience statistics use the same recipient as XP');
  assert.equal(expected[0]+expected[1]-3333,battle.lootGold);
  await repo.commit(owner,1,checkpoint);await repo.commit(owner,1,checkpoint);
  const verify=async()=>{for(const [i,id]of ids.entries()){
   assert.equal((await store.read(tx=>tx.get('wallets',id)))!.balance,expected[i]);
   const c=await store.read(tx=>tx.get('characters',id));assert.equal(c!.rules.quests[387].kills[1706],1);
   assert.equal((await store.read(tx=>tx.get('items',rewards[i])))!.ownerCharacterId,id);
  }};
  await verify();await repo.release(owner);const replacement=await repo.acquire(owner.id,'second');
  const saved=(await repo.load<typeof checkpoint>(owner.id))!.checkpoint;
  const restored=ResidentInstance.restore(saved,replacement.epoch);restored.advance(restored.wallAt+100,10);
  await repo.commit(replacement,2,restored.checkpoint());await verify();
  await assert.rejects(repo.commit(owner,3,checkpoint),/fenced/);
 }finally{await store.close();}
});
