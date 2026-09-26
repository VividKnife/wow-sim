import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {advance} from '../src/rules/engine.js';
import {LOCAL_LEASE_MS} from '../src/local-simulation.ts';

test('gold raid retreat permits server recovery and rejects browser simulation',async()=>{
 const store=new MemoryStore();let now=Date.UTC(2026,8,22);
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
 const save=await service.createSave('raider',{name:'恢复团长',classId:8,raceId:1,raidReady:true},'recovery');
 await service.command(save.id,{type:'enterDungeon',contentId:'molten-core-gold',requestId:'enter'});
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])await service.command(save.id,{type,requestId:type});
 const started=await service.command(save.id,{type:'goldNavigate',destination:'lucifron',requestId:'start'});
 assert.equal(started.localSimulation,null);
 await assert.rejects(service.localSimulation(save.id,{ownerId:started.instanceId,characterId:started.state.id,clientId:'browser',contentVersion:'test',type:'claim',requestId:'claim'}));
 const retreat=await service.command(save.id,{type:'abandonCombat',encounterId:started.state.combat.id,requestId:'retreat'});
 assert.equal(retreat.state.hp,0);
 const recovering=await service.command(save.id,{type:'goldRecover',requestId:'recover'});
 assert.equal(recovering.state.activity.type,'goldRecovery');
 now+=10000;for(let i=0;i<5;i++)assert.deepEqual((await service.work()).errors,[]);
 const recovered=await service.snapshot(save.id);
 assert.equal(recovered.state.activity.type,'idle');
 assert.ok([recovered.state,...recovered.state.party].every(c=>c.hp>0));
 assert.equal(recovered.state.goldRaid.recoverUntil,0);
});

async function fixture(kind='personal', offlineLimitMs=7200000) {
    const store=new MemoryStore();let now=1000;
    const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283,offlineLimitMs});
    await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create');
    if(kind==='personal')await service.command('a',{type:'hunt',id:299,requestId:'hunt'});
    else {const formed=await service.command('a',{type:'createInstance',requestId:'form'});await service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});}
    const initial=await service.snapshot('a');
    const base={ownerId:initial.localSimulation!.ownerId,characterId:initial.state.id,clientId:'browser-one',contentVersion:'test'};
    const claim=(extra={})=>service.localSimulation('a',{...base,type:'claim',requestId:crypto.randomUUID(),...extra});
    return {store,service,base,claim,initial,time:(t:number)=>{now=t;},now:()=>now};
}
const upload=(f:Awaited<ReturnType<typeof fixture>>,session:any,state:any,extra={})=>f.service.localSimulation('a',{
    ...f.base,type:'checkpoint',sessionId:session.session.id,sequence:session.session.sequence+1,state,requestId:crypto.randomUUID(),...extra});

