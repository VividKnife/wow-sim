import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Character} from '../src/model.ts';

test('24-hour late gather worker stops at each due resource event without replaying idle time',async()=>{
 let now=1000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>123});
 const created=await service.createAccount('a',{name:'采集',classId:8,raceId:1},'create');const id=created.account.primaryCharacterId;
 await store.transaction(async tx=>{const c=(await tx.get<Character>('characters',id))!;c.rules.location='northwood';c.rules.professions={herbalism:{skill:1,cap:75}};await tx.put('characters',c);});
 await service.command('a',{type:'gatherAll',requestId:'gather'});now=86401000;
 assert.deepEqual((await service.work()).errors,[]);const snapshot=await service.snapshot('a');
 assert.equal(snapshot.activities[0].status,'completed');assert.equal(snapshot.activities[0].settledUntil,7000);assert.equal(snapshot.state.wallAt,7000);
 assert.equal(snapshot.state.bag.some((item:any)=>item.id===2447),true);assert.equal(snapshot.state.bag.some((item:any)=>item.id===765),true);
 const later=await service.command('a',{type:'sync',requestId:'sync'});assert.equal(later.state.wallAt,now);
});
test('late travel settlement stops on arrival and subsequent quiet command catches up',async()=>{
 let now=1000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>now,seed:()=>123});
 await service.createAccount('a',{name:'旅行',classId:8,raceId:1},'create');const started=await service.command('a',{type:'travel',to:'goldshire',requestId:'travel'});
 const arrival=1000+started.state.activity.endsAt-started.state.clock;now=86401000;
 assert.deepEqual((await service.work()).errors,[]);const arrived=await service.snapshot('a');assert.equal(arrived.state.location,'goldshire');assert.equal(arrived.state.wallAt,arrival);assert.equal(arrived.activities[0].settledUntil,arrival);
 assert.equal((await service.command('a',{type:'sync',requestId:'sync'})).state.wallAt,now);
});
