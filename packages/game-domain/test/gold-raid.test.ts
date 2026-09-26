import {advance} from '../src/rules/engine.js';
import {moltenCoreRoute} from '../src/rules/molten-core-content.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {items,talents} from '../src/rules/catalog.js';
import {canEquip,stats} from '../src/rules/character.js';
import {goldRaidView,goldRaidAction,goldAuctionStep,finishGoldRun} from '../src/rules/gold-raid.js';
import {GOLD,goldAvoidsFire,npcWantsConsumables} from '../src/rules/gold-raid-npcs.js';
import {localEligible} from '../src/local-simulation.ts';
import {PAUSED_EVENT_AT} from '../src/presence.ts';
import type {Rules} from '../src/model.ts';
async function fixture(){
 let now=Date.UTC(2026,8,21),seq=0;const store=new MemoryStore(),options={contentVersion:'test',now:()=>now,seed:()=>60325};let service=new GameService(store,options);
 const save=await service.createSave('gold-test',{name:'金团团长',classId:8,raceId:1,raidReady:true},'gold-save');
 const command=(type:string,extra:Rules={})=>service.command(save.id,{type,requestId:'gold-'+(++seq),...extra});
 const snapshot=()=>service.snapshot(save.id);
 const step=async()=>{now+=2000;await service.snapshot(save.id,undefined,true);assert.deepEqual((await service.work()).errors,[]);return snapshot();};
 await command('enterDungeon',{contentId:'molten-core-gold'});
 return {store,save,command,snapshot,step,work:()=>service.work(),elapse:(ms:number)=>{now+=ms;},restart:()=>{service=new GameService(store,options);}};
}
async function recruit(f:Awaited<ReturnType<typeof fixture>>,skipApproach=true){
 await f.command('goldPublish');await f.command('goldRecommend');const snap=await f.command('goldLaunch');
 // Auction/boss tests start after approach packs; route progression has its own integration suite.
 if(skipApproach)await f.store.transaction(async tx=>{const row:any=await tx.get('instances',snap.instanceId!);row.simulation.goldRaid.clearedPacks=moltenCoreRoute.filter(n=>n.kind==='trash').map(n=>n.id);await tx.put('instances',row);});
 return f.snapshot();
}
const assets=(s:Rules)=>s.money+s.party.filter((c:Rules)=>c.goldNpc).reduce((n:number,c:Rules)=>n+c.money+c.goldProfile.consumableSpent,0)+s.goldRaid.pot-s.goldRaid.paidOut+(s.goldRaid.auction?.price||0);

test('idle gold camp waits for a command without background instance writes',async()=>{
 const f=await fixture();let snap=await recruit(f,false);
 const camp=await f.store.read(tx=>tx.get<any>('instances',snap.instanceId!));
 assert.equal(camp!.nextEventAt,PAUSED_EVENT_AT);
 f.elapse(60_000);
 assert.equal((await f.work()).instances,0);
 assert.equal((await f.store.read(tx=>tx.get<any>('instances',snap.instanceId!)))!.sequence,camp!.sequence);
 snap=await f.command('goldNavigate',{destination:'lucifron'});
 assert.equal(snap.state!.combat.raidEncounter.id,'mc-gate');
 assert.ok((await f.store.read(tx=>tx.get<any>('instances',snap.instanceId!)))!.nextEventAt<PAUSED_EVENT_AT);
});

