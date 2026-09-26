import {racialHomes} from '../../game-data/world-content.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {classDefinitions,classAbilities,items,quests} from '../src/rules/catalog.js';
import {canEquip,bagCapacity,stats} from '../src/rules/character.js';
import {partyUnlocked} from '../src/rules/party-unlock.js';
import {boostEquipmentCandidates,LEVEL_20_BOOST_MONEY} from '../src/rules/boost.js';
import {ammoCount,ammoOptions,selectedAmmo,DEFAULT_AMMO_TARGET} from '../src/rules/ammunition.js';
import {tables} from '../../persistence/src/store.ts';
import {boostMount,mountView,beginMount,finishMount,travelRoute,buyMount} from '../src/rules/mounts.js';

const input={name:'旅人',classId:8,raceId:1};
const setup=()=>new GameService(new MemoryStore(),{contentVersion:'test',now:()=>1000,seed:()=>123});

test('invalid presence does not hide the save list or prevent deletion and recreation',async()=>{
 const service=setup();
 const old=await service.createSave('alice',input,'old');
 await service.store.transaction(tx=>tx.delete('account_presence',old.id));
 const list=await service.listSaves('alice');
 assert.equal(list.length,1);assert.equal(list[0].lastSeenAt,null);
 await assert.rejects(service.snapshot(old.id),{code:'ACCOUNT_STATE'});
 await service.deleteSave('alice',old.id);
 const fresh=await service.createSave('alice',input,'fresh');
 assert.equal((await service.listSaves('alice'))[0].id,fresh.id);
 assert.equal((await service.listSaves('alice'))[0].lastSeenAt,1000);
});
test('multiple saves are isolated, owner checked and creation retries do not duplicate',async()=>{
 const service=setup();
 const a=await service.createSave('alice',input,'first-save');
 assert.deepEqual(await service.createSave('alice',input,'first-save'),a);
 const b=await service.createSave('alice',{...input,name:'另一个',boost:true},'second-save');
 assert.equal((await service.listSaves('alice')).length,2);
 assert.deepEqual(await service.listSaves('bob'),[]);
 await assert.rejects(service.resolveSave('bob',a.id),/不存在/);
 await assert.rejects(service.deleteSave('bob',a.id),/不存在/);
 await assert.rejects(service.createSave('alice',{...input,boost:true},'first-save'),/请求编号/);
 assert.equal((await service.snapshot(a.id)).state.level,1);
 assert.equal((await service.snapshot(b.id)).state.level,20);
 await service.deleteSave('alice',a.id);
 assert.equal((await service.listSaves('alice')).length,1);
 assert.equal((await service.snapshot(b.id)).state.level,20);
 await assert.rejects(service.createSave('alice',input,'first-save'),/已删除/);
 await service.store.transaction(async tx=>{
  for(const table of tables)assert.equal((await tx.list(table,{accountId:a.id})).length,0,table);
 });
});
test('boost grants 50 gold, legal quest equipment, four runecloth bags, full resources and opens the adventure hall for every race/class',async()=>{
 const service=setup();
 for(const c of classDefinitions)for(const raceId of c.races){
  const {id}=await service.createSave(`user-${c.id}-${raceId}`,{...input,classId:c.id,raceId,boost:true},'boost-save');
  const snapshot=await service.snapshot(id),s=snapshot.state;
  assert.equal(s.level,20);assert.equal(s.xp,0);assert.equal(s.money,LEVEL_20_BOOST_MONEY);assert.equal(s.location,racialHomes[raceId as keyof typeof racialHomes].capital);
  assert.equal(s.bags.length,4);assert.ok(s.bags.every((i:any)=>i.id===14046));assert.equal(bagCapacity(s),72);
  assert.deepEqual(s.mounts,[boostMount.id]);assert.equal(s.riding.horse,true);
  assert.equal(mountView(s).collection.find(m=>m.id===boostMount.id)!.canMount,true);
  const destination=racialHomes[raceId as keyof typeof racialHomes].start;const walking=travelRoute(s,destination);
  beginMount(s,boostMount.id);s.clock=s.activity.endsAt;finishMount(s);
  assert.equal(s.mounted,boostMount.id);
  assert.ok(travelRoute(s,destination).duration<walking.duration);
  assert.equal(s.hp,stats(s).maxHp);assert.equal(s.mana,stats(s).maxMana);
  assert.equal(partyUnlocked(s),true);assert.equal(s.quests[900001],undefined);assert.equal(s.party.length,0);assert.equal(snapshot.roster.length,1);
  assert.deepEqual(s.talents,{});
  for(const ability of (classAbilities as Record<number,any[]>)[c.id].filter(a=>a.requiredLevel<=20&&['trainer','weapon','classQuest'].includes(a.acquisition)&&!a.requiredTalentSpellId&&(!(a.raceIds||a.startingRaces)?.length||(a.raceIds||a.startingRaces).includes(raceId))))assert.ok(s.learned.includes(ability.spellId),`${c.id}/${raceId} missing ${ability.name}`);
  if(c.id===3){
   assert.equal(ammoCount(s),DEFAULT_AMMO_TARGET);
   assert.equal(selectedAmmo(s)?.entry,ammoOptions(s)[0].entry);
   assert.equal(s.hunterPet.level,20);assert.equal(s.hunterPet.entry,299);
  }
  for(const slot of [1,2,3,5,6,7,8,9,10,11,12,13,14,15,16])assert.ok(s.equipment[slot],`${c.id}/${raceId} slot ${slot}`);
  for(const e of Object.values(s.equipment) as any[]){
   if(e.boostCompanionKit){assert.ok(items[e.id].companionKit);assert.equal(items[e.id].RequiredLevel,18);assert.ok(canEquip(s,items[e.id]));continue;}
   if(!e.boostQuestId)continue;
   assert.ok(canEquip(s,items[e.id]));
   const q=quests[e.boostQuestId];assert.ok(q.MinLevel<=20&&q.QuestLevel<=20);
   assert.ok(Object.entries(q).some(([k,v])=>/^Rew(Choice)?ItemId/.test(k)&&v===e.id));
  }
  assert.ok(boostEquipmentCandidates(s).length);
  if(items[s.equipment[16].id].InventoryType===17)assert.equal(s.equipment[17],undefined);
  await service.command(id,{type:'npcVisit',requestId:'visit'});const grouped=await service.command(id,{type:'npcRecommend',requestId:'group'});assert.equal(grouped.state.npcWorld.selection.length,4);assert.equal(grouped.state.party.length,0);
 }
});
test('gift mount survives service reload and respects normal riding restrictions without being purchasable',async()=>{
 const service=setup();
 const normal=await service.createSave('normal',input,'normal-save');
 assert.deepEqual((await service.snapshot(normal.id)).state.mounts,[]);
 const {id}=await service.createSave('orc',{...input,classId:1,raceId:2,boost:true},'gift-save');
 const restored=new GameService(service.store,{contentVersion:'test',now:()=>1000});
 const s=(await restored.snapshot(id)).state;
 assert.deepEqual(s.mounts,[boostMount.id]);assert.equal(s.riding.horse,true);
 for(const patch of [{level:19},{hp:0},{combat:{}},{swimming:true},{dungeon:{}},{location:'fargodeep'},{form:'bear'}]){
  const blocked={...structuredClone(s),...patch};
  assert.throws(()=>beginMount(blocked,boostMount.id));
 }
 assert.throws(()=>buyMount(s,boostMount.id),/礼包/);
 assert.throws(()=>beginMount({...s,mounts:[]},boostMount.id),/尚未拥有/);
 assert.equal(mountView(s).collection.find(m=>m.id===5656)!.canMount,false);
 const mounted=await restored.command(id,{type:'mount',id:boostMount.id,requestId:'summon-gift'});
 assert.equal(mounted.state.activity.type,'mount');
 restored.now=()=>5000;
 for(let tick=0;tick<3;tick++)assert.deepEqual((await restored.work()).errors,[]);
 assert.equal((await restored.snapshot(id)).state.mounted,boostMount.id);
});
test('invalid boost and race/class combinations do not leave partial saves',async()=>{
 const service=setup();
 await assert.rejects(service.createSave('alice',{...input,boost:'yes' as any},'bad-boost'));
 await assert.rejects(service.createSave('alice',{...input,classId:2,raceId:2},'bad-race'));
 assert.deepEqual(await service.listSaves('alice'),[]);
});
test('character gender is validated, persisted and returned in save summaries',async()=>{
 const service=setup();
 const {id}=await service.createSave('alice',{...input,gender:'female'},'female-save');
 assert.equal((await service.snapshot(id)).state.gender,'female');
 assert.equal((await service.listSaves('alice'))[0].gender,'female');
 await assert.rejects(service.createSave('bob',{...input,gender:'unknown' as any},'bad-gender'),/性别/);
 assert.deepEqual(await service.listSaves('bob'),[]);
});

test('raid-ready hero has clean identity, rebased resources and a usable travel mount',async()=>{
 const service=setup();
 const {id}=await service.createSave('raid-initial',{...input,gender:'female',raidReady:true},'initial');
 const s=(await service.snapshot(id)).state;
 assert.equal(s.level,60);assert.equal(s.xp,0);assert.equal(s.money,1000000);
 assert.equal(s.gender,'female');assert.equal(s.name,input.name);
 assert.deepEqual(s.professions,{});assert.equal(s.growthPolicy,undefined);
 assert.equal(s.roleId,undefined);assert.equal(s.joinedAt,undefined);
 assert.equal(s.time,s.clock);assert.equal(s.lastManaUse,s.clock-5000);
 assert.equal(s.hp,stats(s).maxHp);assert.equal(s.mana,stats(s).maxMana);
 assert.equal(bagCapacity(s),72);
 assert.equal(mountView(s).collection.find(m=>m.id===boostMount.id)!.canMount,true);
 for(const item of Object.values(s.equipment) as any[])assert.ok(canEquip(s,items[item.id]));
 assert.equal(s.completed[7848],1);assert.ok(s.bag.some((item:any)=>item.id===16309));
});
