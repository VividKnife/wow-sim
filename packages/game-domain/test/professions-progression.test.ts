import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Character, Rules} from '../src/model.ts';
import {professions, recipes, professionRanks} from '../src/rules/profession-data.js';
import {countItem} from '../src/rules/character.js';

// Explicit integration fixtures: bankroll and character level only. Professions,
// skill points, materials, tools and output always come from public commands.
async function fixture() {
 const store=new MemoryStore();let now=1000,serial=0;
 const options={contentVersion:'profession-validation',now:()=>now,seed:()=>71};
 let service=new GameService(store,options);
 const hero=(await service.createAccount('a',{name:'工匠验收',classId:8,raceId:1},'create')).account.primaryCharacterId;
 await store.transaction(tx=>tx.put('wallets',{id:hero,characterId:hero,accountId:'a',balance:10000000}));
 return {store,hero, get service(){return service;},
  async level(level:number){await store.transaction(async tx=>{const c=(await tx.get<Character>('characters',hero))!;c.rules.level=level;await tx.put('characters',c);});},
  cmd(command:Rules){return service.command('a',{...command,requestId:`step-${++serial}`});},
  state:async()=>(await service.snapshot('a')).state,
  async settle(ms=3000){now+=ms;assert.deepEqual((await service.work()).errors,[]);},
  restart(){service=new GameService(store,options);}
 };
}

test('all twelve professions learn through account commands with level, duplicate and fee gates',async()=>{
 for(const p of professions){
  const f=await fixture(),rank=professionRanks[p.id as keyof typeof professionRanks][0];
  if(rank.level>1)await assert.rejects(f.cmd({type:'learnProfession',id:p.id}),/等级/);
  await f.level(Math.max(1,rank.level));
  const before=(await f.state()).money;
  const learned=await f.cmd({type:'learnProfession',id:p.id});
  assert.deepEqual(learned.state.professions[p.id],{skill:1,cap:75});
  assert.equal(learned.state.money,before-rank.cost);
  await assert.rejects(f.cmd({type:'learnProfession',id:p.id}),/已经/);
  assert.equal((await f.state()).money,learned.state.money);
 }
});

test('two main professions coexist with all three secondary professions and reject a third without charge',async()=>{
 const f=await fixture();await f.level(5);
 for(const id of ['mining','herbalism','firstaid','cooking','fishing'])await f.cmd({type:'learnProfession',id});
 const before=await f.state();await assert.rejects(f.cmd({type:'learnProfession',id:'alchemy'}),/两个/);
 const after=await f.state();assert.deepEqual(after.professions,before.professions);assert.equal(after.money,before.money);
});

for(const profession of ['alchemy','blacksmithing','leatherworking','tailoring','engineering','enchanting','cooking','firstaid'] as const){
 test(`${profession}: paid real craft orders grow skill 1–125 and train ranks at fixture levels 5/10/20`,async()=>{
  const f=await fixture();await f.level(5);await f.cmd({type:'learnProfession',id:profession});
  let orders=0;
  for(const [target,level] of [[50,10],[125,20]]){
   while((await f.state()).professions[profession].skill<target){
    const state=await f.state(),skill=state.professions[profession].skill;
    const recipe=recipes.filter(r=>r.profession===profession&&r.skill<=skill&&r.gray>skill&&!r.specialization&&!r.cooldown&&r.outputMax<=5)
     .sort((a,b)=>b.yellow-a.yellow)[0];
    assert.ok(recipe,`${profession} has a skill-gaining recipe at ${skill}`);
    const count=Math.min(5,target-skill),before=countItem(state,recipe.item);
    const dispatched=await f.cmd({type:'craft',id:recipe.id,count,buyMissing:true});
    assert.equal(countItem(dispatched.state,recipe.item),before,'dispatch must not deliver output');
    if(orders++===0)f.restart();
    await f.settle();const done=await f.state();
    assert.ok(done.professions[profession].skill>=skill&&done.professions[profession].skill<=skill+count);
    if(skill+count<=recipe.yellow)assert.equal(done.professions[profession].skill,skill+count);
    assert.ok(countItem(done,recipe.item)>=before+recipe.output*count);
    // Sell via the public market so changing recipes never relies on clearing bags.
    for(const item of done.bag.filter((i:Rules)=>i.id===recipe.item))await f.cmd({type:'auctionSell',uid:item.uid});
    assert.ok(orders<100,'bounded progression');
   }
   // Character XP is deliberately outside this fixture: level gates are checked,
   // then the appropriate character level is explicitly supplied.
   const current=await f.state();
   const next=professionRanks[profession].find(r=>r.cap>current.professions[profession].cap)!;
   if(next.level>current.level)await assert.rejects(f.cmd({type:'upgradeProfession',id:profession}),/等级/);
   await f.level(level);const money=(await f.state()).money;
   const upgraded=await f.cmd({type:'upgradeProfession',id:profession});
   assert.equal(upgraded.state.professions[profession].cap,target===50?150:225);
   assert.equal(upgraded.state.money,money-next.cost);
  }
  assert.equal((await f.state()).professions[profession].skill,125);
  assert.equal((await f.store.transaction(tx=>tx.list('actor_leases'))).length,0);
 });
}

