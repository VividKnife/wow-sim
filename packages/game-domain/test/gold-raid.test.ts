import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {items,talents} from '../src/rules/catalog.js';
import {canEquip,stats} from '../src/rules/character.js';
import {goldRaidView,goldRaidAction,goldAuctionStep,finishGoldRun} from '../src/rules/gold-raid.js';
import {GOLD,goldAvoidsFire,npcWantsConsumables} from '../src/rules/gold-raid-npcs.js';
import {localEligible} from '../src/local-simulation.ts';
import type {Rules} from '../src/model.ts';
async function fixture(){
 let now=Date.UTC(2026,8,21),seq=0;const store=new MemoryStore(),options={contentVersion:'test',now:()=>now,seed:()=>60325};let service=new GameService(store,options);
 const save=await service.createSave('gold-test',{name:'金团团长',classId:8,raceId:1,raidReady:true},'gold-save');
 const command=(type:string,extra:Rules={})=>service.command(save.id,{type,requestId:'gold-'+(++seq),...extra});
 const snapshot=()=>service.snapshot(save.id);
 const step=async()=>{now+=2000;await service.snapshot(save.id,undefined,true);assert.deepEqual((await service.work()).errors,[]);return snapshot();};
 await command('enterDungeon',{contentId:'molten-core-gold'});
 return {store,save,command,snapshot,step,elapse:(ms:number)=>{now+=ms;},restart:()=>{service=new GameService(store,options);}};
}
async function recruit(f:Awaited<ReturnType<typeof fixture>>){await f.command('goldPublish');await f.command('goldRecommend');return f.command('goldLaunch');}
const assets=(s:Rules)=>s.money+s.party.filter((c:Rules)=>c.goldNpc).reduce((n:number,c:Rules)=>n+c.goldProfile.wallet+c.goldProfile.consumableSpent,0)+s.goldRaid.pot-s.goldRaid.paidOut+(s.goldRaid.auction?.price||0);

test('bid racing an NPC round refreshes the quote without charging or rolling back progress',async()=>{
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 await f.step();
 await f.store.transaction(async tx=>{
  const i:any=await tx.get('instances',snap.instanceId!),s=i.simulation,npc=s.party.find((c:Rules)=>c.goldNpc);
  npc.goldProfile.personality='saver';s.goldRaid.auction.itemId=991005;s.goldRaid.auction.limits={[npc.id]:30*GOLD};await tx.put('instances',i);
 });
 snap=await f.snapshot();const s=snap.state!,a=s.goldRaid.auction,before=s.money,total=assets(s);
 f.elapse(s.activity.endsAt-s.clock+1); // NPC bids after the displayed quote, before POST.
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

test('recruitment creates legal randomized gear/talents and locks announced contract and ownership',async()=>{
 const f=await fixture();await f.command('goldRules',{rules:{leaderFee:5,dpsBonus:20,supportBonus:15}});let snap=await f.command('goldPublish'),g=snap.state!.goldRaid;
 assert.equal(g.applicants.length,32);assert.ok(new Set(g.applicants.map((c:Rules)=>c.goldProfile.personality)).size>=4);
 for(const c of g.applicants){assert.equal(Object.values(c.talents).reduce((n:number,v:any)=>n+v,0),51);for(const e of Object.values(c.equipment) as Rules[])assert.ok(canEquip(c,items[e.id]));for(const[id,rank]of Object.entries(c.talents)){const t:any=talents[id];assert.ok(Number(rank)<=t.maxRank);for(const p of t.prerequisites)assert.ok(c.talents[p.talentId]>=p.requiredRank);}}
 await assert.rejects(f.command('goldRules',{rules:{leaderFee:0,dpsBonus:0,supportBonus:0}}),/当前阶段/);
 await f.command('goldRecommend');snap=await f.command('goldLaunch');assert.equal(snap.state!.party.length,24);
 assert.equal((await f.store.read(tx=>tx.list('actor_leases'))).length,5);assert.equal((await f.store.read(tx=>tx.list('characters',{accountId:f.save.id}))).length,5);
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
 snap=await f.step();const s=snap.state!,g=s.goldRaid;assert.equal(g.phase,'auction');assert.equal(g.lots.length,2);
 const total=assets(s),original=s.money,a=g.auction,recipient=[s,...s.party].find(c=>g.coreIds.includes(c.id)&&canEquip(c,items[a.itemId]));assert.ok(recipient);
 goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:a.minimum||a.opening,recipient:recipient.id});assert.equal(s.money,original-a.price);assert.equal(assets(s),total);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:'stale',amount:1,recipient:s.id}),/拍品已更新/);
 assert.throws(()=>goldRaidAction(s,{type:'goldBid',lotId:a.id,amount:Infinity,recipient:s.id}),/整数/);
 // No forced outcome: finish real NPC bidding and retain each participant's budget.
 for(let i=0;i<300&&g.auction;i++){goldAuctionStep(s);assert.equal(assets(s),total);assert.ok(s.party.filter((c:Rules)=>c.goldNpc).every((c:Rules)=>c.goldProfile.wallet>=0));}
 assert.equal(g.auction,null);assert.equal(g.sales.length,3);assert.ok(g.sales.some((sale:Rules)=>sale.price>0));
 const before=s.money;finishGoldRun(s);assert.equal(s.money-before,g.settlement.playerIncome);assert.equal(assets(s),total);assert.equal(g.settlement.rows.length,25);
 assert.equal(g.settlement.rows.reduce((sum:number,r:Rules)=>sum+r.total,g.settlement.fee),g.pot);assert.throws(()=>finishGoldRun(s),/已经/);
 assert.ok(!JSON.stringify(goldRaidView(s)).includes('limits'));
});

