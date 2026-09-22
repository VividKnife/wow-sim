import {seedCompanion} from './support/characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {stats} from '../src/rules/character.js';
import {dungeonRoute as routeFor} from '../src/rules/dungeon.js';
const dungeonRoute=routeFor('deadmines');
import type {Character, Instance, Activity} from '../src/model.ts';

async function fixture() {
    const store = new MemoryStore();
    let now = 1000;
    const service = new GameService(store, {contentVersion: 'v1', now: () => now, seed: () => 123});
    const hero = (await service.createAccount('a', {name: 'Hero', classId: 8, raceId: 1}, 'create')).account.primaryCharacterId;
    return {store, service, hero, time: (value: number) => { now = value; }};
}

test('old-version revive can be escaped; committed assets survive and old workers are fenced', async () => {
    const f = await fixture();
    const instanceId = (await f.service.command('a', {type: 'createInstance', requestId: 'form'})).instanceId!;
    await f.service.command('a', {type: 'startInstance', instanceId, requestId: 'start'});
    await f.store.transaction(async tx => {
        const c = (await tx.get<Character>('characters', f.hero))!;
        c.rules.hp = 0; c.rules.location = 'deadmines';
        c.rules.dungeonSaves = {deadmines:{runId:'obsolete'}};
        c.professionReadyAt = {alchemy: 9000};
        await tx.put('characters', c);
        const i = (await tx.get<Instance>('instances', instanceId))!;
        i.simulation!.combat = null;
        i.simulation!.activity = {type: 'revive', endsAt: i.simulation!.clock + 10000, targets: [f.hero]};
        i.playback = {id: 'future', encounterId: 'battle', startsAt: 1000, endsAt: 5000, startClock: 1000, endClock: 5000};
        await tx.put('instances', i);
        await tx.insert('combat_plans', {id: instanceId, futureReward: 999});
    });
    const oldLease = await f.service.acquireInstanceLease(instanceId, 'old-worker');
    const assets = await f.store.transaction(async tx => ({items: await tx.list('items'), wallets: await tx.list('wallets'), claims: await tx.list('reward_claims')}));
    f.service.contentVersion = 'v2';
    const command = {type: 'unstuck', requestId: 'escape'};
    const result = await f.service.command('a', command);
    assert.equal(result.instanceId, null);
    assert.equal(result.state.activity.type, 'idle');
    assert.equal(result.state.hp, Math.ceil(stats(result.state).maxHp / 2));
    assert.equal(result.state.location, 'moonbrook');
    assert.deepEqual(result.state.dungeonSaves?.deadmines, {runId: 'obsolete'});
    assert.equal(result.state.combat, null);
    assert.equal((await f.store.transaction(tx => tx.get<Character>('characters', f.hero)))!.professionReadyAt.alchemy, 9000);
    assert.deepEqual(await f.store.transaction(async tx => ({items: await tx.list('items'), wallets: await tx.list('wallets'), claims: await tx.list('reward_claims')})), assets);
    assert.equal(await f.store.transaction(tx => tx.get('combat_plans', instanceId)), null);
    await assert.rejects(f.service.advanceInstance(instanceId, 'old-worker', oldLease.epoch), /租约已失效/);
    assert.deepEqual((await f.service.work()).errors, []);
    const rows = await f.store.transaction(tx => tx.list('characters'));
    await f.service.command('a', command);
    assert.deepEqual(await f.store.transaction(tx => tx.list('characters')), rows);
    await f.service.command('a', {type: 'createInstance', requestId: 'new-adventure'});
});

test('shared-instance escape releases everyone and notifies other accounts; unrelated actors cannot invoke it', async () => {
    const f = await fixture();
    const guest = (await f.service.createAccount('b', {name: 'Guest', classId: 8, raceId: 1}, 'create')).account.primaryCharacterId;
    const id = (await f.service.command('a', {type: 'createInstance', requestId: 'form'})).instanceId!;
    await f.service.command('b', {type: 'joinInstance', instanceId: id, requestId: 'join'});
    await f.service.command('a', {type: 'startInstance', instanceId: id, requestId: 'start'});
    await assert.rejects(f.service.command('a', {type: 'unstuck', characterId: guest, requestId: 'spoof'}), /不属于/);
    const revision = (await f.service.snapshot('a')).revision;
    await f.service.command('b', {type: 'unstuck', requestId: 'escape'});
    assert.equal((await f.service.snapshot('a')).instanceId, null);
    assert.ok((await f.service.snapshot('a')).revision > revision);
    assert.equal((await f.service.snapshot('b')).instanceId, null);
    assert.equal((await f.store.transaction(tx => tx.list('actor_leases'))).length, 0);
});

