import {raidScaling} from '../src/rules/raid-scaling.js';
import {goldReagentTargets} from '../src/rules/gold-raid-reagents.js';
import {usableCount} from '../src/rules/inventory.js';
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
import type {Rules} from '../src/model.ts';
import {PAUSED_EVENT_AT} from '../src/presence.ts';
async function fixture(){
 // NPC equipment and recruitment also derive randomness from the character ID.
 // A fixed battle seed alone still gives a different raid on every test run.
 let now=Date.UTC(2026,8,21),seq=0,idSequence=0;const store=new MemoryStore(),options={contentVersion:'test',now:()=>now,seed:()=>60325,id:()=>`gold-fixture-${++idSequence}`};let service=new GameService(store,options);
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
const assets=(s:Rules)=>s.money+s.party.filter((c:Rules)=>c.goldNpc).reduce((n:number,c:Rules)=>n+c.money+c.goldProfile.consumableSpent,0)+s.goldRaid.pot-s.goldRaid.paidOut+(s.goldRaid.auctions.reduce((n:number,a:Rules)=>n+a.price,0));

test('idle gold camp waits for a command without background instance writes',async()=>{
 const f=await fixture();let snap=await recruit(f,false);
 const camp=await f.store.read(tx=>tx.get<any>('instances',snap.instanceId!));
 assert.equal(camp!.nextEventAt,PAUSED_EVENT_AT);
 for(const c of camp!.simulation.party.filter((c:Rules)=>c.goldNpc)){
  for(const [id,count]of goldReagentTargets(c))assert.equal(usableCount(c,id),count);
  const resident=camp!.simulation.npcWorld.residents.find((p:Rules)=>p.id===c.id);
  assert.deepEqual(resident.unit.bag,c.bag);assert.equal(resident.wallet,c.money);
 }
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
  const i:any=await tx.get('instances',snap.instanceId!),s=i.simulation,npc=s.party.find((c:Rules)=>c.classId===8);
  npc.equipment={};s.goldRaid.auctions=s.goldRaid.auctions.slice(0,1);npc.goldProfile.personality='value';s.goldRaid.auctions[0].itemId=19147;i.simulation.goldRaid.auctions[0].count=1;s.goldRaid.auctions[0].limits={[npc.id]:30*GOLD};await tx.put('instances',i);
 });
 snap=await f.snapshot();const s=snap.state!,a=s.goldRaid.auctions[0],before=s.money,total=assets(s);
 f.elapse(s.goldRaid.auctions[0].nextRoundAt-s.clock+1); // NPC bids after the displayed quote, before POST.
 const stale={lotId:a.id,amount:a.opening,quotedMinimum:a.opening,recipient:s.id,requestId:'racing-bid'};
 snap=await f.command('goldBid',stale);
 assert.equal(snap.state!.money,before);assert.equal(snap.state!.goldRaid.auctions[0].price,10*GOLD);
 assert.match(goldRaidView(snap.state)!.auctions[0]!.bidNotice,/未扣款/);assert.equal(assets(snap.state),total);
 assert.equal(goldRaidView(snap.state)!.auctions[0]!.minimum,15*GOLD);
 snap=await f.command('goldBid',stale);assert.equal(snap.state!.money,before); // Receipt replay never bids.
 f.restart();snap=await f.snapshot();assert.equal(snap.state!.goldRaid.auctions[0].price,10*GOLD);
 const minimum=goldRaidView(snap.state)!.auctions[0]!.minimum;
 snap=await f.command('goldBid',{lotId:a.id,amount:minimum,quotedMinimum:minimum,recipient:s.id});
 assert.equal(snap.state!.goldRaid.auctions[0].leader,'player');assert.equal(snap.state!.money,before-minimum);
 assert.equal(goldRaidView(snap.state)!.auctions[0]!.bidNotice,null);assert.equal(assets(snap.state),total);
 const persisted:any=await f.store.read(tx=>tx.get('instances',snap.instanceId!));
 assert.equal(persisted.nextEventAt,snap.state!.wallAt+4000,'auction persistence waits for the next bidding round');
 f.elapse(4001);
 snap=await f.command('goldBid',{lotId:a.id,amount:50*GOLD,quotedMinimum:minimum,recipient:s.id});
 assert.equal(snap.state!.goldRaid.auctions[0].price,50*GOLD);assert.equal(snap.state!.money,before-50*GOLD);assert.equal(assets(snap.state),total);
});

