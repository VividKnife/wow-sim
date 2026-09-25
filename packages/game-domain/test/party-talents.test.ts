import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {seedCompanion} from './support/characters.ts';
import {talents} from '../src/rules/catalog.js';
import type {Character, Activity} from '../src/model.ts';

const shield = Object.values(talents).find(t => t.classId === 1 && t.name === 'Shield Specialization')!;
async function fixture() {
 const store = new MemoryStore(), service = new GameService(store, {contentVersion:'test', now:()=>1000});
 const hero = (await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create')).account.primaryCharacterId;
 const helper = (await seedCompanion(service,'a',{name:'Helper',classId:1})).roster.find(c=>c.id!==hero)!.id;
 await service.command('a',{type:'setParty',characterIds:[hero,helper],requestId:'party'});
 await store.transaction(async tx=>{
  const c = (await tx.get<Character>('characters',helper))!;
  c.rules.level=20; c.rules.growthPolicy='companion';
  await tx.put('characters',c);
  const leader = (await tx.get<Character>('characters',hero))!;
  leader.rules.nextPull=100000;
  await tx.put('characters',leader);
  await tx.insert('activities',{id:'hunt',accountId:'a',actorId:hero,type:'personal',status:'running',location:leader.rules.location,
   startedAt:1000,settledUntil:1000,nextEventAt:2000,contentVersion:'test',rngState:leader.rules.rngState,
   engineActivity:{type:'hunt',target:299},participantIds:[hero,helper]});
  await service.lock(tx,leader,'activity','hunt');
  await service.lock(tx,c,'activity','hunt');
 });
 return {store,service,hero,helper};
}

test('follower allocates and freely resets talents between pulls without changing party activity or assets',async()=>{
 const {store,service,hero,helper}=await fixture();
 const before=await store.transaction(tx=>tx.list('items'));
 const learned=await service.command('a',{type:'talent',characterId:helper,id:shield.id,requestId:'learn'});
 assert.equal(learned.state.talents[shield.id],1);
 assert.equal((await service.snapshot('a',hero)).state.talents[shield.id],undefined);
 await service.command('a',{type:'talent',characterId:helper,id:shield.id,requestId:'learn'});
 assert.equal((await service.snapshot('a',helper)).state.talents[shield.id],1);
 const reset=await service.command('a',{type:'resetTalents',characterId:helper,requestId:'reset'});
 assert.deepEqual(reset.state.talents,{});
 assert.deepEqual(await store.transaction(tx=>tx.list('items')),before);
 assert.equal((await store.transaction(tx=>tx.list('actor_leases'))).length,2);
 const activity=(await store.transaction(tx=>tx.get<Activity>('activities','hunt')))!;
 assert.equal(activity.status,'running');
 assert.equal(activity.actorId,hero);
 assert.equal(activity.engineActivity.type,'hunt');
 assert.equal(activity.simulationVersion,2);
});

test('follower cannot allocate talents during leader travel or combat',async()=>{
 for(const mode of ['travel','combat']){
  const {store,service,hero,helper}=await fixture();
  await store.transaction(async tx=>{
   if(mode==='travel'){
    const a=(await tx.get<Activity>('activities','hunt'))!;
    a.engineActivity={type:'travel',from:'northshire',to:'goldshire',startedAt:1000,endsAt:10000};
    await tx.put('activities',a);
   }else{
    const c=(await tx.get<Character>('characters',hero))!;
    c.rules.combat={id:'active-combat'};
    await tx.put('characters',c);
   }
  });
  await assert.rejects(service.command('a',{type:'talent',characterId:helper,id:shield.id,requestId:'blocked'}),/结束队伍当前战斗或活动/);
  assert.deepEqual((await store.transaction(tx=>tx.get<Character>('characters',helper)))!.rules.talents,{});
  assert.equal((await store.transaction(tx=>tx.list('actor_leases'))).length,2);
 }
});

test('party settlement preserves follower talents in subsequent worker ticks',async()=>{
 const {store,service,helper}=await fixture();
 service.now=()=>3000;
 await service.command('a',{type:'talent',characterId:helper,id:shield.id,requestId:'after-settlement'});
 const settled=(await store.transaction(tx=>tx.get<Activity>('activities','hunt')))!;
 assert.equal(settled.settledUntil,3000);
 service.now=()=>settled.nextEventAt;
 const work=await service.work();
 assert.deepEqual(work.errors,[]);
 assert.equal((await service.snapshot('a',helper)).state.talents[shield.id],1);
 assert.equal((await store.transaction(tx=>tx.list('actor_leases'))).length,2);
});
