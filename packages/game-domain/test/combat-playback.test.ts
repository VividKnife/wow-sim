import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,advance,act,stats} from '../src/rules/engine.js';
import {startCombat} from '../src/rules/combat.js';
import {simulateCombatRecording,playbackProjection,OFFLINE_BATCH_INTERVAL_MS} from '../src/combat-playback.ts';
import {applyPlaybackFrame} from '../../contracts/src/combat-playback.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {combatExecutionMode} from '../src/combat-execution.ts';
import type {Instance,Activity,Character} from '../src/model.ts';
import type {Store} from '../../persistence/src/store.ts';

test('recorded outcomes and every presentation frame match the realtime rule engine',()=>{
 let state:any=createGame('Recorder',283,1000);state.level=20;state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;
 state.completed[900001]=true;state.location='stormwind';
 state.completed[900001]=1;state.location='stormwind';
 for(const id of ['warrior','priest','rogue','mage'])state=act(state,{type:'recruit',id},1000);
 startCombat(state,[636,636,1729],true);
 const original=structuredClone(state);
 const result=simulateCombatRecording(state,{id:'recording',contentVersion:'test',until:4000});
 assert.deepEqual(state,original);
 assert.deepEqual(result.finalState,advance(state,result.recording.endsAt).state);
 let projection:any=result.recording.initial;
 for(const frame of result.recording.frames){
  projection=applyPlaybackFrame(projection,frame);
  const wall=state.wallAt+frame.clock-state.clock;
  assert.deepEqual(projection,playbackProjection(advance(state,wall).state));
 }
 assert.ok(result.recording.frames.length>10);
 assert.equal(JSON.stringify(result.recording).includes('rngState'),false);
 assert.equal('bag' in result.recording.initial.player,false);
 assert.equal('money' in result.recording.initial.player,false);
});

test('bounded recordings stop at the encounter boundary and continue long fights in segments',()=>{
 const state=createGame('Bounded',283,1000);startCombat(state,[6]);
 const short=simulateCombatRecording(state,{id:'short',contentVersion:'test',maxTicks:2});
 assert.equal(short.finalState.wallAt,1200);assert.ok(short.finalState.combat);
 const next=simulateCombatRecording(short.finalState,{id:'next',contentVersion:'test'});
 assert.equal(next.finalState.combat,null);assert.ok(next.recording.endsAt<61000);
 assert.deepEqual(next.finalState,advance(state,next.recording.endsAt).state);
});

async function fixture(offlineLimitMs?:number){
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>283,offlineLimitMs});
 const created=await service.createAccount('a',{name:'Solo',classId:8,raceId:1},'create');
 const formed=await service.command('a',{type:'createInstance',requestId:'form'});
 await service.command('a',{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});
 return {store,service,hero:created.state.id,id:formed.instanceId!,time:(n:number)=>{now=n;},now:()=>now};
}

test('future checkpoints stay private, survive restart and settle exactly once at wall time',async()=>{
 const f=await fixture();f.time(1200);await f.service.work();
 const before=await f.service.snapshot('a');assert.ok(before.playback);assert.equal(before.combatMode,'recorded');
 const recording=await f.service.combatRecording('a',f.hero,before.playback.id);
 assert.equal(recording.serverNow,1200);assert.equal('finalState' in recording,false);
 const row=await f.store.transaction(tx=>tx.get<any>('combat_plans',f.id));
 assert.ok(row.finalState.wallAt>before.state.wallAt);
 f.time(before.playback.endsAt-1);
 assert.equal((await f.service.work()).instances,0);
 assert.equal((await f.service.snapshot('a')).state.xp,before.state.xp);
 const restarted=new GameService(f.store,{contentVersion:'test',now:f.now});
 assert.equal((await restarted.combatRecording('a',f.hero,before.playback.id)).id,recording.id);
 f.time(before.playback.endsAt);assert.deepEqual((await restarted.work()).errors,[]);
 const settled=await restarted.snapshot('a');
 assert.equal(settled.playback,null);assert.equal(settled.state.xp,row.finalState.xp);
 assert.equal(settled.state.money,row.finalState.money);assert.equal(settled.state.wallAt,recording.endsAt);
 const ledger=await f.store.transaction(tx=>tx.list('ledger'));
 await restarted.work();assert.deepEqual(await f.store.transaction(tx=>tx.list('ledger')),ledger);
 await assert.rejects(restarted.combatRecording('a',f.hero,recording.id),/更新/);
});

