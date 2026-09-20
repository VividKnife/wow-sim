import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {makeItem, stats} from '../src/rules/character.js';
import {dungeonView} from '../src/rules/dungeon-view.js';
import {dungeonRoute as routeFor} from '../src/rules/dungeon.js';
const dungeonRoute=routeFor('deadmines');
import type {Character, Instance, Rules} from '../src/model.ts';

async function setup(contentId='deadmines') {
 const store = new MemoryStore();
 let now=1000;
 const options = {contentVersion:'test', now:()=>now, seed:()=>1234};
 let service = new GameService(store, options), request = 0;
 await service.createAccount('a', {name:'队长', classId:1, raceId:1}, 'create');
 await store.transaction(async tx=>{
  const [leader]=await tx.list<Character>('characters',{accountId:'a'});
  leader.rules.level=20;leader.rules.location='stormwind';leader.rules.completed[900001]=true;
  await tx.put('characters',leader);
 });
 const send = (command:Record<string, unknown>) => service.command('a', {...command, requestId:`command-${++request}`});
 for (const classId of [5, 4, 8, 2]) await send({type:'createCompanion', name:`队员${classId}`, classId, raceId:1});
 const ids = await store.transaction(async tx => {
  const characters = await tx.list<Character>('characters', {accountId:'a'});
  for (const c of characters) {
   c.rules.level = 20;
   c.rules.location = contentId;
   const st: Rules = stats(c.rules);
   c.rules.hp = st.maxHp;
   c.rules.mana = st.maxMana;
   await tx.put('characters', c);
  }
  return characters.map(c => c.id);
 });
 await send({type:'setParty', characterIds:ids});
 return {store, send, restart:()=>{service = new GameService(store, options);}, snapshot:()=>service.snapshot('a'), work:async(ms:number)=>{now+=ms;return service.work();}};
}

test('Stockades service entry, worker, exit and restart preserve the selected content and saved route',async()=>{
 const game=await setup('stockades');
 const entered=await game.send({type:'enterDungeon',contentId:'stockades'});
 assert.ok(entered.instance);assert.equal(entered.instance.contentId,'stockades');assert.equal(entered.state.dungeon.id,'stockades');
 const runId=entered.state.dungeon.runId;
 const started=await game.send({type:'dungeonNext'});assert.equal(started.state.combat.runId,runId);
 await game.send({type:'dungeonPause'});
 for(let i=0;i<120&&(await game.snapshot()).state.combat;i++)await game.work(1000);
 const settled=await game.snapshot();assert.equal(settled.state.combat,null);
 if(settled.state.hp<=0){await game.send({type:'revive'});for(let i=0;i<12;i++)await game.work(1000);}
 await game.send({type:'leaveDungeon'});game.restart();
 const saved=await game.snapshot();assert.equal(saved.state.dungeonSaves.stockades.runId,runId);
 const returned=await game.send({type:'enterDungeon',contentId:'stockades'});
 assert.equal(returned.state.dungeon.id,'stockades');assert.equal(returned.state.dungeon.runId,runId);
 assert.equal(returned.state.dungeonEntries.length,1);
});

test('the instance worker preserves automatic advancement across restart and accepts pause during combat', async () => {
 const game=await setup();const entered=await game.send({type:'enterDungeon'});
 const started=await game.send({type:'dungeonNext'});
 assert.equal(dungeonView(started.state).autoAdvance,true);const first=started.state.combat.id;
 // Controlled victory: isolate service persistence and worker orchestration.
 await game.store.transaction(async tx=>{
  const instance=(await tx.get<Instance>('instances',entered.instanceId!))!;
  const s=instance.simulation!;for(const e of s.combat.enemies){e.hp=0;e.rewarded=true;}
  s.combat.pull.startsAt=s.clock;s.combat.pull.engagedAt=s.clock;
  await tx.put('instances',instance);
 });
 game.restart();assert.deepEqual((await game.work(1000)).errors,[]);
 let next=await game.snapshot();
 for(let i=0;i<180&&!next.state.combat;i++){assert.deepEqual((await game.work(1000)).errors,[]);next=await game.snapshot();}
 assert.equal(next.state.dungeon.cursor,1);assert.notEqual(next.state.combat.id,first);assert.equal(dungeonView(next.state).autoAdvance,true);
 const paused=await game.send({type:'dungeonPause'});assert.equal(dungeonView(paused.state).autoAdvance,false);assert.equal(paused.state.combat.id,next.state.combat.id);
 game.restart();assert.equal(dungeonView((await game.snapshot()).state).autoAdvance,false);
});

test('the worker automatically loots and starts the next pull without polling or loot commands',async()=>{
 const game=await setup(),entered=await game.send({type:'enterDungeon'});
 await game.send({type:'settings',autoLoot:true});
 const started=await game.send({type:'dungeonNext'}),first=started.state.combat.id;
 const before=await game.store.transaction(async tx=>{
  const instance=(await tx.get<Instance>('instances',entered.instanceId!))!,s=instance.simulation!;
  const drop={...makeItem(s,25,1),lootBattleId:first};s.pending.push(drop);
  for(const e of s.combat.enemies){e.hp=0;e.rewarded=true;}
  s.combat.pull.startsAt=s.clock;s.combat.pull.engagedAt=s.clock;
  await tx.put('instances',instance);return s.bag.filter((i:Rules)=>i.id===25).length;
 });
 game.restart();assert.deepEqual((await game.work(1000)).errors,[]);
 let instance=await game.store.transaction(tx=>tx.get<Instance>('instances',entered.instanceId!));
 for(let i=0;i<180&&!instance!.simulation!.combat;i++){
  assert.deepEqual((await game.work(1000)).errors,[]);
  instance=await game.store.transaction(tx=>tx.get<Instance>('instances',entered.instanceId!));
 }
 const s=instance!.simulation!;
 assert.equal(s.pending.length,0);assert.equal(s.bag.filter((i:Rules)=>i.id===25).length,before+1);
 assert.ok(s.combat);assert.notEqual(s.combat.id,first);assert.equal(s.dungeon.autoAdvance,true);
});