test('the persistent hall supplies legal gear/talents and locks announced contract and ownership',async()=>{
 const f=await fixture();await f.command('goldRules',{rules:{leaderFee:5,dpsBonus:20,supportBonus:15}});let snap=await f.command('goldPublish'),g=snap.state!.goldRaid;
 assert.equal(g.applicants.length,72);assert.ok(new Set(g.applicants.map((c:Rules)=>c.goldProfile.personality)).size>=4);
 for(const c of g.applicants.filter((c:Rules)=>c.classId===4||c.classId===1&&c.strategyPolicy.role==='melee')){
  assert.equal(items[c.equipment[17]?.id]?.class,2,c.name);
  assert.notEqual(items[c.equipment[16]?.id]?.InventoryType,17,c.name);
  assert.ok(c.learned.includes(674),c.name);
 }
 for(const c of g.applicants){assert.equal(Object.values(c.talents).reduce((n:number,v:any)=>n+v,0),51);for(const e of Object.values(c.equipment) as Rules[])assert.ok(canEquip(c,items[e.id]));for(const[id,rank]of Object.entries(c.talents)){const t:any=talents[id];assert.ok(Number(rank)<=t.maxRank);for(const p of t.prerequisites)assert.ok(c.talents[p.talentId]>=p.requiredRank);}}
 await assert.rejects(f.command('goldRules',{rules:{leaderFee:0,dpsBonus:0,supportBonus:0}}),/当前阶段/);
 await f.command('goldRecommend');snap=await f.command('goldLaunch');assert.equal(snap.state!.party.length,39);
 assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,1);assert.equal((await f.store.read(tx=>tx.list('characters',{accountId:f.save.id}))).length,1);
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
 snap=await f.step();const s=snap.state!,g=s.goldRaid;assert.equal(g.phase,'camp');const lotCount=g.auctions.length;assert.ok(lotCount>=3);g.auctions[0].itemId=19147;g.auctions[0].count=1;
 const total=assets(s),original=s.money,a=g.auctions[0],recipient=[s,...s.party].find(c=>g.coreIds.includes(c.id)&&canEquip(c,items[a.itemId]));assert.ok(recipient);
 goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:a.minimum||a.opening,recipient:recipient.id});assert.equal(s.money,original-a.price);assert.equal(assets(s),total);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:'stale',amount:1,recipient:s.id}),/拍品已更新/);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:Infinity,recipient:s.id}),/整数/);
 // No forced outcome: finish real NPC bidding and retain each participant's budget.
 for(let i=0;i<300&&g.auctions[0];i++){goldAuctionStep(s);assert.equal(assets(s),total);assert.ok(s.party.filter((c:Rules)=>c.goldNpc).every((c:Rules)=>c.money>=0));}
 assert.equal(g.auctions.length,0);assert.equal(g.sales.length,lotCount);assert.ok(g.sales.some((sale:Rules)=>sale.price>0));
 const before=s.money;finishGoldRun(s);assert.equal(s.money-before,g.settlement.playerIncome);assert.equal(assets(s),total);assert.equal(g.settlement.rows.length,40);
 assert.equal(g.settlement.rows.reduce((sum:number,r:Rules)=>sum+r.total,g.settlement.fee),g.pot);assert.throws(()=>finishGoldRun(s),/已经/);
 assert.ok(!JSON.stringify(goldRaidView(s)).includes('limits'));
});