test('commands rebase at current server time and invalidate the unplayed future',async()=>{
 const f=await fixture();f.time(1200);await f.service.work();
 const before=await f.service.snapshot('a');assert.ok(before.playback);
 f.time(2000);
 const changed=await f.service.command('a',{type:'strategy',rules:[],requestId:'change'});
 assert.equal(changed.state.wallAt,2000);assert.equal(changed.playback,null);
 assert.equal(await f.store.transaction(tx=>tx.get('combat_plans',f.id)),null);
 await assert.rejects(f.service.combatRecording('a',f.hero,before.playback.id),/更新/);
 f.time(2200);await f.service.work();
 const next=await f.service.snapshot('a');assert.ok(next.playback);assert.notEqual(next.playback.id,before.playback.id);
 assert.equal(next.playback.startsAt,2200);
});

test('recordings require character ownership and manual encounters stay realtime',async()=>{
 const f=await fixture();f.time(1200);await f.service.work();
 const snapshot=await f.service.snapshot('a');
 const other=await f.service.createAccount('b',{name:'Other',classId:1,raceId:1},'create');
 await assert.rejects(f.service.combatRecording('b',f.hero,snapshot.playback!.id),/不属于/);
 await assert.rejects(f.service.combatRecording('b',other.state.id,snapshot.playback!.id),/更新/);
 assert.equal(combatExecutionMode({} as Activity,{combat:{requiresManualControl:true}}),'realtime');
 const manual=await fixture();
 await manual.store.transaction(async tx=>{const row=(await tx.get<Instance>('instances',manual.id))!;row.simulation!.combat.requiresManualControl=true;await tx.put('instances',row);});
 manual.time(1200);await manual.service.work();
 const live=await manual.service.snapshot('a');assert.equal(live.playback,null);assert.equal(live.combatMode,'realtime');
 assert.equal((await manual.store.transaction(tx=>tx.get<Instance>('instances',manual.id)))!.nextEventAt,1400);
});

test('a command racing with background computation fences the stale recording',async()=>{
 const f=await fixture();let injected=false;
 const store:Store={close:async()=>{},transaction:async work=>{
  const result:any=await f.store.transaction(work);
  if(!injected&&result?.owner?.id===f.id&&result?.state){
   injected=true;
   await f.service.command('a',{type:'strategy',rules:[],requestId:'concurrent-command'});
  }
  return result;
 }};
 const worker=new GameService(store,{contentVersion:'test',now:f.now});
 await worker.prepareCombatPlan('instances',f.id,f.now());
 assert.equal(injected,true);assert.equal(await f.store.transaction(tx=>tx.get('combat_plans',f.id)),null);
});

test('offline solo combat batches work without recording animations or passing the offline cutoff',async()=>{
 const f=await fixture(6000);
 await f.store.transaction(async tx=>{
  const row=(await tx.get<Instance>('instances',f.id))!;
  row.simulation!.hp=100000;row.simulation!.combat.enemies[0].hp=100000;
  await tx.put('instances',row);
 });
 f.time(6000);assert.deepEqual((await f.service.work()).errors,[]);
 const snapshot=await f.service.snapshot('a');assert.equal(snapshot.playback,null);
 assert.equal(await f.store.transaction(tx=>tx.get('combat_plans',f.id)),null);
 f.time(100000);await f.service.work();
 assert.equal((await f.service.snapshot('a')).state.wallAt,7000);
 const row=(await f.store.transaction(tx=>tx.get<Instance>('instances',f.id)))!;
 assert.equal(row.resumeEventAt,7000+OFFLINE_BATCH_INTERVAL_MS);
});

test('personal hunting consumes its precomputed result and only writes assets that changed',async()=>{
 const store=new MemoryStore();let now=1000;const writes:string[]=[];
 const tracked:Store={close:async()=>{},transaction:async work=>store.transaction(tx=>work({...tx,put:async(table,row)=>{writes.push(table);await tx.put(table,row);}}))};
 const service=new GameService(tracked,{contentVersion:'test',now:()=>now,seed:()=>283});
 await service.createAccount('a',{name:'Hunter',classId:8,raceId:1},'create');
 await service.command('a',{type:'hunt',id:299,requestId:'hunt'});
 writes.length=0;now=2000;await service.work();
 const before=await service.snapshot('a');assert.ok(before.playback);
 assert.equal(writes.filter(t=>t==='items').length,0);assert.equal(writes.filter(t=>t==='wallets').length,0);
 now=before.playback.endsAt;await service.work();
 const after=await service.snapshot('a');assert.equal(after.state.wallAt,now);assert.ok(after.state.xp>=before.state.xp);
});
