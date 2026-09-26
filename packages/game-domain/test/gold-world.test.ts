import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {act,advance,view} from '../src/rules/engine.js';
import {enterGoldRaid,goldRaidAction,goldAuctionStep,finishGoldRun,leaveGoldRaid,emergencyGoldExit,goldRaidView} from '../src/rules/gold-raid.js';
import {strategyAllows} from '../src/rules/combat-strategy.js';
import {combatRole} from '../src/rules/combat-roles.js';
import {ensureNpcWorld} from '../src/rules/npc-world.js';
import {GOLD,npcPriceLimit} from '../src/rules/gold-raid-npcs.js';
import {items} from '../src/rules/catalog.js';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Rules} from '../src/model.ts';

function fixture(launch=true){
 const s=createMoltenCoreDemo().state;s.party=[];enterGoldRaid(s);
 goldRaidAction(s,{type:'goldPublish'});
 if(launch){goldRaidAction(s,{type:'goldRecommend'});goldRaidAction(s,{type:'goldLaunch'});}
 return s;
}
function eligible(s:Rules){for(const seat of s.goldRaid.seats)s.goldRaid.contributions[seat.id]={damage:100,healing:100,seconds:10,kills:1};}

test('only NPC grouping and gold raids remain exposed; raid-ready owns a single hero',async()=>{
 const service=new GameService(new MemoryStore(),{contentVersion:'test',now:()=>100000,seed:()=>42});
 const save=await service.createSave('unified',{name:'团长',classId:8,raceId:1,raidReady:true},'save');
 const snapshot=await service.snapshot(save.id);assert.equal(snapshot.roster.length,1);assert.equal(snapshot.state!.npcWorld.residents.length,50);
 assert.ok(!('candidates' in view(snapshot.state)));assert.ok(!('guildRaid' in view(snapshot.state)));
 for(const type of ['recruit','createCompanion','hireMercenary','raidStart'])await assert.rejects(service.command(save.id,{type,id:'mage',classId:8,requestId:type}),/尚未支持/);
 await service.command(save.id,{type:'enterDungeon',contentId:'molten-core-gold',requestId:'enter'});
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])await service.command(save.id,{type,requestId:type});
 const launched=await service.snapshot(save.id);assert.equal(launched.instance!.roster.length,25);assert.equal(launched.instance!.roster.filter(r=>r.controller==='npc').length,24);
 await service.command(save.id,{type:'goldSettle',requestId:'settle'});await service.command(save.id,{type:'leaveInstance',requestId:'leave'});
 for(const contentId of ['molten-core','onyxias-lair'])await assert.rejects(service.command(save.id,{type:'enterDungeon',contentId,requestId:contentId}),/未知的副本/);
});

test('all recruitment preferences select unique persistent residents with complete roles and mechanism coverage',()=>{
 const s=fixture(false),original=structuredClone(s.npcWorld.residents),friend=s.goldRaid.applicants.find((c:Rules)=>combatRole(c)==='ranged'&&c.goldProfile.skill==='regular');
 friend.goldProfile.friend=true;
 for(const priority of ['balanced','progress','buyers','friends']){
  goldRaidAction(s,{type:'goldRecommend',priority});const selected=s.goldRaid.selected.map((id:string)=>s.goldRaid.applicants.find((c:Rules)=>c.id===id));
  assert.equal(new Set(selected.map((c:Rules)=>c.id)).size,24);
  assert.ok(selected.every((c:Rules)=>s.npcWorld.residents.some((p:Rules)=>p.id===c.id&&p.unit.name===c.name)));
  assert.ok(selected.filter((c:Rules)=>combatRole(c)==='tank').length>=2);assert.ok(selected.filter((c:Rules)=>combatRole(c)==='healer').length>=5);
  for(const classId of [3,5])assert.ok(selected.some((c:Rules)=>c.classId===classId));
  if(priority==='friends')assert.ok(s.goldRaid.selected.includes(friend.id));
 }
 assert.deepEqual(s.npcWorld.residents,original);
 assert.throws(()=>goldRaidAction(s,{type:'goldRefresh'}),/未知/);
});

test('NPC purchase and personal dividend survive settlement, JSON reload, and a new raid',()=>{
 let s=fixture();const npc=s.party.find((c:Rules)=>c.classId===8),id=npc.id,original=npc.money;
 npc.equipment={};
 s.goldRaid.auction={id:'persistent-loot',bossId:'lucifron',itemId:16800,count:1,leader:null,price:0,opening:10*GOLD,step:5*GOLD,quiet:0,round:0,limits:{[id]:10*GOLD},bids:[]};
 goldAuctionStep(s);assert.equal(npc.money,original-10*GOLD);
 for(let n=0;n<3;n++)goldAuctionStep(s);assert.equal(npc.equipment[8].id,16800);
 eligible(s);const playerBefore=s.money;finishGoldRun(s);
 const own=s.goldRaid.settlement.rows.find((r:Rules)=>r.id===s.id),npcShare=s.goldRaid.settlement.rows.find((r:Rules)=>r.id===id).total;
 assert.equal(s.money-playerBefore,own.total+s.goldRaid.settlement.fee);
 assert.equal(npc.money,original-10*GOLD+npcShare);assert.equal(s.npcWorld.residents.find((p:Rules)=>p.id===id).raidRuns,1);
 leaveGoldRaid(s);s=JSON.parse(JSON.stringify(s));enterGoldRaid(s);goldRaidAction(s,{type:'goldPublish'});
 const returning=s.goldRaid.applicants.find((c:Rules)=>c.id===id);assert.equal(returning.money,original-10*GOLD+npcShare);assert.equal(returning.equipment[8].id,16800);
 assert.equal(s.party.length,0);
});