test('recommended 40-person raid persists real combat and allows settlement after a failed attempt',async()=>{
 const f=await fixture();let snap=await recruit(f);
 snap=await f.command('goldStart',{bossId:'lucifron'});
 for(let i=0;i<6;i++)snap=await f.step();
 assert.equal(snap.state!.party.length,39);assert.ok(snap.state!.combat.enemies[0].maxHp===351780);
 assert.ok(snap.state!.party.some((c:Rules)=>c.goldNpc&&c.goldProfile.consumableSpent>0));
 const encounterId=snap.state!.combat.id;f.restart();snap=await f.snapshot();assert.equal(snap.state!.combat.id,encounterId);
 snap=await f.command('abandonCombat',{encounterId});assert.equal(snap.state!.combat,null);
 assert.equal(snap.state!.goldRaid.attempts.at(-1).won,false);assert.equal(snap.state!.goldRaid.auctions.length,0);
 snap=await f.command('goldSettle');assert.equal(snap.state!.goldRaid.settlement.pot,0);
 snap=await f.command('leaveInstance');assert.equal(snap.state!.party.length,0);assert.equal(snap.state!.goldRaid.active,false);
});

test('player purchase persists exactly once and emergency exit refunds open escrow and settles sales',async()=>{
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.goldRaid.auctions[0].itemId=19147;i.simulation.goldRaid.auctions[0].count=1;i.simulation.goldRaid.auctions[0].limits={};await tx.put('instances',i);});
 const lotId=snap.state!.goldRaid.auctions[0].id,extra={lotId,amount:10*GOLD,recipient:snap.state!.id,requestId:'same-winning-bid'};
 const before=snap.state!.money;
 snap=await f.command('goldBid',extra);assert.equal(snap.state!.money,before-10*GOLD);
 snap=await f.command('goldBid',extra);assert.equal(snap.state!.money,before-10*GOLD);
 for(let n=0;n<3;n++)snap=await f.command('goldAuctionStep',{lotId});
 assert.equal(snap.state!.pending.filter((i:Rules)=>i.id===19147).length,1);
 snap=await f.command('loot');assert.equal(snap.state!.bag.filter((i:Rules)=>i.id===19147).length,1);
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.goldRaid.auctions[0].itemId=19147;i.simulation.goldRaid.auctions[0].count=1;i.simulation.goldRaid.auctions[0].limits={};await tx.put('instances',i);});
 const beforeSecond=snap.state!.money;
 snap=await f.command('goldBid',{lotId:snap.state!.goldRaid.auctions[0].id,amount:10*GOLD,recipient:snap.state!.id});
 snap=await f.command('unstuck');assert.equal(snap.instanceId,null);assert.equal(snap.state!.goldRaid.active,false);
 assert.equal(snap.state!.money,beforeSecond+snap.state!.goldRaid.settlement.playerIncome);
 assert.equal(snap.state!.goldRaid.pot,10*GOLD);assert.equal(snap.state!.party.length,0);
});


