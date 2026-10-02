import {updateNpcPopulation} from '../src/npc-population.ts';
import {loadNpcResident} from '../src/npc-characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {PostgresStore, type SqlPool} from '../../persistence/src/postgres.ts';
import {SimulationRepository} from '../../persistence/src/simulation.ts';
import type {Store, TableName} from '../../persistence/src/store.ts';
import {GameService} from '../src/service.ts';
import {ResidentCharacters} from '../src/resident-characters.ts';
import {residentStore} from '../src/resident-store.ts';
import {context, persistCharacter} from '../src/context.ts';
import type {Character, Rules} from '../src/model.ts';
import {enterGoldRaid, goldRaidAction, goldAuctionStep, finishGoldRun} from '../src/rules/gold-raid.js';
import {ResidentInstance} from '../../../apps/simulation-host/src/instance.ts';
import {runtimeVersion} from '../../../apps/simulation-host/src/version.ts';
import {stats} from '../src/rules/character.js';

function pool(db: PGlite): SqlPool {
  let tail = Promise.resolve();
  return {async connect() { const previous = tail; let release!: () => void;
    tail = new Promise(resolve => { release = resolve; }); await previous;
    return {query: async (sql, values) => sql.includes('CREATE TABLE') ? (await db.exec(sql), {rows: []}) : db.query(sql, values), release};
  }, end: () => db.close()};
}