test('bid racing an NPC round refreshes the quote without charging or rolling back progress',async()=>{
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 await f.step();
 await f.store.transaction(async tx=>{
  const i:any=await tx.get('instances',snap.instanceId!),s=i.simulation,npc=s.party.find((c:Rules)=>c.goldNpc);
  npc.goldProfile.personality='saver';s.goldRaid.auction.itemId=19147;i.simulation.goldRaid.auction.count=1;s.goldRaid.auction.limits={[npc.id]:30*GOLD};await tx.put('instances',i);
 });
 snap=await f.snapshot();const s=snap.state!,a=s.goldRaid.auction,before=s.money,total=assets(s);
 f.elapse(s.goldRaid.auction.nextRoundAt-s.clock+1); // NPC bids after the displayed quote, before POST.
 const stale={lotId:a.id,amount:a.opening,quotedMinimum:a.opening,recipient:s.id,requestId:'racing-bid'};
 snap=await f.command('goldBid',stale);
 assert.equal(snap.state!.money,before);assert.equal(snap.state!.goldRaid.auction.price,10*GOLD);
 assert.match(goldRaidView(snap.state)!.auction!.bidNotice,/未扣款/);assert.equal(assets(snap.state),total);
 assert.equal(goldRaidView(snap.state)!.auction!.minimum,15*GOLD);
 snap=await f.command('goldBid',stale);assert.equal(snap.state!.money,before); // Receipt replay never bids.
 f.restart();snap=await f.snapshot();assert.equal(snap.state!.goldRaid.auction.price,10*GOLD);
 const minimum=goldRaidView(snap.state)!.auction!.minimum;
 snap=await f.command('goldBid',{lotId:a.id,amount:minimum,quotedMinimum:minimum,recipient:s.id});
 assert.equal(snap.state!.goldRaid.auction.leader,'player');assert.equal(snap.state!.money,before-minimum);
 assert.equal(goldRaidView(snap.state)!.auction!.bidNotice,null);assert.equal(assets(snap.state),total);
 const persisted:any=await f.store.read(tx=>tx.get('instances',snap.instanceId!));
 assert.equal(persisted.nextEventAt,snap.state!.wallAt+4000,'auction persistence waits for the next bidding round');
 f.elapse(4001);
 snap=await f.command('goldBid',{lotId:a.id,amount:50*GOLD,quotedMinimum:minimum,recipient:s.id});
 assert.equal(snap.state!.goldRaid.auction.price,50*GOLD);assert.equal(snap.state!.money,before-50*GOLD);assert.equal(assets(snap.state),total);
});

test('the persistent hall supplies legal gear/talents and locks announced contract and ownership',async()=>{
 const f=await fixture();await f.command('goldRules',{rules:{leaderFee:5,dpsBonus:20,supportBonus:15}});let snap=await f.command('goldPublish'),g=snap.state!.goldRaid;
 assert.equal(g.applicants.length,50);assert.ok(new Set(g.applicants.map((c:Rules)=>c.goldProfile.personality)).size>=4);
 for(const c of g.applicants.filter((c:Rules)=>c.classId===4||c.classId===1&&c.strategyPolicy.role==='melee')){
  assert.equal(items[c.equipment[17]?.id]?.class,2,c.name);
  assert.notEqual(items[c.equipment[16]?.id]?.InventoryType,17,c.name);
  assert.ok(c.learned.includes(674),c.name);
 }
 for(const c of g.applicants){assert.equal(Object.values(c.talents).reduce((n:number,v:any)=>n+v,0),51);for(const e of Object.values(c.equipment) as Rules[])assert.ok(canEquip(c,items[e.id]));for(const[id,rank]of Object.entries(c.talents)){const t:any=talents[id];assert.ok(Number(rank)<=t.maxRank);for(const p of t.prerequisites)assert.ok(c.talents[p.talentId]>=p.requiredRank);}}
 await assert.rejects(f.command('goldRules',{rules:{leaderFee:0,dpsBonus:0,supportBonus:0}}),/当前阶段/);
 await f.command('goldRecommend');snap=await f.command('goldLaunch');assert.equal(snap.state!.party.length,24);
 assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,1);assert.equal((await f.store.read(tx=>tx.list('characters',{accountId:f.save.id}))).length,1);
 const instance:any=await f.store.read(tx=>tx.get('instances',snap.instanceId!));assert.equal(localEligible(instance),false);
 await assert.rejects(f.command('goldInvite',{id:'unknown'}),/当前阶段/);
 await assert.rejects(f.command('strategy',{target:snap.state!.party.find((c:Rules)=>c.goldNpc).id}),/NPC自行/);
 await assert.rejects(f.command('leaveInstance'),/结算/);
 const novice=g.applicants.find((c:Rules)=>c.goldProfile.skill==='novice');assert.ok(novice);
 const regular=g.applicants.find((c:Rules)=>c.goldProfile.personality!=='saver'&&c.goldProfile.skill==='regular'&&!['tank','healer'].includes(c.strategyPolicy.role));assert.ok(regular);
 assert.equal(npcWantsConsumables(regular,{dpsBonus:0,supportBonus:0}),false);assert.equal(npcWantsConsumables(regular,{dpsBonus:20,supportBonus:0}),true);
});

