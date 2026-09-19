import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {classDefinitions,items,quests} from '../src/rules/catalog.js';
import {canEquip,bagCapacity,stats} from '../src/rules/character.js';
import {partyUnlocked,PARTY_QUEST} from '../src/rules/party-unlock.js';
import {boostEquipmentCandidates} from '../src/rules/boost.js';
import {tables} from '../../persistence/src/store.ts';
import {boostMount,mountView,beginMount,finishMount,travelRoute,buyMount} from '../src/rules/mounts.js';

const input={name:'旅人',classId:8,raceId:1};
const setup=()=>new GameService(new MemoryStore(),{contentVersion:'test',now:()=>1000,seed:()=>123});
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
test('boost grants legal quest equipment, four runecloth bags, full resources and leaves recruitment locked for every race/class',async()=>{
 const service=setup();
 for(const c of classDefinitions)for(const raceId of c.races){
  const {id}=await service.createSave(`user-${c.id}-${raceId}`,{...input,classId:c.id,raceId,boost:true},'boost-save');
  const snapshot=await service.snapshot(id),s=snapshot.state;
  assert.equal(s.level,20);assert.equal(s.xp,0);assert.equal(s.location,'goldshire');
  assert.equal(s.bags.length,4);assert.ok(s.bags.every((i:any)=>i.id===14046));assert.equal(bagCapacity(s),72);
  assert.deepEqual(s.mounts,[boostMount.id]);assert.equal(s.riding.horse,true);
  assert.equal(mountView(s).collection.find(m=>m.id===boostMount.id)!.canMount,true);
  const walking=travelRoute(s,'northshire');
  beginMount(s,boostMount.id);s.clock=s.activity.endsAt;finishMount(s);
  assert.equal(s.mounted,boostMount.id);
  assert.ok(travelRoute(s,'northshire').duration<walking.duration);
  assert.equal(s.hp,stats(s).maxHp);assert.equal(s.mana,stats(s).maxMana);
  assert.equal(partyUnlocked(s),false);assert.ok(s.quests[PARTY_QUEST]);assert.equal(s.party.length,0);assert.equal(snapshot.roster.length,1);
  assert.deepEqual(s.talents,{});
  for(const slot of [1,2,3,5,6,7,8,9,10,11,12,13,14,15,16])assert.ok(s.equipment[slot],`${c.id}/${raceId} slot ${slot}`);
  for(const e of Object.values(s.equipment) as any[]){
   if(!e.boostQuestId)continue;
   assert.ok(canEquip(s,items[e.id]));
   const q=quests[e.boostQuestId];assert.ok(q.MinLevel<=20&&q.QuestLevel<=20);
   if(e.boostQuestId===PARTY_QUEST){assert.ok(items[e.id].companionKit);assert.equal(items[e.id].RequiredLevel,18);}
   else assert.ok(Object.entries(q).some(([k,v])=>/^Rew(Choice)?ItemId/.test(k)&&v===e.id));
  }
  assert.ok(boostEquipmentCandidates(s).length);
  if(items[s.equipment[16].id].InventoryType===17)assert.equal(s.equipment[17],undefined);
  await assert.rejects(service.command(id,{type:'recruit',id:'mage',requestId:'recruit-too-early'}),/任务|暴风城/);
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