test('banked ingredients require withdrawal; recalled craft restores reserved ingredients after restart exactly once',async()=>{
 const f=await fixture();await f.cmd({type:'learnProfession',id:'firstaid'});
 for(const to of ['goldshire','stormwind']){const moved=await f.cmd({type:'travel',to});await f.settle(moved.state.activity.endsAt-moved.state.clock);}
 await f.cmd({type:'auctionBuy',id:2589,count:2});
 const linen=(await f.state()).bag.find((i:Rules)=>i.id===2589);
 await f.cmd({type:'bankDeposit',uid:linen.uid,count:2});
 await assert.rejects(f.cmd({type:'craft',id:'spell-3275',count:2}),/材料/);
 const bank=(await f.state()).bank.find((i:Rules)=>i.id===2589);
 await f.cmd({type:'bankWithdraw',uid:bank.uid,count:2});
 const started=await f.cmd({type:'craft',id:'spell-3275',count:2});
 const activity=started.activities.find(a=>a.status==='running')!;
 assert.equal(countItem(started.state,2589),0);
 await f.cmd({type:'recall',activityId:activity.id});f.restart();await f.settle();
 assert.equal(countItem(await f.state(),2589),2);assert.equal(countItem(await f.state(),1251),0);
 await f.settle();assert.equal(countItem(await f.state(),2589),2);
 await f.cmd({type:'craft',id:'spell-3275',count:2});await f.settle();
 assert.equal(countItem(await f.state(),1251),2);assert.equal(countItem(await f.state(),2589),0);
});

test('insufficient training and automatic purchase funds leave durable assets and orders unchanged',async()=>{
 const f=await fixture();await f.level(5);
 await f.store.transaction(tx=>tx.put('wallets',{id:f.hero,characterId:f.hero,accountId:'a',balance:99}));
 await assert.rejects(f.cmd({type:'learnProfession',id:'firstaid'}),/费用/);
 assert.equal((await f.state()).money,99);assert.deepEqual((await f.state()).professions,{});
 await f.cmd({type:'learnProfession',id:'alchemy'});
 const before=await f.state();
 await assert.rejects(f.cmd({type:'craft',id:'spell-2330',count:2,buyMissing:true}),/金币/);
 const after=await f.state();assert.equal(after.money,before.money);assert.deepEqual(after.bag,before.bag);
 assert.equal((await f.store.transaction(tx=>tx.list('reservations'))).length,0);
 assert.equal((await f.store.transaction(tx=>tx.list('activities'))).length,0);
});

for(const [profession,path,id,item] of [
 ['herbalism',['northwood'],'northwood:bloom',2447],
 ['mining',['northwood','echo'],'echo:copper',2770],
] as const){
 test(`${profession}: paid learning and actual travel lead to durable gathering and skill gain`,async()=>{
  const f=await fixture();await f.cmd({type:'learnProfession',id:profession});
  for(const to of path){const moved=await f.cmd({type:'travel',to});await f.settle(moved.state.activity.endsAt-moved.state.clock);}
  await f.cmd({type:'gatherResource',id});f.restart();await f.settle();
  const s=await f.state();assert.ok(countItem(s,item)>0);assert.equal(s.professions[profession].skill,2);
  await f.settle();assert.equal(countItem(await f.state(),item),countItem(s,item));
  await assert.rejects(f.cmd({type:'gatherResource',id}),/资源/);
 });
}

