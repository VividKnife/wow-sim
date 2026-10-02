import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {residentStore} from '../src/resident-store.ts';
import {updateNpcPopulation} from '../src/npc-population.ts';
import {loadNpcResident,persistNpcResident,type NpcCharacter} from '../src/npc-characters.ts';
import {newResident} from '../src/rules/npc-world.js';
import {NPC_PROGRESS,redistributeNpc,progressPublicNpc,fiveManUpgrades,recordNpcFiveMan,recordNpcRaidVisit,simulateNpcRaid,raidWeek,raidResetWall} from '../src/rules/npc-progression.js';
import {equipmentUpgrade,equipNpcItem} from '../src/rules/npc-equipment.js';
import {items} from '../src/rules/catalog.js';
import type {Rules} from '../src/model.ts';
const hour=3600000,now=2000000000000;
const npc=(level=60,index=6):Rules=>newResident({id:'realm',raceId:1,level,clock:0,wallAt:now,location:'goldshire'},index,level);

test('public population is reused across demand; reservations and level-60 assets prevent redistribution',async()=>{
 const store=residentStore(new MemoryStore());
 let p=await store.transaction(tx=>updateNpcPopulation(tx,now,{level:20}));assert.equal(p.length,10);
 const first=p.map(p=>p.id);p=await store.transaction(tx=>updateNpcPopulation(tx,now+1,{level:20}));assert.deepEqual(p.map(p=>p.id),first);
 const protectedId=p[0].id;
 await store.transaction(tx=>tx.put('social_members',{id:protectedId,groupId:'other'}));
 p=await store.transaction(tx=>updateNpcPopulation(tx,now+hour,{level:40}));
 const retained=await store.read(tx=>tx.get<NpcCharacter>('npc_characters',protectedId));assert.equal(retained!.rules.level,20);
 assert.ok(p.some(p=>first.includes(p.id)&&p.unit.level===40));assert.ok(p.every(p=>p.wallet>=0));
 const rows=await store.read(tx=>tx.list('npc_characters'));assert.ok(rows.every(r=>r.accountId===null&&r.realm==='public'&&!('ownerCharacterId' in r)));
 const max=npc(60,999);const before=structuredClone(max);assert.throws(()=>redistributeNpc(max,20,now));assert.deepEqual(max,before);
});
test('offline intervals earn nothing and two requesters cannot double settle activity time',async()=>{
 const store=new MemoryStore();await store.transaction(tx=>updateNpcPopulation(tx,now,{level:20}));
 const read=()=>store.read(async tx=>loadNpcResident(tx,(await tx.list<NpcCharacter>('npc_characters'))[0]));
 const before=await read();await store.transaction(tx=>updateNpcPopulation(tx,now+7*86400000));assert.deepEqual(await read(),before);
 await store.transaction(async tx=>{await tx.put('characters',{id:'human',accountId:'a',kind:'hero',rules:{level:20}});await tx.put('social_people',{id:'human',seenAt:now+7*86400000});await updateNpcPopulation(tx,now+7*86400000);});
 for(let minute=1;minute<=30;minute++)await store.transaction(async tx=>{const wall=now+7*86400000+minute*60000;await tx.put('social_people',{id:'human',seenAt:wall});await updateNpcPopulation(tx,wall);});
 const after=await read();assert.ok(after.steps>before.steps);assert.ok(after.unit.level<=23);const saved=structuredClone(after);
 await store.transaction(tx=>updateNpcPopulation(tx,now+7*86400000+30*60000));assert.deepEqual(await read(),saved);
});
test('earned XP is incremental, experts are faster, and neither can outlevel a human by more than three',()=>{
 const expert=npc(20,3),normal=structuredClone(expert);normal.raidProfile.skill='regular';expert.raidProfile.personality=normal.raidProfile.personality='saver';
 progressPublicNpc(expert,NPC_PROGRESS.stepMs,now,23);progressPublicNpc(normal,NPC_PROGRESS.stepMs,now,23);
 assert.ok(expert.unit.xp>normal.unit.xp);assert.ok(expert.unit.level<23);assert.ok(expert.lastAdventure.xp>0);
 progressPublicNpc(expert,10*hour,now+10*hour,23);assert.equal(expert.unit.level,23);
 const wallet=expert.wallet;redistributeNpc(expert,12,now+11*hour);assert.equal(expert.wallet,wallet);assert.equal(expert.unit.xp,0);assert.ok(Object.values(expert.unit.equipment).every((i:any)=>i.uid.includes('distribution')));
});
test('five-man simulations have daily/weekly caps, share actual attendance, and stop after graduation',()=>{
 const p=npc();p.raidProfile.personality='saver';assert.ok(fiveManUpgrades(p).length>0);
 progressPublicNpc(p,hour,now);assert.equal(p.endgame.daily,1);progressPublicNpc(p,hour,now+hour);assert.equal(p.endgame.daily,2);
 progressPublicNpc(p,hour,now+2*hour);assert.equal(p.endgame.daily,2);
 const q=npc();assert.equal(recordNpcFiveMan(q,'real-run',now),true);assert.equal(recordNpcFiveMan(q,'real-run',now),false);recordNpcFiveMan(q,'second-run',now);
 progressPublicNpc(q,hour,now);assert.equal(q.endgame.daily,2);
 for(let day=1;day<5;day++){recordNpcFiveMan(q,`a:${day}`,now);recordNpcFiveMan(q,`b:${day}`,now);}
 progressPublicNpc(q,hour,now+86400000);assert.equal(q.endgame.weekly,10);
 // Equip successive strict upgrades to reach a fixed point in the five-man loot pool.
 for(let i=0;i<100;i++){const upgrade=fiveManUpgrades(q)[0];if(!upgrade)break;equipNpcItem(q.unit,{id:upgrade.id,uid:`graduated:${i}`,count:1,durability:items[upgrade.id].MaxDurability},equipmentUpgrade(q.unit,items[upgrade.id]));}
 assert.equal(fiveManUpgrades(q).length,0);progressPublicNpc(q,hour,now+2*86400000);assert.equal(q.endgame.graduated,true);assert.equal(q.endgame.weekly,10);
});
test('raid fallback runs once per current CD and actual raid attendance suppresses it, even after a wipe',()=>{
 const p=npc(),q=npc(60,3),wall=raidResetWall(now)-hour;recordNpcRaidVisit(q,'molten-core',wall);
 simulateNpcRaid([p,q],'molten-core',wall);assert.equal(p.raidLockouts['molten-core'].week,raidWeek(wall));assert.ok(p.raidLockouts['molten-core'].bosses.length>0);assert.equal(q.raidLockouts,undefined);
 const saved=structuredClone(p);simulateNpcRaid([p],'molten-core',wall);assert.deepEqual(p,saved);
 simulateNpcRaid([p],'molten-core',wall+7*86400000);assert.equal(p.raidRuns,2);assert.ok(Number.isSafeInteger(p.wallet)&&p.wallet>=0);
});
test('public asset writes are fenced while the character is in a live instance',async()=>{
 const store=residentStore(new MemoryStore()),p=npc();await store.transaction(tx=>persistNpcResident(tx,p,'seed'));
 await store.transaction(tx=>tx.insert('simulation_characters',{id:p.id,accountId:null,instanceId:'busy'}));
 p.wallet++;await assert.rejects(store.transaction(tx=>persistNpcResident(tx,p,'unauthorized')),/活动实例/);
});