test('player escrow, NPC budgets, loot ownership, payout conservation and repeat requests',async()=>{
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();const s=snap.state!,g=s.goldRaid;assert.equal(g.phase,'camp');const lotCount=g.lots.length+1;assert.ok(lotCount>=3);g.auction.itemId=19147;g.auction.count=1;
 const total=assets(s),original=s.money,a=g.auction,recipient=[s,...s.party].find(c=>g.coreIds.includes(c.id)&&canEquip(c,items[a.itemId]));assert.ok(recipient);
 goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:a.minimum||a.opening,recipient:recipient.id});assert.equal(s.money,original-a.price);assert.equal(assets(s),total);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:'stale',amount:1,recipient:s.id}),/拍品已更新/);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:Infinity,recipient:s.id}),/整数/);
 // No forced outcome: finish real NPC bidding and retain each participant's budget.
 for(let i=0;i<300&&g.auction;i++){goldAuctionStep(s);assert.equal(assets(s),total);assert.ok(s.party.filter((c:Rules)=>c.goldNpc).every((c:Rules)=>c.money>=0));}
 assert.equal(g.auction,null);assert.equal(g.sales.length,lotCount);assert.ok(g.sales.some((sale:Rules)=>sale.price>0));
 const before=s.money;finishGoldRun(s);assert.equal(s.money-before,g.settlement.playerIncome);assert.equal(assets(s),total);assert.equal(g.settlement.rows.length,25);
 assert.equal(g.settlement.rows.reduce((sum:number,r:Rules)=>sum+r.total,g.settlement.fee),g.pot);assert.throws(()=>finishGoldRun(s),/已经/);
 assert.ok(!JSON.stringify(goldRaidView(s)).includes('limits'));
});

test('recommended NPC raid beats both real encounters without replacing the combat engine',async()=>{
 const f=await fixture();let snap=await recruit(f),expectedSales=0;
 for(const bossId of ['lucifron','magmadar']){
  snap=await f.command('goldStart',{bossId});
  for(let i=0;i<100&&snap.state!.combat;i++){snap=await f.step();if(i===10)f.restart();}
  assert.equal(snap.state!.combat,null);assert.ok(snap.state!.goldRaid.cleared.includes(bossId),JSON.stringify(snap.state!.goldRaid.attempts));
  assert.ok(snap.state!.party.some((c:Rules)=>c.goldNpc&&c.goldProfile.consumableSpent>0));
  expectedSales+=snap.state!.goldRaid.lots.length+(snap.state!.goldRaid.auction?1:0);
  // Bidding uses the real service, transaction receipts and virtual wallets.
  for(let i=0;i<300&&snap.state!.goldRaid.auction;i++)snap=await f.command('goldAuctionStep',{lotId:snap.state!.goldRaid.auction.id});
  await f.command('loot');
  await f.command('goldRecover');for(let i=0;i<5;i++)await f.step();
 }
 snap=await f.command('goldSettle');assert.ok(snap.state!.goldRaid.settlement);assert.equal(snap.state!.goldRaid.sales.length,expectedSales);
 const money=snap.state!.money;await assert.rejects(f.command('goldSettle'),/当前阶段/);assert.equal((await f.snapshot()).state!.money,money);
 snap=await f.command('leaveInstance');assert.equal(snap.state!.party.length,0);assert.equal(snap.state!.goldRaid.active,false);
});

test('player purchase persists exactly once and emergency exit refunds open escrow and settles sales',async()=>{
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.goldRaid.auction.itemId=19147;i.simulation.goldRaid.auction.count=1;i.simulation.goldRaid.auction.limits={};await tx.put('instances',i);});
 const lotId=snap.state!.goldRaid.auction.id,extra={lotId,amount:10*GOLD,recipient:snap.state!.id,requestId:'same-winning-bid'};
 const before=snap.state!.money;
 snap=await f.command('goldBid',extra);assert.equal(snap.state!.money,before-10*GOLD);
 snap=await f.command('goldBid',extra);assert.equal(snap.state!.money,before-10*GOLD);
 for(let n=0;n<3;n++)snap=await f.command('goldAuctionStep',{lotId});
 assert.equal(snap.state!.pending.filter((i:Rules)=>i.id===19147).length,1);
 snap=await f.command('loot');assert.equal(snap.state!.bag.filter((i:Rules)=>i.id===19147).length,1);
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.goldRaid.auction.itemId=19147;i.simulation.goldRaid.auction.count=1;i.simulation.goldRaid.auction.limits={};await tx.put('instances',i);});
 const beforeSecond=snap.state!.money;
 snap=await f.command('goldBid',{lotId:snap.state!.goldRaid.auction.id,amount:10*GOLD,recipient:snap.state!.id});
 snap=await f.command('unstuck');assert.equal(snap.instanceId,null);assert.equal(snap.state!.goldRaid.active,false);
 assert.equal(snap.state!.money,beforeSecond+snap.state!.goldRaid.settlement.playerIncome);
 assert.equal(snap.state!.goldRaid.pot,10*GOLD);assert.equal(snap.state!.party.length,0);
});


