import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {route} from '../src/rules/catalog.js';
import {mountView} from '../src/rules/mounts.js';
import type {Character,Rules} from '../src/model.ts';

// Explicit fixtures: level, location and gold are arranged, never claimed as natural progression.
async function fixture(raceId=1){
 const store=new MemoryStore();let now=1000,sequence=0,request=0;
 let service=new GameService(store,{contentVersion:'mount-validation',now:()=>now,id:()=>`mount-${++sequence}`,seed:()=>37});
 const created=await service.createAccount('mount-account',{name:'Mount acceptance',classId:1,raceId},'create'),hero=created.account.primaryCharacterId;
 const patch=async(changes:Rules)=>store.transaction(async tx=>{const c=(await tx.get<Character>('characters',hero))!;Object.assign(c.rules,changes);await tx.put('characters',c);});
 const money=async(balance:number)=>store.transaction(tx=>tx.put('wallets',{id:hero,characterId:hero,accountId:'mount-account',balance}));
 const command=(action:Rules)=>service.command('mount-account',{...action,requestId:action.requestId||`request-${++request}`});
 const snapshot=()=>service.snapshot('mount-account');
 const work=async(delta:number)=>{now+=delta;assert.deepEqual((await service.work()).errors,[]);return snapshot();};
 const restart=()=>{service=new GameService(store,{contentVersion:'mount-validation',now:()=>now,id:()=>`mount-${++sequence}`,seed:()=>91});};
 await patch({level:20,location:'logging'});await money(1000000);
 return{store,hero,patch,money,command,snapshot,work,restart};
}

test('service gates level 19, charges exact wallet fees at 20, deduplicates requests and persists collection',async()=>{
 const f=await fixture();await f.patch({level:19});
 for(const type of ['trainRiding','buyMount','mount'])await assert.rejects(f.command({type,id:5656}),/20/);
 assert.equal((await f.snapshot()).state.money,1000000);
 await f.patch({level:20});await f.money(199999);await assert.rejects(f.command({type:'trainRiding'}),/不足/);
 await f.money(1000000);const trained=await f.command({type:'trainRiding',requestId:'training'});assert.equal(trained.state.money,800000);
 await f.command({type:'trainRiding',requestId:'training'});await assert.rejects(f.command({type:'trainRiding'}),/已经/);
 const bought=await f.command({type:'buyMount',id:5656,requestId:'purchase'});assert.equal(bought.state.money,0);
 await f.command({type:'buyMount',id:5656,requestId:'purchase'});await assert.rejects(f.command({type:'buyMount',id:5656}),/已经/);
 f.restart();const restored=await f.snapshot();assert.deepEqual(restored.state.mounts,[5656]);assert.equal(restored.state.riding.horse,true);assert.equal(restored.state.money,0);
});

test('service covers all playable race eligibility and exact exalted discount',async()=>{
 for(const raceId of [1,2,3,4,5,6,7,8]){
  const f=await fixture(raceId);
  if(raceId===1){await f.command({type:'trainRiding'});continue;}
  if([3,4,7].includes(raceId)){
   await assert.rejects(f.command({type:'trainRiding'}),/崇拜/);await f.patch({reputation:{72:41999}});await assert.rejects(f.command({type:'trainRiding'}),/崇拜/);
   await f.patch({reputation:{72:42000}});await f.command({type:'trainRiding'});const bought=await f.command({type:'buyMount',id:5656});assert.equal(bought.state.money,100000);
  }else {await f.patch({reputation:{72:42000}});await assert.rejects(f.command({type:'trainRiding'}),/联盟/);}
 }
});

test('worker resumes three-second summon after restart; cancellation and outdoor restrictions preserve ownership',async()=>{
 const f=await fixture();await f.command({type:'trainRiding'});await f.command({type:'buyMount',id:5656});
 for(const patch of [{location:'fargodeep'},{location:'bluerecluse'},{form:'bear'},{swimming:true}]){
  await f.patch(patch);await assert.rejects(f.command({type:'mount',id:5656}));
  assert.equal(mountView((await f.snapshot()).state).collection.find(m=>m.id===5656)!.canMount,false);
  await f.patch({location:'logging',form:'humanoid',swimming:false});
 }
 let result=await f.command({type:'mount',id:5656});assert.equal(result.state.activity.endsAt-result.state.clock,3000);
 assert.ok(await f.store.transaction(tx=>tx.get('actor_leases',f.hero)));f.restart();
 assert.equal((await f.work(2999)).state.mounted,null);assert.equal((await f.work(1000)).state.mounted,5656);
 assert.equal(await f.store.transaction(tx=>tx.get('actor_leases',f.hero)),null);
 await f.command({type:'dismount'});await f.command({type:'mount',id:5656});await f.command({type:'stop'});
 result=await f.work(4000);assert.equal(result.state.mounted,null);assert.deepEqual(result.state.mounts,[5656]);
});

test('service walking and mounted movement settle actual routes; flight and hearth dismount and survive restart',async()=>{
 const f=await fixture();await f.command({type:'trainRiding'});await f.command({type:'buyMount',id:5656});
 await f.patch({location:'northshire'});let trip=await f.command({type:'travel',to:'goldshire'});
 const walk=trip.state.activity.endsAt-trip.state.clock;assert.equal(walk,Math.ceil(route('northshire','goldshire').distance/7*1000));
 f.restart();assert.equal((await f.work(walk)).state.location,'goldshire');
 await f.patch({location:'northshire'});await f.command({type:'mount',id:5656});await f.work(3000);
 trip=await f.command({type:'travel',to:'goldshire'});const riding=trip.state.activity.endsAt-trip.state.clock;
 assert.equal(riding,Math.ceil(route('northshire','goldshire').distance/11.2*1000));assert.ok(riding<walk);
 await assert.rejects(f.command({type:'dismount'}),/旅行|活动/);f.restart();const arrival=await f.work(riding);assert.equal(arrival.state.location,'goldshire');assert.equal(arrival.state.mounted,5656);
 await f.money(110);await f.patch({location:'stormwind',flightPoints:['stormwind','sentinel']});trip=await f.command({type:'fly',to:'sentinel'});
 assert.equal(trip.state.mounted,null);assert.equal(trip.state.money,0);assert.equal(trip.state.activity.endsAt-trip.state.clock,78000);
 f.restart();assert.equal((await f.work(78000)).state.location,'sentinel');
 await f.command({type:'mount',id:5656});await f.work(3000);trip=await f.command({type:'useHearth'});assert.equal(trip.state.mounted,null);
 const cast=trip.state.activity.endsAt-trip.state.clock;assert.equal(cast,10000);f.restart();const home=await f.work(cast);assert.equal(home.state.location,'northshire');assert.deepEqual(home.state.mounts,[5656]);
 await assert.rejects(f.command({type:'useHearth'}),/冷却|恢复/);
});
