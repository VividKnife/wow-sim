import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {act,advance} from '../src/rules/engine.js';
import {LOCAL_LEASE_MS} from '../src/local-simulation.ts';

test('25-player gold raid runs locally, checkpoints NPCs, and recovers without server simulation',async()=>{
 const store=new MemoryStore();let now=Date.UTC(2026,8,22);
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
 const save=await service.createSave('raider',{name:'恢复团长',classId:8,raceId:1,raidReady:true},'recovery');
 await service.command(save.id,{type:'enterDungeon',contentId:'molten-core-gold',requestId:'enter'});
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])await service.command(save.id,{type,requestId:type});
 const started=await service.command(save.id,{type:'goldNavigate',destination:'lucifron',requestId:'start'});
 const base={ownerId:started.instanceId,characterId:started.state.id,clientId:'browser',contentVersion:'test'};
 assert.ok(started.localSimulation);
 let session=await service.localSimulation(save.id,{...base,type:'claim',requestId:'claim'});
 assert.equal(session.state.party.length,24);
 now+=1000;assert.deepEqual(await service.work(),{activities:0,instances:0,errors:[]});
 const live=advance(session.state,now).state;
 const retreated=act(live,{type:'abandonCombat',encounterId:live.combat.id},live.wallAt);
 session=await service.localSimulation(save.id,{...base,type:'checkpoint',sessionId:session.session.id,sequence:1,state:retreated,requestId:'retreat-save'});
 assert.equal(session.state,undefined);
 const retreat=await service.snapshot(save.id);
 assert.equal(retreat.state.hp,0);
 const recovering=await service.command(save.id,{type:'goldRecover',requestId:'recover',localClientId:base.clientId,localSessionId:session.session.id});
 assert.equal(recovering.state.activity.type,'goldRecovery');
 session=await service.localSimulation(save.id,{...base,type:'claim',requestId:'recovery-claim'});
 now+=10000;assert.deepEqual(await service.work(),{activities:0,instances:0,errors:[]});
 const recoveredState=advance(session.state,now).state;
 const checkpoint={...base,type:'checkpoint',sessionId:session.session.id,sequence:1,state:recoveredState,requestId:'recovery-save'};
 const committed=await service.localSimulation(save.id,checkpoint);
 assert.deepEqual(await service.localSimulation(save.id,checkpoint),committed);
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

for(const type of ['hunt','enterDungeon'])test(`${type}: browser reserves local execution before downloading or claiming the Worker`,async()=>{
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283});
 await service.createAccount('browser',{name:'本地冒险',classId:8,raceId:1},'create');
 const started=await service.command('browser',{type,id:299,...(type==='enterDungeon'?{contentId:'northshire-skirmish'}:{}),localClientId:'web',requestId:'start'});
 assert.ok(started.localSimulation);
 now+=60000;
 assert.deepEqual(await service.work(),{activities:0,instances:0,errors:[]});
 const table=type==='hunt'?'activities':'instances';
 await service.prepareCombatPlan(table,started.localSimulation!.ownerId,now);
 assert.equal(await store.read(tx=>tx.get('combat_plans',started.localSimulation!.ownerId)),null);
 const claimed=await service.localSimulation('browser',{type:'claim',ownerId:started.localSimulation!.ownerId,characterId:started.state.id,contentVersion:'test',clientId:'web',requestId:'claim'});
 assert.equal(claimed.state.clock,started.state.clock,'server did no combat calculation during initial bundle load');
 assert.equal(claimed.serverNow-claimed.state.wallAt,60000);
});

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
        assert.equal(saved.state,undefined);
        const persisted=(await f.service.snapshot('a')).state;
        assert.equal(persisted.clock,expected.clock);assert.equal(persisted.hp,expected.hp);
        assert.equal(persisted.money,expected.money);assert.equal(persisted.rngState,expected.rngState);
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
        const checkpointState=advance(session.state,2000).state;
        const saved=await upload(f,session,checkpointState);
        f.time(2100);
        const next=await f.service.command('a',{type:'strategy',rules:[],requestId:'change',localClientId:f.base.clientId,localSessionId:saved.session.id});
        assert.equal(next.state.clock,checkpointState.clock);
        await assert.rejects(upload(f,saved,advance(checkpointState,2100).state),{code:'LOCAL_STALE'});
        f.time(2200);assert.deepEqual(await f.service.work(),{activities:0,instances:0,errors:[]});
        assert.equal((await f.claim()).state.clock,checkpointState.clock);
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
    await service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start',localClientId:'browser'});
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
    const completed=()=>f.store.read(async tx=>({settlements:(await tx.list<any>('settlements')).filter(r=>r.businessKey.startsWith('local:')),
        outbox:(await tx.list<any>('outbox')).filter(r=>r.businessKey.startsWith('local:'))}));
    const events=await completed();assert.equal(events.settlements.length,1);assert.equal(events.outbox.length,1);
    const ledger=await f.store.read(tx=>tx.list('ledger'));
    assert.deepEqual(await upload(f,session,state,{requestId:'finish'}),saved);
    assert.deepEqual(await f.store.read(tx=>tx.list('ledger')),ledger);
    assert.deepEqual(await completed(),events);
    assert.equal((await f.service.snapshot('a')).localSimulation,null);
    await f.service.command('a',{type:'leaveInstance',instanceId:f.base.ownerId,requestId:'leave'});
    assert.equal((await f.service.snapshot('a')).instanceId,null);
});
test('new rule versions cannot acquire an activity created with old rules',async()=>{
    const f=await fixture();
    const updated=new GameService(f.store,{contentVersion:'new',now:f.now});
    await assert.rejects(updated.localSimulation('a',{...f.base,contentVersion:'new',type:'claim',requestId:'version'}),{code:'CONTENT_VERSION'});
});