test('gold map commands roll trash loot without blocking navigation and pause before the next pull',async()=>{
 const f=await fixture();let snap=await recruit(f,false);
 snap=await f.command('goldNavigate',{destination:'lucifron'});assert.equal(snap.state!.combat.raidEncounter.id,'mc-gate');
 await f.store.transaction(async tx=>{const row:any=await tx.get('instances',snap.instanceId!);row.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',row);});
 snap=await f.step();assert.equal(snap.state!.goldRaid.phase,'camp');assert.equal(snap.state!.goldRaid.auction.bossId,'mc-gate');assert.ok(snap.state!.goldRaid.auction.count>0);assert.deepEqual(snap.state!.goldRaid.clearedPacks,['mc-gate']);
 snap=await f.command('goldPause');assert.equal(snap.state!.goldRaid.autoAdvance,false);assert.equal(snap.state!.activity.type,'idle');
 snap=await f.command('goldNavigate',{destination:'mc-bridge'});assert.equal(snap.state!.combat.raidEncounter.id,'mc-bridge');
 await f.command('goldPause');assert.equal((await f.snapshot()).state!.goldRaid.autoAdvance,false);
});

async function auctionFixture(){
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();return {f,snap};
}
test('background auction keeps its timer during combat and queues the next boss loot',async()=>{
 const {f,snap:initial}=await auctionFixture();const lotId=initial.state!.goldRaid.auction.id;
 let snap=await f.command('goldStart',{bossId:'magmadar'});const combatId=snap.state!.combat.id;
 assert.equal(snap.state!.goldRaid.phase,'combat');assert.equal(snap.state!.goldRaid.auction.id,lotId);
 const round=snap.state!.goldRaid.auction.round;
 const advanced=advance(snap.state!,snap.state!.wallAt+4100).state;
 assert.equal(advanced.combat.id,combatId);assert.ok(advanced.goldRaid.auction.round>round);
 assert.ok(advanced.logs.some((entry:Rules)=>entry.kind==='damage'));
 snap=await f.command('goldPass',{lotId});assert.equal(snap.state!.combat.id,combatId);assert.equal(snap.state!.activity.type,'idle');
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();assert.equal(snap.state!.goldRaid.auction.id,lotId);assert.ok(snap.state!.goldRaid.lots.filter((lot:Rules)=>lot.bossId==='magmadar').length>=3);assert.equal(snap.state!.goldRaid.lots.filter((lot:Rules)=>lot.bossId==='lucifron').length,initial.state!.goldRaid.lots.length);
 assert.throws(()=>finishGoldRun(snap.state!),/拍卖/);
});
test('background inquiry and settlement preserve recovery and its completion',async()=>{
 const {f}=await auctionFixture();let snap=await f.command('goldRecover');
 const until=snap.state!.goldRaid.recoverUntil,lotId=snap.state!.goldRaid.auction.id;
 snap=await f.command('goldAuctionStep',{lotId});assert.equal(snap.state!.activity.type,'goldRecovery');assert.equal(snap.state!.activity.endsAt,until);
 const state=snap.state!;state.goldRaid.lots=[];state.goldRaid.auction.limits={};state.goldRaid.auction.quiet=2;
 const result=advance(state,state.wallAt+10001).state;
 assert.equal(result.goldRaid.auction,null);assert.equal(result.goldRaid.recoverUntil,0);assert.equal(result.activity.type,'idle');
});
test('player can bid in combat; purchased delivery does not block the next encounter',async()=>{
 const {f,snap:initial}=await auctionFixture();
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',initial.instanceId!);i.simulation.goldRaid.auction.itemId=19147;i.simulation.goldRaid.auction.count=1;i.simulation.goldRaid.auction.limits={};await tx.put('instances',i);});
 let snap=await f.command('goldStart',{bossId:'magmadar'});const lotId=snap.state!.goldRaid.auction.id,combatId=snap.state!.combat.id;
 snap=await f.command('goldBid',{lotId,amount:10*GOLD,recipient:snap.state!.id});
 assert.equal(snap.state!.combat.id,combatId);assert.equal(snap.state!.goldRaid.auction.leader,'player');
 await assert.rejects(f.command('goldPass',{lotId}),/领先/);
 for(let n=0;n<3;n++)snap=await f.command('goldAuctionStep',{lotId});
 assert.ok(snap.state!.pending.some((item:Rules)=>item.id===19147));assert.equal(snap.state!.combat.id,combatId);
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',initial.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();assert.equal(snap.state!.goldRaid.phase,'camp');assert.ok(goldRaidView(snap.state!).map!.canFullClear);
 snap=await f.command('goldStart',{bossId:'gehennas'});assert.ok(snap.state!.combat);assert.ok(snap.state!.pending.length);
});