for(const kind of ['personal','instance']) {
    test(`${kind}: local checkpoint uses the shared rules and stops server simulation`,async()=>{
        const f=await fixture(kind),session=await f.claim();
        f.time(3000);
        assert.deepEqual(await f.service.work(),{activities:0,instances:0,errors:[]});
        await f.service.prepareCombatPlan(kind==='personal'?'activities':'instances',f.base.ownerId,3000);
        assert.equal(await f.store.read(tx=>tx.get('combat_plans',f.base.ownerId)),null);
        assert.equal((await f.service.snapshot('a')).state.clock,session.state.clock);
        const expected=advance(session.state,3000).state;
        const saved=await upload(f,session,expected);
        assert.equal(saved.state.clock,expected.clock);assert.equal(saved.state.hp,expected.hp);
        assert.equal(saved.state.money,expected.money);assert.equal(saved.state.rngState,expected.rngState);
        assert.equal(saved.session.sequence,1);
        f.time(4000);assert.deepEqual(await f.service.work(),{activities:0,instances:0,errors:[]});
    });
    test(`${kind}: checkpoint retries are idempotent, including canonical item IDs`,async()=>{
        const f=await fixture(kind),session=await f.claim();f.time(2000);
        const state=advance(session.state,2000).state,requestId='checkpoint';
        const saved=await upload(f,session,state,{requestId});
        const ledger=await f.store.read(tx=>tx.list('ledger'));
        assert.deepEqual(await upload(f,session,state,{requestId}),saved);
        assert.deepEqual(await f.store.read(tx=>tx.list('ledger')),ledger);
        await assert.rejects(upload(f,session,{...state,money:999},{requestId}),{code:'REQUEST_REUSED'});
        await assert.rejects(upload(f,session,state),{code:'LOCAL_SEQUENCE'});
    });
    test(`${kind}: commands act at the acknowledged checkpoint and fence old browser uploads`,async()=>{
        const f=await fixture(kind),session=await f.claim();f.time(2000);
        const saved=await upload(f,session,advance(session.state,2000).state);
        f.time(2100);
        const next=await f.service.command('a',{type:'strategy',rules:[],requestId:'change',localClientId:f.base.clientId,localSessionId:saved.session.id});
        assert.equal(next.state.clock,saved.state.clock);
        await assert.rejects(upload(f,saved,advance(saved.state,2100).state),{code:'LOCAL_STALE'});
        f.time(2200);assert.deepEqual(await f.service.work(),{activities:0,instances:0,errors:[]});
        assert.equal((await f.claim()).state.clock,saved.state.clock);
    });
}
test('two tabs cannot compute concurrently; expired ownership can be taken over and old results fail',async()=>{
    const f=await fixture(),first=await f.claim();
    await assert.rejects(f.claim({clientId:'two'}),{code:'LOCAL_HELD'});
    await assert.rejects(f.service.command('a',{type:'stop',requestId:'other'}),{code:'LOCAL_HELD'});
    f.time(1001+LOCAL_LEASE_MS);
    const second=await f.claim({clientId:'two'});
    assert.notEqual(second.session.id,first.session.id);
    await assert.rejects(upload(f,first,first.state),{code:'LOCAL_STALE'});
});
test('offline progress is capped independently of snapshot presence and survives service restart',async()=>{
    const f=await fixture('personal',10000),first=await f.claim();
    f.time(61000);await f.service.snapshot('a',undefined,true);
    const restarted=new GameService(f.store,{contentVersion:'test',now:f.now,offlineLimitMs:10000});
    const next=await restarted.localSimulation('a',{...f.base,type:'claim',requestId:'restart'});
    assert.equal(next.state.clock,first.state.clock);
    assert.equal(next.serverNow-next.state.wallAt,10000);
    f.time(121000);await assert.rejects(upload(f,next,advance(next.state,121000).state),{code:'LOCAL_TIME'});
});
test('checkpoints reject future time, invalid shape, reordered roster, stale content and cross-account access',async()=>{
    const f=await fixture(),session=await f.claim();
    await assert.rejects(upload(f,session,advance(session.state,2000).state),{code:'LOCAL_TIME'});
    await assert.rejects(upload(f,session,{...session.state,party:[{id:'stranger'}]}),{code:'LOCAL_ROSTER'});
    await assert.rejects(upload(f,session,{...session.state,nextTick:0}),{code:'LOCAL_STATE'});
    await assert.rejects(f.claim({contentVersion:'old'}),{code:'CONTENT_VERSION'});
    await f.service.createAccount('b',{name:'Other',classId:8,raceId:1},'create');
    await assert.rejects(f.service.localSimulation('b',{...f.base,type:'claim',requestId:'foreign'}),{code:'FORBIDDEN'});
});
test('multiple real accounts always remain on the server',async()=>{
    const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>1000});
    await service.createAccount('a',{name:'One',classId:8,raceId:1},'create');
    await service.createAccount('b',{name:'Two',classId:8,raceId:1},'create');
    const formed=await service.command('a',{type:'createInstance',requestId:'form'});
    await service.command('b',{type:'joinInstance',instanceId:formed.instanceId,requestId:'join'});
    await service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
    assert.equal((await service.snapshot('a')).localSimulation,null);
    await assert.rejects(service.localSimulation('a',{type:'claim',ownerId:formed.instanceId,clientId:'one',requestId:'claim',contentVersion:'test'}),{code:'LOCAL_UNAVAILABLE'});
});

test('page release allows immediate refresh while fencing any delayed checkpoint',async()=>{
    const f=await fixture(),session=await f.claim();
    await f.service.localSimulation('a',{...f.base,type:'release',sessionId:session.session.id,requestId:'release'});
    const resumed=await f.claim({clientId:'new-page'});
    assert.equal(resumed.state.clock,session.state.clock);
    await assert.rejects(upload(f,session,session.state),{code:'LOCAL_STALE'});
});
test('completed encounter settles loot once, releases local execution and allows the next command',async()=>{
    const f=await fixture('instance'),session=await f.claim();f.time(121000);
    const state=advance(session.state,121000).state;
    assert.equal(state.combat,null);
    const saved=await upload(f,session,state,{requestId:'finish'});
    assert.equal(saved.active,false);
    const ledger=await f.store.read(tx=>tx.list('ledger'));
    assert.deepEqual(await upload(f,session,state,{requestId:'finish'}),saved);
    assert.deepEqual(await f.store.read(tx=>tx.list('ledger')),ledger);
    assert.equal((await f.service.snapshot('a')).localSimulation,null);
    await f.service.command('a',{type:'leaveInstance',instanceId:f.base.ownerId,requestId:'leave'});
    assert.equal((await f.service.snapshot('a')).instanceId,null);
});
test('new rule versions cannot acquire an activity created with old rules',async()=>{
    const f=await fixture();
    const updated=new GameService(f.store,{contentVersion:'new',now:f.now});
    await assert.rejects(updated.localSimulation('a',{...f.base,contentVersion:'new',type:'claim',requestId:'version'}),{code:'CONTENT_VERSION'});
});
