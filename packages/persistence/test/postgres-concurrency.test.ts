import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PostgresStore} from '../src/postgres.ts';
import {GameService} from '../../game-domain/src/service.ts';

const url = process.env.POSTGRES_TEST_URL;
// Each run owns a fresh schema; never use or clear the game's public tables.
async function fixture(t: any) {
    const schema = `concurrency_${randomUUID().replaceAll('-','')}`;
    const admin = new pg.Pool({connectionString:url});
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({connectionString:url, options:`-c search_path=${schema}`,max:12});
    const store = new PostgresStore(pool);
    t.after(async () => { await store.close(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
    await store.initialize();
    let now = 1000;
    const service = new GameService(store,{contentVersion:'concurrency-test',now:()=>now,seed:()=>283});
    const created = await service.createAccount('a',{name:'Concurrent',classId:8,raceId:1},'create');
    return {store,service,pool,id:created.state.id,time:(n:number)=>{now=n;}};
}
function signal() { let resolve!:()=>void; const promise = new Promise<void>(r=>{resolve=r;}); return {promise,resolve}; }

test('real PostgreSQL: snapshot reads and heartbeats do not invalidate an economic transaction',{skip:!url},async t=>{
    const f=await fixture(t),ready=signal(),finish=signal();
    let attempts=0;
    const update=f.store.transaction(async tx=>{
        attempts++;
        const owner=(await tx.get('accounts','a'))!, wallet=(await tx.get('wallets',f.id))!;
        ready.resolve(); await finish.promise;
        await tx.put('wallets',{...wallet,balance:wallet.balance+10});
        await tx.put('accounts',{...owner,revision:owner.revision+1});
    },{attempts:1});
    await ready.promise;
    try {
        f.time(2200);
        await Promise.all(Array.from({length:12},()=>f.service.snapshot('a',undefined,true)));
        assert.equal((await f.store.read(tx=>tx.get('account_presence','a')))!.lastSeenAt,2200);
    } finally { finish.resolve(); }
    await update;
    assert.equal(attempts,1);
    assert.equal((await f.service.snapshot('a')).state.money,10);
});

test('real PostgreSQL: read view is stable across commits and cannot write',{skip:!url},async t=>{
    const f=await fixture(t);
    await f.store.read(async view=>{
        const before=await view.get('wallets',f.id);
        await f.store.transaction(async tx=>{await tx.put('wallets',{...before!,balance:50});});
        assert.deepEqual(await view.get('wallets',f.id),before);
        await assert.rejects((view as any).put('wallets',{...before,balance:100}),/Read-only/);
    });
    assert.equal((await f.service.snapshot('a')).state.money,50);
});

test('real PostgreSQL: concurrent spending cannot overdraw or lose updates',{skip:!url},async t=>{
    const f=await fixture(t);
    await f.store.transaction(async tx=>{const wallet=(await tx.get('wallets',f.id))!;await tx.put('wallets',{...wallet,balance:10});});
    const spend=(id:string)=>f.store.transaction(async tx=>{
        if(await tx.get('receipts',id))return true;
        const wallet=(await tx.get('wallets',f.id))!;
        if(wallet.balance<10)return false;
        await tx.put('wallets',{...wallet,balance:wallet.balance-10});
        await tx.insert('receipts',{id});
        await tx.insert('ledger',{id,amount:-10});
        return true;
    });
    const results=await Promise.all([spend('purchase-one'),spend('purchase-two')]);
    assert.equal(results.filter(Boolean).length,1);
    const receipt=(await f.store.read(tx=>tx.list('receipts'))).find(row=>row.id.startsWith('purchase-'))!;
    assert.equal(await spend(receipt.id),true);
    assert.equal((await f.service.snapshot('a')).state.money,0);
    assert.equal((await f.store.read(tx=>tx.list('ledger'))).filter(row=>row.id.startsWith('purchase-')).length,1);
});

test('real PostgreSQL: competing workers settle combat rewards once under polling',{skip:!url},async t=>{
    const f=await fixture(t);
    await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
    f.time(2000);assert.deepEqual((await f.service.work()).errors,[]);
    const before=await f.service.snapshot('a');
    assert.ok(before.playback);
    const plan=(await f.store.read(tx=>tx.get('combat_plans',before.activities[0].id)))!;
    f.time(before.playback.endsAt);
    const [a,b]=await Promise.all([f.service.work(),f.service.work(),...Array.from({length:8},()=>f.service.snapshot('a',undefined,true))]);
    assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
    // A rejected speculative commit remains due; the next iteration can finish it.
    for(let i=0;i<4&&(await f.service.snapshot('a')).state.wallAt<plan.finalState.wallAt;i++)await f.service.work();
    const after=await f.service.snapshot('a');
    assert.equal(after.state.xp,plan.finalState.xp);
    assert.equal(after.state.money,plan.finalState.money);
    const ledger=await f.store.read(tx=>tx.list('ledger'));
    await f.service.work();
    assert.deepEqual(await f.store.read(tx=>tx.list('ledger')),ledger);
});

test('real PostgreSQL: heartbeat is monotonic and does not resurrect deleted presence',{skip:!url},async t=>{
    const f=await fixture(t);
    await Promise.all([2200,3200,1800,2100].map(now=>f.store.heartbeat('a',now,1000,5000)));
    assert.equal((await f.store.read(tx=>tx.get('account_presence','a')))!.lastSeenAt,3200);
    assert.equal(await f.store.heartbeat('a',10000,1000,5000),false);
    await f.store.transaction(tx=>tx.delete('account_presence','a'));
    assert.equal(await f.store.heartbeat('a',4000,1000,5000),false);
    assert.equal(await f.store.read(tx=>tx.get('account_presence','a')),null);
});

test('real PostgreSQL: immediate recovery racing a worker and duplicate request leaves no active combat',{skip:!url},async t=>{
    const f=await fixture(t);
    await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
    f.time(2000);await f.service.work();
    const before=await f.service.snapshot('a');
    assert.ok(before.playback);
    f.time(before.playback.endsAt);
    const command={type:'unstuck',requestId:'recover'};
    const [work]=await Promise.all([f.service.work(),f.service.command('a',command),f.service.command('a',command)]);
    assert.deepEqual(work.errors,[]);
    const recovered=await f.service.snapshot('a');
    assert.equal(recovered.state.combat,null);
    assert.equal(recovered.state.activity.type,'idle');
    assert.equal(recovered.playback,null);
    assert.deepEqual(await f.store.read(tx=>tx.list('actor_leases')),[]);
    assert.deepEqual(await f.store.read(tx=>tx.list('combat_plans')),[]);
    const assets=await f.store.read(async tx=>({wallets:await tx.list('wallets'),items:await tx.list('items'),ledger:await tx.list('ledger')}));
    await f.service.work();
    await f.service.command('a',{type:'unstuck',requestId:'recover-again'});
    assert.deepEqual(await f.store.read(async tx=>({wallets:await tx.list('wallets'),items:await tx.list('items'),ledger:await tx.list('ledger')})),assets);
    assert.equal((await f.service.snapshot('a')).state.xp,recovered.state.xp);
});