for (const backend of ['memory', 'sql'] as const) test(`${backend}: independent NPC assets survive raid settlement, rollback, fencing and reload`, async t => {
  const raw: Store = backend === 'memory' ? new MemoryStore() : new PostgresStore(pool(new PGlite()));
  if (raw instanceof PostgresStore) await raw.initialize();
  let countWrites = false, npcWrites = 0;
  const observed: Store = {read: work => raw.read(work), heartbeat: (...args) => raw.heartbeat(...args), close: () => raw.close(),
    transaction: (work, options) => raw.transaction(tx => work({...tx, put: async (table, row) => {
      if (countWrites && (table === 'npc_characters' || ['wallets', 'items'].includes(table) &&
        String(row.ownerCharacterId ?? row.characterId).startsWith('npc:'))) npcWrites++;
      await tx.put(table, row);
    }}), options)};
  const store = residentStore(observed), game = new GameService(store, {contentVersion: 'npc-assets', seed: () => 283});
  try {
    const save = await game.createSave('npc-owner', {name: '独立资产', classId: 8, raceId: 1, raidReady: true}, 'create');
    const character = (await store.read(tx => tx.list<Character>('characters', {accountId: save.id})))[0];
    assert.equal(character.rules.npcWorld,undefined);
    const residents=await store.transaction(tx=>updateNpcPopulation(tx,Date.now(),{level:60,minimumLevel:60,raidId:'molten-core'}));
    const characters = new ResidentCharacters(store, {version: runtimeVersion});
    const admission = await characters.admission(save.id, character.id);
    admission.state.npcWorld={publicPool:true,residents,selection:[],autoLoot:false,board:{ids:[],shown:{},sequence:0,refreshAt:0}};
    await store.transaction(async tx=>{for(const p of residents)await tx.insert('simulation_characters',{id:p.id,accountId:null,instanceId:admission.instanceId});});
    let fail = false;
    const repository = new SimulationRepository(store, Date.now, async (tx, boundary) => {
      await characters.commit(tx, boundary); if (fail) throw new Error('after NPC assets');
    });
    const owner = await repository.acquire(admission.instanceId, 'npc-host', 60_000);
    const checkpoint = (state: Rules) => new ResidentInstance({...admission, state, ownerEpoch: owner.epoch}).checkpoint();
    await repository.commit(owner, 1, checkpoint(admission.state));
    const state = structuredClone(admission.state);
    enterGoldRaid(state); goldRaidAction(state, {type: 'goldPublish'});
    goldRaidAction(state, {type: 'goldRecommend'}); goldRaidAction(state, {type: 'goldLaunch'});
    const npc = state.party.find((c: Rules) => c.classId === 8), originalMoney = npc.money;
    npc.equipment = {};
    state.goldRaid.auctions = [{id: 'npc-boots', bossId: 'lucifron', itemId: 16800, count: 1,
      leader: null, price: 0, playerLimit: null, opening: 100000, step: 50000, quiet: 0, round: 0,
      limits: {[npc.id]: 100000}, bids: []}];
    for (let i = 0; i < 4; i++) goldAuctionStep(state);
    const won = npc.equipment[8]; assert.equal(won.id, 16800);
    for (const seat of state.goldRaid.seats) state.goldRaid.contributions[seat.id] = {damage: 100, healing: 100, seconds: 10, kills: 1};
    finishGoldRun(state);
    const share = state.goldRaid.settlement.rows.find((r: Rules) => r.id === npc.id).total;
    assert.equal(npc.money, originalMoney - 100000 + share);
    const tables: TableName[] = ['characters', 'npc_characters', 'wallets', 'items', 'ledger', 'simulation_owners', 'simulation_checkpoints', 'simulation_commits', 'outbox'];
    const snapshot = () => store.read(async tx => Object.fromEntries(await Promise.all(tables.map(async table => [table, await tx.list(table)]))));
    const before = await snapshot(), saved = checkpoint(state);
    fail = true; await assert.rejects(repository.commit(owner, 2, saved), /after NPC assets/);
    assert.deepEqual(await snapshot(), before);
    fail = false; await repository.commit(owner, 2, saved);
    const after = await snapshot();
    assert.equal(after.items.find((row: Rules) => row.id === won.uid).ownerCharacterId, npc.id);
    assert.equal(after.wallets.find((row: Rules) => row.id === npc.id).balance, npc.money);
    const moneyEntries = after.ledger.filter((row: Rules) => row.characterId === npc.id && row.businessKey === `simulation:${owner.id}:2` && row.kind !== 'item');
    assert.equal(moneyEntries.length, 1);
    assert.equal(moneyEntries[0].amount, npc.money - before.wallets.find((row: Rules) => row.id === npc.id).balance,
      'ledger includes the launch reagent purchase as well as auction escrow and dividend');
    await repository.commit(owner, 2, saved); assert.deepEqual(await snapshot(), after);
    const negative = structuredClone(saved);
    negative.state.party.find((c: Rules) => c.id === npc.id).money = -1;
    await assert.rejects(repository.commit(owner, 3, negative), /余额/);
    assert.deepEqual(await snapshot(), after);
    const duplicate = structuredClone(saved);
    duplicate.state.party.find((c: Rules) => c.id !== npc.id).raidCollection.push(won);
    await assert.rejects(repository.commit(owner, 3, duplicate), /跨角色/);
    assert.deepEqual(await snapshot(), after);
    for (const mutation of [
      (tx: any) => tx.put('wallets', {id: npc.id, characterId: npc.id, accountId: save.id, balance: 1}),
      (tx: any) => tx.delete('items', won.uid),
      (tx: any) => tx.delete('npc_characters', npc.id),
      (tx: any) => tx.delete('simulation_characters', npc.id),
    ]) await assert.rejects(store.transaction(mutation), /模拟实例/);
    const returned=await store.read(async tx=>loadNpcResident(tx,(await tx.get<any>('npc_characters',npc.id))!));
    assert.equal(returned.wallet,npc.money);assert.equal(returned.unit.equipment[8].uid,won.uid);assert.equal(returned.raidRuns,1);
    await repository.release(owner); const replacement = await repository.acquire(owner.id, 'replacement', 60_000);
    await assert.rejects(repository.commit(owner, 3, saved), /fenced/);
    countWrites = true; const started = performance.now();
    await repository.commit(replacement, 3, {...saved, ownerEpoch: replacement.epoch});
    t.diagnostic(`${backend}: unchanged 72-NPC checkpoint ${(performance.now() - started).toFixed(1)}ms; NPC record/item/wallet writes=${npcWrites}`);
    countWrites = false; assert.equal(npcWrites, 0, 'unchanged NPCs do not rewrite assets or profiles, including through JSONB');
    const recovered = await snapshot(); assert.deepEqual(recovered.wallets, after.wallets); assert.deepEqual(recovered.items, after.items);
    assert.deepEqual(recovered.ledger, after.ledger, 'epoch change cannot duplicate the NPC dividend or loot');
    await characters.deleteSave('npc-owner', save.id);
    assert.equal((await store.read(tx=>tx.list('npc_characters'))).length,72,'public NPCs survive deleting their last human host');
    assert.equal((await store.read(tx=>tx.get('wallets',npc.id)))!.balance,npc.money);
    for (const table of ['npc_characters', 'wallets', 'items', 'simulation_characters'] as const)
      assert.equal((await store.read(tx => tx.list(table, {accountId: save.id}))).length, 0);
  } finally { await store.close(); }
});
