import {seedCompanion} from './support/characters.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {stats} from '../src/rules/engine.js';
import type {Character} from '../src/model.ts';

async function fixture(){
 let now=1000;
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>42});
 const created=await service.createAccount('a',{name:'恢复',classId:8,raceId:1},'create');
 const id=created.state.id;
 await store.transaction(async tx=>{const c=(await tx.get<Character>('characters',id))!;c.rules.hp=1;c.rules.mana=0;c.rules.lastManaUse=1000;await tx.put('characters',c);});
 return {store,service,id,time:(value:number)=>{now=value;}};
}

test('idle snapshots regenerate without commands, publish revisions, and stop changing at full resources',async()=>{
 const f=await fixture(),initial=await f.service.snapshot('a');
 f.time(3000);const early=await f.service.snapshot('a');
 assert.ok(early.state.hp>initial.state.hp);assert.equal(early.state.mana,0);
 assert.ok(early.revision>initial.revision);
 assert.equal((await f.service.snapshot('a')).revision,early.revision);
 f.time(7000);const later=await f.service.snapshot('a');assert.ok(later.state.mana>0);
 f.time(121000);const full=await f.service.snapshot('a'),max=stats(full.state) as {maxHp:number;maxMana:number};
 assert.equal(full.state.hp,max.maxHp);assert.equal(full.state.mana,max.maxMana);
 const saved=(await f.store.transaction(tx=>tx.get<Character>('characters',f.id)))!;
 assert.equal(saved.rules.hp,full.state.hp);assert.equal(saved.rules.mana,full.state.mana);
 assert.equal(full.activities.length,0);
 f.time(123000);assert.equal((await f.service.snapshot('a')).revision,full.revision);
});

test('snapshot recovery does not advance an actor owned by a running activity',async()=>{
 const f=await fixture();await f.service.command('a',{type:'hunt',id:299,requestId:'hunt'});
 const before=await f.service.snapshot('a');f.time(7000);const after=await f.service.snapshot('a');
 assert.equal(after.state.hp,before.state.hp);assert.equal(after.state.mana,before.state.mana);
 assert.equal(after.revision,before.revision);
});

test('full-resource idle characters persist bounded catch-up across polls until commands can proceed',async()=>{
 const f=await fixture();
 const initial=await f.service.snapshot('a'),maximum=stats(initial.state) as {maxHp:number;maxMana:number};
 await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',f.id))!;c.rules.hp=maximum.maxHp;c.rules.mana=maximum.maxMana;c.rules.buffs={armor:{kind:'armor',spell:168,amount:30,until:3601000}};await tx.put('characters',c);});
 f.time(7201000);
 const first=await f.service.snapshot('a');assert.ok(first.state.wallAt>1000);assert.ok(first.state.wallAt<7201000);
 const saved=(await f.store.transaction(tx=>tx.get<Character>('characters',f.id)))!;assert.equal(saved.rules.wallAt,first.state.wallAt);
 const second=await f.service.snapshot('a');assert.equal(second.state.wallAt,7201000);
 const command=await f.service.command('a',{type:'travel',to:'goldshire',requestId:'after-catchup'});
 assert.equal(command.state.activity.type,'travel');
});

test('idle party members regenerate even when the selected hero is full',async()=>{
 const f=await fixture();const created=await seedCompanion(f.service,'a',{type:'createCompanion',name:'队友',classId:8,raceId:1,requestId:'companion'});
 const helper=created.roster.find(c=>c.name==='队友')!.id;
 await f.service.command('a',{type:'setParty',characterIds:[f.id,helper],requestId:'party'});
 const maximum=stats(created.state) as {maxHp:number;maxMana:number};
 await f.store.transaction(async tx=>{for(const id of [f.id,helper]){const c=(await tx.get<Character>('characters',id))!;c.rules.hp=id===helper?1:maximum.maxHp;c.rules.mana=id===helper?0:maximum.maxMana;await tx.put('characters',c);}});
 f.time(7000);const snapshot=await f.service.snapshot('a');const member=snapshot.state.party.find((c:any)=>c.id===helper);
 assert.ok(member.hp>1);assert.ok(member.mana>0);
 assert.equal((await f.store.transaction(tx=>tx.get<Character>('characters',helper)))!.rules.hp,member.hp);
});