test('the worker recovers priest mana and resurrects the leader after the final encounter across restart',async()=>{
 const game=await setup(),entered=await game.send({type:'enterDungeon'});
 await game.store.transaction(async tx=>{
  const instance=(await tx.get<Instance>('instances',entered.instanceId!))!,s=instance.simulation!;
  s.dungeon.cursor=dungeonRoute.length-1;
  // The service fixture levels characters explicitly; give its priest the actual resurrection spell.
  s.party.find((c:Rules)=>c.classId===5).learned.push(2006);
  await tx.put('instances',instance);
 });
 await game.send({type:'dungeonNext'});
 await game.store.transaction(async tx=>{
  const instance=(await tx.get<Instance>('instances',entered.instanceId!))!,s=instance.simulation!;
  s.hp=0;s.party.find((c:Rules)=>c.classId===5).mana=0;
  for(const e of s.combat.enemies){e.hp=0;e.rewarded=true;}
  s.combat.pull.startsAt=s.clock;s.combat.pull.engagedAt=s.clock;
  await tx.put('instances',instance);
 });
 assert.deepEqual((await game.work(1000)).errors,[]);
 let snapshot=await game.snapshot();assert.ok(snapshot.state.dungeon.completedAt);assert.equal(snapshot.instance!.status,'running');assert.equal(snapshot.state.dungeon.autoAdvance,true);
 game.restart();
 for(let i=0;i<180&&snapshot.state.activity.type!=='resurrect';i++){assert.deepEqual((await game.work(1000)).errors,[]);snapshot=await game.snapshot();}
 assert.equal(snapshot.state.activity.type,'resurrect');game.restart();
 for(let i=0;i<20&&snapshot.state.hp<=0;i++){assert.deepEqual((await game.work(1000)).errors,[]);snapshot=await game.snapshot();}
 assert.ok(snapshot.state.hp>0);assert.equal(snapshot.state.dungeon.autoAdvance,false);assert.equal(snapshot.instance!.status,'completed');
});

test('server preserves the full dungeon route through leaving, inventory work and service restart', async () => {
 const game = await setup();
 const entered = await game.send({type:'enterDungeon'});
 const route = await game.store.transaction(async tx => {
  const instance = (await tx.get<Instance>('instances', entered.instanceId!))!;
  const d = instance.simulation!.dungeon;
  instance.simulation!.bag.push(makeItem(instance.simulation!, 2589, 3));
  d.cursor = 2;
  d.cleared['dm-entrance'] = true;
  d.defeated[Object.keys(d.spawns)[0]] = true;
  d.defeatedBosses[644] = true;
  d.interactions['dm-cannon'] = true;
  d.metrics = {version:1, runId:d.runId, actors:{}, durationMs:12345, segments:2};
  await tx.put('instances', instance);
  return structuredClone(d);
 });
 for (const leaveType of ['leaveDungeon', 'leaveInstance']) {
  const left = await game.send({type:leaveType});
  assert.equal(left.instanceId, null);
  assert.equal(left.state.dungeon, undefined);
  assert.deepEqual(left.state.dungeonSaves?.deadmines, route);
  assert.equal(dungeonView(left.state).saved, true);
  assert.equal(dungeonView(left.state).canReset, true);
  await game.send({type:'sortBag'});
  const linen = left.state.bag.find((item:Rules) => item.id === 2589);
  const edited = await game.send({type:'lockItem', uid:linen.uid});
  game.restart();
  assert.deepEqual((await game.snapshot()).state.dungeonSaves?.deadmines, route);
  const returned = await game.send({type:'enterDungeon'});
  assert.deepEqual(returned.state.dungeon, route);
  assert.equal(returned.state.dungeonSaves?.deadmines, undefined);
  assert.equal(returned.state.dungeonEntries.length, 1);
  assert.equal(returned.state.party.length, 4);
  assert.deepEqual(returned.state.bag, edited.state.bag);
 }
 await game.send({type:'leaveDungeon'});
 const beforeReset = (await game.snapshot()).state;
 await game.send({type:'resetDungeon'});
 game.restart();
 assert.equal((await game.snapshot()).state.dungeonSaves?.deadmines, undefined);
 const fresh = await game.send({type:'enterDungeon'});
 assert.notEqual(fresh.state.dungeon.runId, route.runId);
 assert.equal(fresh.state.dungeon.cursor, 0);
 assert.deepEqual(fresh.state.dungeon.defeated, {});
 assert.equal(fresh.state.dungeonEntries.length, 2);
 assert.deepEqual(fresh.state.bag, beforeReset.bag);
 assert.equal(fresh.state.money, beforeReset.money);
});

test('server counts new runs but allows saved-run reentry at the hourly limit', async () => {
 const game = await setup();
 for (let i = 0; i < 5; i++) {
  await game.send({type:'enterDungeon'});
  await game.send({type:'leaveDungeon'});
  if (i < 4) await game.send({type:'resetDungeon'});
 }
 const resumed = await game.send({type:'enterDungeon'});
 assert.equal(resumed.state.dungeonEntries.length, 5);
 await game.send({type:'leaveDungeon'});
 await game.send({type:'resetDungeon'});
 await assert.rejects(game.send({type:'enterDungeon'}), /每小时/);
 assert.equal((await game.snapshot()).instanceId, null);
});