test('gold map commands roll trash loot without blocking navigation and pause before the next pull',async()=>{
 const f=await fixture();let snap=await recruit(f,false);
 snap=await f.command('goldNavigate',{destination:'lucifron'});assert.equal(snap.state!.combat.raidEncounter.id,'mc-gate');
 await f.store.transaction(async tx=>{const row:any=await tx.get('instances',snap.instanceId!);row.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',row);});
 snap=await f.step();assert.equal(snap.state!.goldRaid.phase,'camp');assert.equal(snap.state!.goldRaid.auctions[0].bossId,'mc-gate');assert.ok(snap.state!.goldRaid.auctions[0].count>0);assert.deepEqual(snap.state!.goldRaid.clearedPacks,['mc-gate']);
 snap=await f.command('goldPause');assert.equal(snap.state!.goldRaid.autoAdvance,false);assert.equal(snap.state!.activity.type,'idle');
 snap=await f.command('goldNavigate',{destination:'mc-bridge'});assert.equal(snap.state!.combat.raidEncounter.id,'mc-bridge');
 await f.command('goldPause');assert.equal((await f.snapshot()).state!.goldRaid.autoAdvance,false);
});

async function auctionFixture(){
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();return {f,snap};
}
test('parallel auctions keep their timers during combat and open the next boss loot',async()=>{
 const {f,snap:initial}=await auctionFixture();const lotId=initial.state!.goldRaid.auctions[0].id;
 let snap=await f.command('goldStart',{bossId:'magmadar'});const combatId=snap.state!.combat.id;
 assert.equal(snap.state!.goldRaid.phase,'combat');assert.equal(snap.state!.goldRaid.auctions[0].id,lotId);
 const round=snap.state!.goldRaid.auctions[0].round;
 const advanced=advance(snap.state!,snap.state!.wallAt+4100).state;
 assert.equal(advanced.combat.id,combatId);assert.ok(advanced.goldRaid.auctions[0].round>round);
 assert.ok(advanced.logs.some((entry:Rules)=>entry.kind==='damage'));
 snap=await f.command('goldPass',{lotId});assert.equal(snap.state!.combat.id,combatId);assert.equal(snap.state!.activity.type,'idle');
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();assert.equal(snap.state!.goldRaid.auctions[0].id,lotId);assert.ok(snap.state!.goldRaid.auctions.filter((lot:Rules)=>lot.bossId==='magmadar').length>=3);assert.equal(snap.state!.goldRaid.auctions.filter((lot:Rules)=>lot.bossId==='lucifron').length,initial.state!.goldRaid.auctions.length);
 assert.throws(()=>finishGoldRun(snap.state!),/拍卖/);
});
test('background inquiry and settlement preserve recovery and its completion',async()=>{
 const {f}=await auctionFixture();let snap=await f.command('goldRecover');
 const until=snap.state!.goldRaid.recoverUntil,lotId=snap.state!.goldRaid.auctions[0].id;
 snap=await f.command('goldAuctionStep',{lotId});assert.equal(snap.state!.activity.type,'goldRecovery');assert.equal(snap.state!.activity.endsAt,until);
 const state=snap.state!;state.goldRaid.auctions=state.goldRaid.auctions.slice(0,1);state.goldRaid.auctions[0].limits={};state.goldRaid.auctions[0].quiet=2;
 const result=advance(state,state.wallAt+10001).state;
 assert.equal(result.goldRaid.auctions.length,0);assert.equal(result.goldRaid.recoverUntil,0);assert.equal(result.activity.type,'idle');
});
test('player can bid in combat; purchased delivery does not block the next encounter',async()=>{
 const {f,snap:initial}=await auctionFixture();
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',initial.instanceId!);i.simulation.goldRaid.auctions[0].itemId=19147;i.simulation.goldRaid.auctions[0].count=1;i.simulation.goldRaid.auctions[0].limits={};await tx.put('instances',i);});
 let snap=await f.command('goldStart',{bossId:'magmadar'});const lotId=snap.state!.goldRaid.auctions[0].id,combatId=snap.state!.combat.id;
 snap=await f.command('goldBid',{lotId,amount:10*GOLD,recipient:snap.state!.id});
 assert.equal(snap.state!.combat.id,combatId);assert.equal(snap.state!.goldRaid.auctions[0].leader,'player');
 await assert.rejects(f.command('goldPass',{lotId}),/领先/);
 for(let n=0;n<3;n++)snap=await f.command('goldAuctionStep',{lotId});
 assert.ok(snap.state!.pending.some((item:Rules)=>item.id===19147));assert.equal(snap.state!.combat.id,combatId);
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',initial.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();assert.equal(snap.state!.goldRaid.phase,'camp');assert.ok(goldRaidView(snap.state!).map!.canFullClear);
 snap=await f.command('goldStart',{bossId:'gehennas'});assert.ok(snap.state!.combat);assert.ok(snap.state!.pending.length);
});