test('recommended NPC raid beats both real encounters without replacing the combat engine',async()=>{
 const f=await fixture();let snap=await recruit(f);
 for(const bossId of ['lucifron','magmadar']){
  snap=await f.command('goldStart',{bossId});
  for(let i=0;i<100&&snap.state!.combat;i++){snap=await f.step();if(i===10)f.restart();}
  assert.equal(snap.state!.combat,null);assert.ok(snap.state!.goldRaid.cleared.includes(bossId),JSON.stringify(snap.state!.goldRaid.attempts));
  assert.ok(snap.state!.party.some((c:Rules)=>c.goldNpc&&c.goldProfile.consumableSpent>0));
  // Bidding uses the real service, transaction receipts and virtual wallets.
  for(let i=0;i<300&&snap.state!.goldRaid.auction;i++)snap=await f.command('goldAuctionStep',{lotId:snap.state!.goldRaid.auction.id});
  await f.command('loot');
  await f.command('goldRecover');for(let i=0;i<5;i++)await f.step();
 }
 snap=await f.command('goldSettle');assert.ok(snap.state!.goldRaid.settlement);assert.equal(snap.state!.goldRaid.sales.length,6);
 const money=snap.state!.money;await assert.rejects(f.command('goldSettle'),/当前阶段/);assert.equal((await f.snapshot()).state!.money,money);
 snap=await f.command('leaveInstance');assert.equal(snap.state!.party.length,4);assert.equal(snap.state!.goldRaid.active,false);
});

test('player purchase persists exactly once and emergency exit refunds open escrow and settles sales',async()=>{
 const f=await fixture();let snap=await recruit(f);await f.command('goldStart',{bossId:'lucifron'});
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.combat.enemies.forEach((e:Rules)=>e.hp=0);await tx.put('instances',i);});
 snap=await f.step();
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.goldRaid.auction.itemId=991005;i.simulation.goldRaid.auction.limits={};await tx.put('instances',i);});
 const lotId=snap.state!.goldRaid.auction.id,extra={lotId,amount:10*GOLD,recipient:snap.state!.id,requestId:'same-winning-bid'};
 const before=snap.state!.money;
 snap=await f.command('goldBid',extra);assert.equal(snap.state!.money,before-10*GOLD);
 snap=await f.command('goldBid',extra);assert.equal(snap.state!.money,before-10*GOLD);
 for(let n=0;n<3;n++)snap=await f.command('goldAuctionStep',{lotId});
 assert.equal(snap.state!.pending.filter((i:Rules)=>i.id===991005).length,1);
 snap=await f.command('loot');assert.equal(snap.state!.bag.filter((i:Rules)=>i.id===991005).length,1);
 await f.store.transaction(async tx=>{const i:any=await tx.get('instances',snap.instanceId!);i.simulation.goldRaid.auction.itemId=991005;i.simulation.goldRaid.auction.limits={};await tx.put('instances',i);});
 const beforeSecond=snap.state!.money;
 snap=await f.command('goldBid',{lotId:snap.state!.goldRaid.auction.id,amount:10*GOLD,recipient:snap.state!.id});
 snap=await f.command('unstuck');assert.equal(snap.instanceId,null);assert.equal(snap.state!.goldRaid.active,false);
 assert.equal(snap.state!.money,beforeSecond+snap.state!.goldRaid.settlement.playerIncome);
 assert.equal(snap.state!.goldRaid.pot,10*GOLD);assert.equal(snap.state!.party.length,4);
});
