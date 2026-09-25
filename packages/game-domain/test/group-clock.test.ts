import {seedCompanion} from './support/characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Character,Party} from '../src/model.ts';

async function fixture(){let now=1000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>123});const created=await service.createAccount('a',{name:'Hero',classId:8,raceId:1},'create');return{store,service,hero:created.account.primaryCharacterId,party:created.account.partyId,time:(value:number)=>{now=value;},helper:async()=>{const result=await seedCompanion(service,'a',{type:'createCompanion',name:'Helper',classId:8,raceId:1,requestId:'helper'});return result.roster.find(c=>c.name==='Helper')!.id;}};}

test('redirecting group travel retains its activity lease and brings every participant to the new destination',async()=>{
 const f=await fixture(),helper=await f.helper();
 await f.service.command('a',{type:'setParty',characterIds:[f.hero,helper],requestId:'party'});
 const started=await f.service.command('a',{type:'travel',to:'echo',requestId:'travel'});
 const activityId=started.activities.find(a=>a.status==='running')!.id;
 f.time(2000);const redirected=await f.service.command('a',{type:'travel',to:'vineyard',requestId:'redirect'});
 assert.equal(redirected.state.activity.to,'vineyard');
 assert.equal(redirected.activities.find(a=>a.status==='running')!.id,activityId);
 assert.deepEqual((await f.service.command('a',{type:'travel',to:'vineyard',requestId:'redirect'})).state.activity,redirected.state.activity);
 f.time(redirected.state.wallAt+redirected.state.activity.endsAt-redirected.state.clock);
 assert.deepEqual((await f.service.work()).errors,[]);
 for(const id of [f.hero,helper]){
  assert.equal((await f.store.transaction(tx=>tx.get<Character>('characters',id)))!.rules.location,'vineyard');
  assert.equal(await f.store.transaction(tx=>tx.get('actor_leases',id)),null);
 }
});
test('group travel keeps real deadlines fixed and moves every participant at the shared clock',async()=>{const f=await fixture(),helper=await f.helper();await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',helper))!;c.professionReadyAt={transmute:100000};c.resourceReadyAt={bloom:110000};await tx.put('characters',c);});await f.service.command('a',{type:'setParty',characterIds:[f.hero,helper],requestId:'party'});await f.service.command('a',{type:'travel',to:'northwood',requestId:'travel'});f.time(20000);assert.deepEqual((await f.service.work()).errors,[]);
 const leader=(await f.store.transaction(tx=>tx.get<Character>('characters',f.hero)))!,member=(await f.store.transaction(tx=>tx.get<Character>('characters',helper)))!;assert.equal(member.professionReadyAt.transmute,100000);assert.equal(member.resourceReadyAt.bloom,110000);assert.equal(member.rules.location,'northwood');assert.equal(member.rules.clock,leader.rules.clock);assert.equal(member.rules.wallAt,leader.rules.wallAt);assert.ok(member.rules.nextTick>member.rules.clock);
});
test('later-created companion keeps buff and spell cooldown remaining times when joining an older hero',async()=>{const f=await fixture();f.time(101000);await f.service.command('a',{type:'sync',requestId:'aged'});const helper=await f.helper();await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',helper))!;c.rules.buffs={intellect:{kind:'intellect',amount:2,spell:1459,until:161000,caster:helper}};c.rules.cooldowns={133:131000};c.professionReadyAt={transmute:200000};await tx.put('characters',c);});await f.service.command('a',{type:'setParty',characterIds:[f.hero,helper],requestId:'party'});await f.service.command('a',{type:'travel',to:'northwood',requestId:'travel'});f.time(120000);assert.deepEqual((await f.service.work()).errors,[]);const c=(await f.store.transaction(tx=>tx.get<Character>('characters',helper)))!;assert.equal(c.rules.buffs.intellect.until,161000);assert.equal(c.rules.cooldowns[133],131000);assert.ok(c.rules.buffs.intellect.until>c.rules.clock);assert.equal(c.professionReadyAt.transmute,200000);
});
test('busy existing roster cannot be replaced and active participant list ignores mutable party rows',async()=>{const f=await fixture();await f.service.command('a',{type:'travel',to:'northwood',requestId:'travel'});const helper=await f.helper();await assert.rejects(f.service.command('a',{type:'setParty',characterIds:[helper],requestId:'swap'}),/另一项活动/);await assert.rejects(f.service.command('a',{type:'setParty',characterId:helper,characterIds:[helper],requestId:'swap-helper'}),/另一项活动/);
 await f.store.transaction(async tx=>{const p=(await tx.get<Party>('parties',f.party))!;p.characterIds=[helper];await tx.put('parties',p);});assert.equal((await f.service.snapshot('a')).state.party.length,0);f.time(20000);assert.deepEqual((await f.service.work()).errors,[]);assert.equal((await f.store.transaction(tx=>tx.get<Character>('characters',helper)))!.rules.location,'northshire');assert.equal(await f.store.transaction(tx=>tx.get('actor_leases',helper)),null);
});