test('healthy personal activities can be cancelled immediately and repeated recovery stays safe', async () => {
    const f = await fixture();
    await f.service.command('a', {type: 'travel', to: 'goldshire', requestId: 'travel'});
    const activity = (await f.store.read(tx => tx.list<Activity>('activities')))[0];
    assert.ok(activity.nextEventAt > 1000);
    const result = await f.service.command('a', {type: 'unstuck', requestId: 'early'});
    assert.equal(result.state.activity.type, 'idle');
    assert.equal(result.state.location, 'northshire');
    assert.equal((await f.store.read(tx => tx.get<Activity>('activities', activity.id)))!.status, 'cancelled');
    const assets = await f.store.read(async tx => ({items:await tx.list('items'),wallets:await tx.list('wallets')}));
    await f.service.command('a', {type:'unstuck',requestId:'again'});
    assert.deepEqual(await f.store.read(async tx => ({items:await tx.list('items'),wallets:await tx.list('wallets')})),assets);
    assert.deepEqual((await f.service.work()).errors,[]);
});

test('a free character can clear residual combat and casting without an activity lease',async()=>{
    const f = await fixture();
    await f.store.transaction(async tx => {
        const c = (await tx.get<Character>('characters',f.hero))!;
        c.rules.combat = {broken:true};c.rules.cast={broken:true};c.rules.hp=0;
        await tx.put('characters',c);
    });
    const result = await f.service.command('a',{type:'unstuck',requestId:'free'});
    assert.equal(result.state.combat,null);assert.equal(result.state.cast,null);
    assert.equal(result.state.hp,Math.ceil(stats(result.state).maxHp/2));
    assert.equal(result.state.activity.type,'idle');
});

test('orphaned instance leases can be cleared without running broken reconnect logic',async()=>{
    const f=await fixture();
    const id=(await f.service.command('a',{type:'createInstance',requestId:'form'})).instanceId!;
    await f.service.command('a',{type:'startInstance',instanceId:id,requestId:'start'});
    await f.service.acquireInstanceLease(id,'worker');
    await f.store.transaction(async tx=>{
        await tx.delete('instances',id);
        await tx.insert('combat_plans',{id,broken:true});
    });
    f.time(10_000_000);
    const result=await f.service.command('a',{type:'unstuck',requestId:'orphan'});
    assert.equal(result.instanceId,null);assert.equal(result.state.activity.type,'idle');
    assert.deepEqual(await f.store.read(tx=>tx.list('actor_leases')),[]);
    assert.equal(await f.store.read(tx=>tx.get('instance_leases',id)),null);
    assert.equal(await f.store.read(tx=>tx.get('combat_plans',id)),null);
});

for (const orphan of [false,true]) test(`cancelling ${orphan?'orphaned':'healthy'} craft refunds materials and the original tool once without creating output`, async () => {
    const f = await fixture();
    await f.store.transaction(async tx => {
        const c = (await tx.get<Character>('characters', f.hero))!;
        c.rules.professions = {enchanting: {skill: 1, cap: 75}};
        await tx.put('characters', c);
        for (const [id, itemId] of [['dust', 10940], ['rod', 6339]] as const)
            await tx.insert('items', {id, accountId: 'a', ownerCharacterId: f.hero, container: 'bag', position: 100, data: {id: itemId, count: 1, bound: true, durability: 7}, source: 'fixture'});
    });
    const rod = (await f.store.transaction(tx => tx.get('items', 'rod')))!.data;
    await f.service.command('a', {type: 'craft', id: 'spell-7418', count: 1, requestId: 'craft'});
    if (orphan) await f.store.transaction(async tx=>{for(const row of await tx.list('activities'))await tx.delete('activities',row.id);});
    const command = {type: 'unstuck', requestId: 'escape'};
    await f.service.command('a', command);
    await f.service.command('a', command);
    const rows = await f.store.transaction(tx => tx.list('items'));
    assert.deepEqual(rows.find(i => i.id === 'rod')!.data, rod);
    assert.equal(rows.find(i => i.id === 'rod')!.container, 'bag');
    assert.equal(rows.filter(i => i.data.id === 10940).reduce((n, i) => n + i.data.count, 0), 1);
    assert.ok(rows.every(i => i.data.id !== 907418));
    assert.equal((await f.store.transaction(tx => tx.list('reservations')))[0].status, 'released');
    assert.deepEqual((await f.service.work()).errors, []);
});