test('fishing then cooking consumes the gathered fish through durable orders, without gifted materials',async()=>{
 const f=await fixture();await f.level(5);
 for(const id of ['fishing','cooking'])await f.cmd({type:'learnProfession',id});
 for(const to of ['goldshire','mirror']){const moved=await f.cmd({type:'travel',to});await f.settle(moved.state.activity.endsAt-moved.state.clock);}
 await f.cmd({type:'gatherResource',id:'mirror:fish'});f.restart();await f.settle();
 const caught=await f.state(),fish=countItem(caught,6291);assert.ok(fish>=1);assert.equal(caught.professions.fishing.skill,2);
 await assert.rejects(f.cmd({type:'gatherResource',id:'mirror:fish'}),/资源/);
 const moved=await f.cmd({type:'travel',to:'goldshire'});await f.settle(moved.state.activity.endsAt-moved.state.clock);
 await f.cmd({type:'craft',id:'spell-7751',count:fish});await f.settle();
 const cooked=await f.state();assert.equal(countItem(cooked,6291),0);assert.equal(countItem(cooked,6290),fish);assert.equal(cooked.professions.cooking.skill,1+fish);
});

test('fishing remains trainable beyond 76 so level-20 expert rank is reachable',async()=>{
 const f=await fixture();await f.level(20);await f.cmd({type:'learnProfession',id:'fishing'});
 // Boundary fixture, not a natural-growth claim: reproduce the old gray-node
 // dead end without making 75 earlier catches unrelated to this regression.
 await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',f.hero))!;c.rules.location='mirror';c.rules.professions.fishing={skill:76,cap:150};await tx.put('characters',c);});
 await f.cmd({type:'gatherResource',id:'mirror:fish'});await f.settle();
 assert.equal((await f.state()).professions.fishing.skill,77);
 for(let skill=77;skill<125;skill++){
  await f.settle(300000);await f.cmd({type:'gatherResource',id:'mirror:fish'});await f.settle();
  const caught=await f.state();assert.equal(caught.professions.fishing.skill,skill+1);
  for(const fish of caught.bag.filter((i:Rules)=>i.id===6291))await f.cmd({type:'auctionSell',uid:fish.uid});
 }
 const moved=await f.cmd({type:'travel',to:'goldshire'});await f.settle(moved.state.activity.endsAt-moved.state.clock);
 assert.equal((await f.cmd({type:'upgradeProfession',id:'fishing'})).state.professions.fishing.cap,225);
});

test('fishing skill gains respect the trained cap',async()=>{
 const f=await fixture();await f.level(5);await f.cmd({type:'learnProfession',id:'fishing'});
 await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',f.hero))!;c.rules.location='mirror';c.rules.professions.fishing.skill=75;await tx.put('characters',c);});
 await f.cmd({type:'gatherResource',id:'mirror:fish'});await f.settle();
 assert.equal((await f.state()).professions.fishing.skill,75);assert.ok(countItem(await f.state(),6291)>0);
});

test('crafted first-aid bandages heal, consume inventory and persist their use cooldown',async()=>{
 const f=await fixture();await f.cmd({type:'learnProfession',id:'firstaid'});
 await f.cmd({type:'craft',id:'spell-3275',count:2,buyMissing:true});await f.settle();
 // Damage is a boundary fixture; the two bandages were made by a real order.
 await f.store.transaction(async tx=>{const c=(await tx.get<Character>('characters',f.hero))!;c.rules.hp=1;await tx.put('characters',c);});
 const healed=await f.cmd({type:'useBandage',id:1251});assert.ok(healed.state.hp>1);assert.equal(countItem(healed.state,1251),1);
 f.restart();await assert.rejects(f.cmd({type:'useBandage',id:1251}),/冷却/);assert.equal(countItem(await f.state(),1251),1);
});