test('the population schedules raid fallback only in the current closing window and persists it across reloads',async()=>{
 const store=new MemoryStore(),p=npc(),reset=raidResetWall(now),start=reset-NPC_PROGRESS.raidFallbackMs-120000;
 await store.transaction(async tx=>{
  await persistNpcResident(tx,p,'seed-raid');
  await tx.put('characters',{id:'human',kind:'hero',accountId:'a',rules:{level:60}});
  await tx.put('social_people',{id:'human',seenAt:start});
  await updateNpcPopulation(tx,start);
 });
 const tick=(wall:number)=>store.transaction(async tx=>{await tx.put('social_people',{id:'human',seenAt:wall});return updateNpcPopulation(tx,wall);});
 await tick(start+60000);
 assert.equal((await store.read(tx=>tx.get<NpcCharacter>('npc_characters',p.id)))!.profile.raidRuns,0);
 await tick(start+120000);
 const row=(await store.read(tx=>tx.get<NpcCharacter>('npc_characters',p.id)))!;assert.equal(row.profile.raidRuns,2);
 assert.equal(row.profile.raidLockouts['molten-core'].week,raidWeek(start));
 const ledgers=await store.read(tx=>tx.list('ledger'));await tick(start+120000);
 assert.deepEqual(await store.read(tx=>tx.get('npc_characters',p.id)),row);assert.deepEqual(await store.read(tx=>tx.list('ledger')),ledgers);
});