test('emergency exit refunds NPC escrow and applies already-paid combat purchases once',()=>{
 const s=fixture(),npc=s.party.find((c:Rules)=>c.classId===8),before=npc.money,id=npc.id;
 npc.equipment={};npc.raidPendingEquipment=[{id:16800,uid:'paid-boots',count:1}];
 npc.money-=10*GOLD;s.goldRaid.auction={leader:id,price:10*GOLD};
 emergencyGoldExit(s);const resident=s.npcWorld.residents.find((p:Rules)=>p.id===id);
 assert.equal(resident.wallet,before);assert.equal(resident.unit.equipment[8].uid,'paid-boots');assert.equal(s.party.length,0);
 const saved=JSON.stringify(s.npcWorld);emergencyGoldExit(s);assert.equal(JSON.stringify(s.npcWorld),saved);
});

test('abort without a kill does not train raid experience or mint NPC money',()=>{
 const s=fixture(),before=new Map(s.party.map((c:Rules)=>[c.id,c.money]));finishGoldRun(s);leaveGoldRaid(s);
 for(const p of s.npcWorld.residents.filter((p:Rules)=>before.has(p.id))){assert.equal(p.raidRuns,0);assert.equal(p.wallet,before.get(p.id));assert.equal(p.runs,1);}
});

test('partial weekly progress persists across disbanding, and each raid has its own reset',()=>{
 let s=fixture();goldRaidAction(s,{type:'goldNavigate',destination:'lucifron'});s.combat.enemies.forEach((e:Rules)=>e.hp=0);goldRaidAction(s,{type:'goldPause'});s=advance(s,s.wallAt+100).state;
 for(let n=0;n<500&&s.goldRaid.auction;n++)goldAuctionStep(s);finishGoldRun(s);leaveGoldRaid(s);
 s=JSON.parse(JSON.stringify(s));enterGoldRaid(s);assert.ok(s.goldRaid.clearedPacks.includes('mc-gate'));finishGoldRun(s);leaveGoldRaid(s);
 enterGoldRaid(s,'onyxias-lair');assert.deepEqual(s.goldRaid.clearedPacks,[]);finishGoldRun(s);leaveGoldRaid(s);
 s.wallAt+=604800000;enterGoldRaid(s);assert.deepEqual(s.goldRaid.clearedPacks,[]);
});

test('raid damage waits for a living assigned tank, including the off-tank',()=>{
 const s=fixture(),tanks=s.party.filter((c:Rules)=>combatRole(c)==='tank'),caster=s.party.find((c:Rules)=>c.classId===8);
 goldRaidAction(s,{type:'goldNavigate',destination:'lucifron'});s.clock+=5000;
 const enemy=s.combat.enemies[0];enemy.target=tanks[1].id;enemy.threat={[tanks[1].id]:1000};
 assert.equal(strategyAllows(s,caster,enemy,{Id:0,SpellName:'Attack'}),true);
 enemy.target=s.id;enemy.threat={[s.id]:1000};assert.equal(strategyAllows(s,caster,enemy,{Id:0,SpellName:'Attack'}),false);
});


test('service emergency exit settles committed NPC escrow, dividends and purchases after restart',async()=>{
 const store=new MemoryStore(),options={contentVersion:'test',now:()=>100000,seed:()=>42};let service=new GameService(store,options);
 const save=await service.createSave('escape',{name:'撤离团长',classId:8,raceId:1,raidReady:true},'save');
 await service.command(save.id,{type:'enterDungeon',contentId:'molten-core-gold',requestId:'enter'});
 for(const type of ['goldPublish','goldRecommend','goldLaunch'])await service.command(save.id,{type,requestId:type});
 const started=await service.snapshot(save.id);let npcId='',wallet=0;
 await store.transaction(async tx=>{
  const instance:any=await tx.get('instances',started.instanceId!),s=instance.simulation;eligible(s);
  const npc=s.party[0];npcId=npc.id;wallet=npc.money;npc.money-=10*GOLD;
  npc.raidPendingEquipment=[{id:19147,uid:'paid-npc-ring',count:1,durability:0}];
  s.goldRaid.auction={leader:npc.id,price:10*GOLD};s.goldRaid.pot=100*GOLD;
  await service.persistInstance(tx,instance,100000,'committed-escape');
 });
 service=new GameService(store,options);
 const escaped=await service.command(save.id,{type:'unstuck',requestId:'escape'}),s=escaped.state;
 const resident=s.npcWorld.residents.find((p:Rules)=>p.id===npcId),payout=s.goldRaid.settlement.rows.find((r:Rules)=>r.id===npcId).total;
 assert.equal(resident.wallet,wallet+payout);
 assert.ok([...Object.values(resident.unit.equipment),...(resident.unit.raidCollection||[])].some((item:any)=>item.uid==='paid-npc-ring'));
 assert.equal(s.party.length,0);assert.equal(escaped.instanceId,null);
 const repeat=await service.command(save.id,{type:'unstuck',requestId:'escape'});assert.deepEqual(repeat.state.npcWorld,s.npcWorld);
});


test('NPC bids honor unique ownership including collections and pending combat purchases',()=>{
 const s=fixture(),npc=s.party.find((c:Rules)=>c.classId===8),item=items[18820];
 assert.equal(item.maxcount,1);npc.equipment={};npc.money=1000*GOLD;
 assert.ok(npcPriceLimit(npc,item,false,s)>0);
 npc.raidCollection=[{id:item.entry,count:1}];assert.equal(npcPriceLimit(npc,item,false,s),0);
 npc.raidCollection=[];npc.raidPendingEquipment=[{id:item.entry,count:1}];assert.equal(npcPriceLimit(npc,item,false,s),0);
});
