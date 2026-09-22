import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {DatabaseBusyError, type Store} from '../../persistence/src/store.ts';
import {GameService} from '../src/service.ts';
import {advancePersonal} from '../src/background-simulation.ts';

async function fixture() {
    const store = new MemoryStore();
    let now = 1000;
    const service = new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
    await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create');
    return {store,service,time:(n:number)=>{now=n;},now:()=>now};
}

for (const kind of ['personal','instance'] as const) {
    test(`${kind}: a command after input capture discards stale simulation without overwriting assets`,async()=>{
        const f=await fixture();
        let id:string,epoch=0;
        if(kind==='personal') {
            const s=await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
            id=s.activities[0].id;
        } else {
            const s=await f.service.command('a',{type:'createInstance',requestId:'form'});
            id=s.instanceId!;
            await f.service.command('a',{type:'startInstance',instanceId:id,requestId:'start'});
            epoch=(await f.service.acquireInstanceLease(id,'worker',1000)).epoch;
        }
        f.time(2000);
        let injected=false,expected:unknown;
        const wrapped:Store={close:async()=>{},heartbeat:f.store.heartbeat.bind(f.store),transaction:f.store.transaction.bind(f.store),
            read:async work=>{
                const result:any=await f.store.read(work);
                if(!injected && (result?.activity?.id===id || result?.instance?.id===id)) {
                    injected=true;
                    await f.service.command('a',{type:'strategy',rules:[],requestId:'racing-command'});
                    expected=await f.store.read(async tx=>({characters:await tx.list('characters'),wallets:await tx.list('wallets'),items:await tx.list('items'),ledger:await tx.list('ledger')}));
                }
                return result;
            }};
        const worker=new GameService(wrapped,{contentVersion:'test',now:f.now});
        const committed=kind==='personal' ? await advancePersonal.call(worker,id,2000) : await worker.advanceInstance(id,'worker',epoch,2000);
        assert.equal(injected,true);assert.equal(committed,false);
        assert.deepEqual(await f.store.read(async tx=>({characters:await tx.list('characters'),wallets:await tx.list('wallets'),items:await tx.list('items'),ledger:await tx.list('ledger')})),expected);
    });
}

test('commands preserve database failure classification instead of reporting rule rejection',async()=>{
    const f=await fixture();
    const failure=new DatabaseBusyError(Object.assign(new Error('serialization failure'),{code:'40001'}));
    const wrapped:Store={read:f.store.read.bind(f.store),heartbeat:f.store.heartbeat.bind(f.store),close:async()=>{},transaction:async()=>{throw failure;}};
    const service=new GameService(wrapped,{contentVersion:'test',now:f.now});
    await assert.rejects(service.command('a',{type:'strategy',rules:[],requestId:'busy'}),error=>error===failure && (error as DatabaseBusyError).status===503);
    assert.equal(await f.store.read(tx=>tx.get('receipts','a:busy')),null);
});

test('idle recovery contention serves committed state and retries on a later poll',async()=>{
    const f=await fixture();
    const id=(await f.service.snapshot('a')).state.id;
    await f.store.transaction(async tx=>{
        const c=(await tx.get('characters',id))!;
        c.rules.hp=1;await tx.put('characters',c);
    });
    f.time(4000);
    const wrapped:Store={read:f.store.read.bind(f.store),heartbeat:f.store.heartbeat.bind(f.store),close:async()=>{},transaction:async()=>{throw new DatabaseBusyError(new Error('conflict'));}};
    const service=new GameService(wrapped,{contentVersion:'test',now:f.now});
    assert.equal((await service.snapshot('a')).state.hp,1);
    assert.ok((await f.service.snapshot('a')).state.hp>1);
});