for(const kind of ['personal','instance'])test(`${kind}: routine saves retain one small receipt and no per-tick settlement/outbox rows`,async()=>{
 const f=await fixture(kind);let session=await f.claim(),state=session.state;
 const counts=()=>f.store.read(async tx=>({settlements:(await tx.list('settlements')).length,outbox:(await tx.list('outbox')).length}));
 const before=await counts();
 for(let i=1;i<=12;i++){
  f.time(1000+i);state=advance(state,f.now()).state;
  // Even unfiltered callers cannot persist presentation history.
  state.logs=[{id:i,text:'transient event'}];state.battleHistory=[{battle:{id:'old'},padding:'x'.repeat(5000)}];
  session=await upload(f,session,state);
  assert.equal(session.state,undefined);assert.ok(JSON.stringify(session).length<1000);
 }
 assert.deepEqual(await counts(),before);
 const receipts=await f.store.read(tx=>tx.list<any>('receipts'));
 const local=receipts.filter(row=>row.id.includes(':local:'));
 assert.equal(local.length,1);assert.equal(local[0].result.state,undefined);
 const persisted=(await f.service.snapshot('a')).state;
 assert.deepEqual(persisted.logs,[]);assert.deepEqual(persisted.battleHistory,[]);
 const characters=await f.store.read(tx=>tx.list<any>('characters'));
 assert.ok(characters.every(c=>!c.rules.logs?.length&&!c.rules.battleHistory?.length));
 if(kind==='instance'){
  const owner=await f.store.read(tx=>tx.get<any>('instances',f.base.ownerId));
  assert.deepEqual(owner.simulation.logs,[]);assert.deepEqual(owner.simulation.battleHistory,[]);
 }
});

for(const kind of ['personal','instance'])test(`${kind}: compact ACK returns canonical loot identity once and preserves durable assets`,async()=>{
 const f=await fixture(kind),session=await f.claim();
 const state=structuredClone(session.state);state.pending.push({id:117,uid:'local-drop',count:2});
 const saved=await upload(f,session,state,{requestId:'loot'});
 assert.equal(saved.state,undefined);assert.equal(saved.itemIds.length,1);
 const [from,to]=saved.itemIds[0];assert.equal(from,'local-drop');assert.notEqual(to,from);
 const ledger=await f.store.read(tx=>tx.list('ledger'));
 assert.deepEqual(await upload(f,session,state,{requestId:'loot'}),saved);
 assert.deepEqual(await f.store.read(tx=>tx.list('ledger')),ledger);
 const persisted=(await f.service.snapshot('a')).state;
 assert.ok(persisted.pending.some((item:any)=>item.uid===to&&item.count===2));
});
