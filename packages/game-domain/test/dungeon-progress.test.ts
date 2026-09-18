import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {makeItem, stats} from '../src/rules/character.js';
import {dungeonView} from '../src/rules/dungeon-view.js';
import type {Character, Instance, Rules} from '../src/model.ts';

async function setup() {
 const store = new MemoryStore();
 const options = {contentVersion:'test', now:()=>1000, seed:()=>1234};
 let service = new GameService(store, options), request = 0;
 await service.createAccount('a', {name:'队长', classId:1, raceId:1}, 'create');
 const send = (command:Record<string, unknown>) => service.command('a', {...command, requestId:`command-${++request}`});
 for (const classId of [5, 4, 8, 2]) await send({type:'createCompanion', name:`队员${classId}`, classId, raceId:1});
 const ids = await store.transaction(async tx => {
  const characters = await tx.list<Character>('characters', {accountId:'a'});
  for (const c of characters) {
   c.rules.level = 20;
   c.rules.location = 'deadmines';
   const st: Rules = stats(c.rules);
   c.rules.hp = st.maxHp;
   c.rules.mana = st.maxMana;
   await tx.put('characters', c);
  }
  return characters.map(c => c.id);
 });
 await send({type:'setParty', characterIds:ids});
 return {store, send, restart:()=>{service = new GameService(store, options);}, snapshot:()=>service.snapshot('a')};
}

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
  assert.deepEqual(left.state.dungeonSave, route);
  assert.equal(dungeonView(left.state).saved, true);
  assert.equal(dungeonView(left.state).canReset, true);
  await game.send({type:'sortBag'});
  const linen = left.state.bag.find((item:Rules) => item.id === 2589);
  const edited = await game.send({type:'lockItem', uid:linen.uid});
  game.restart();
  assert.deepEqual((await game.snapshot()).state.dungeonSave, route);
  const returned = await game.send({type:'enterDungeon'});
  assert.deepEqual(returned.state.dungeon, route);
  assert.equal(returned.state.dungeonSave, undefined);
  assert.equal(returned.state.dungeonEntries.length, 1);
  assert.equal(returned.state.party.length, 4);
  assert.deepEqual(returned.state.bag, edited.state.bag);
 }
 await game.send({type:'leaveDungeon'});
 const beforeReset = (await game.snapshot()).state;
 await game.send({type:'resetDungeon'});
 game.restart();
 assert.equal((await game.snapshot()).state.dungeonSave, undefined);
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