async function dungeonFixture() {
    const f = await fixture();
    for (let i = 0; i < 4; i++) await seedCompanion(f.service,'a',{type: 'createCompanion', name: `Ally${i}`, classId: 8, raceId: 1, requestId: `ally${i}`});
    const ids = await f.store.transaction(async tx => {
        const characters = await tx.list<Character>('characters', {accountId: 'a'});
        for (const c of characters) {
            c.rules.level = 20; c.rules.location = 'deadmines';
            c.rules.hp = stats(c.rules).maxHp; c.rules.mana = stats(c.rules).maxMana;
            await tx.put('characters', c);
        }
        return characters.map(c => c.id);
    });
    await f.service.command('a', {type: 'setParty', characterIds: ids, requestId: 'party'});
    const instanceId = (await f.service.command('a', {type: 'enterDungeon', requestId: 'enter'})).instanceId!;
    return {...f, instanceId};
}

test('escape preserves dungeon checkpoint on the leader and reentry retries only surviving enemies at full health', async () => {
    const f = await dungeonFixture();
    await f.store.transaction(async tx => {
        const instance = (await tx.get<Instance>('instances', f.instanceId))!;
        const d = instance.simulation!.dungeon;
        d.cursor = 1;
        d.cleared[dungeonRoute[0].id] = true;
        for (const guid of dungeonRoute[0].sourceGuids) d.defeated[guid] = true;
        await tx.put('instances', instance);
    });
    const started = await f.service.command('a', {type: 'dungeonNext', requestId: 'fight'});
    const checkpoint = structuredClone(started.state.dungeon);
    checkpoint.autoAdvance = false;
    checkpoint.advanceReason = '';
    await f.store.transaction(async tx => {
        const instance = (await tx.get<Instance>('instances', f.instanceId))!;
        instance.simulation!.combat.enemies[0].hp = 1;
        await tx.put('instances', instance);
    });
    const escaped = await f.service.command('a', {type: 'unstuck', requestId: 'escape'});
    assert.deepEqual(escaped.state.dungeonSaves?.deadmines, checkpoint);
    const characters = await f.store.transaction(tx => tx.list<Character>('characters'));
    assert.ok(characters.filter(c => c.id !== f.hero).every(c => !c.rules.dungeonSaves?.deadmines));
    const travel = await f.service.command('a', {type: 'travel', to: 'deadmines', requestId: 'return'});
    f.time(travel.state.wallAt + travel.state.activity.endsAt - travel.state.clock);
    assert.deepEqual((await f.service.work()).errors, []);
    const entered = await f.service.command('a', {type: 'enterDungeon', requestId: 'reenter'});
    assert.deepEqual(entered.state.dungeon, checkpoint);
    const fight = await f.service.command('a', {type: 'dungeonNext', requestId: 'retry'});
    assert.equal(fight.state.combat.routeId, dungeonRoute[checkpoint.cursor].id);
    assert.ok(fight.state.combat.enemies.every((e: any) => e.hp === e.maxHp && !checkpoint.defeated[e.sourceGuid]));
    assert.notEqual(entered.instanceId, f.instanceId);
    assert.equal(fight.state.dungeon.runId, checkpoint.runId);
});

test('cancelling a stuck cannon refunds its consumed powder once and preserves the unopened door', async () => {
    const f = await dungeonFixture();
    const cursor = dungeonRoute.findIndex((e: any) => e.id === 'dm-cannon');
    const encounter = dungeonRoute[cursor];
    const powder = encounter.interaction!.item;
    await f.store.transaction(async tx => {
        const instance = (await tx.get<Instance>('instances', f.instanceId))!;
        const s = instance.simulation!;
        s.dungeon.cursor = cursor;
        s.activity = {type: 'dungeonCannon', routeId: encounter.id, endsAt: s.clock + 10000};
        await tx.put('instances', instance);
    });
    const command = {type: 'unstuck', requestId: 'escape'};
    await f.service.command('a', command);
    const after = await f.service.command('a', command);
    assert.equal(after.state.dungeonSaves?.deadmines.cursor, cursor);
    assert.equal(after.state.dungeonSaves?.deadmines.interactions[encounter.id], undefined);
    assert.equal([...after.state.bag, ...after.state.pending].filter(i => i.id === powder).reduce((n, i) => n + i.count, 0), 1);
});
