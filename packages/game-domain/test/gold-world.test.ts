import {loadNpcResident,persistNpcResident} from '../src/npc-characters.ts';
import {SocialService} from '../src/social.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {act,advance,view} from '../src/rules/engine.js';
import {enterGoldRaid,goldRaidAction,goldAuctionStep,finishGoldRun,leaveGoldRaid,emergencyGoldExit,goldRaidView} from '../src/rules/gold-raid.js';
import {strategyAllows} from '../src/rules/combat-strategy.js';
import {combatRole} from '../src/rules/combat-roles.js';
import {ensureNpcWorld} from '../src/rules/npc-world.js';
import {GOLD,npcPriceLimit,goldNpcView,createGoldApplicants} from '../src/rules/gold-raid-npcs.js';
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

test('raid-ready creates a single hero, while the finder supplies independent public assets',async()=>{
 const service=new GameService(new MemoryStore(),{contentVersion:'test',now:()=>100000,seed:()=>42});
 const save=await service.createSave('unified',{name:'团长',classId:8,raceId:1,raidReady:true},'save');
 const snapshot=await service.snapshot(save.id);assert.equal(snapshot.roster.length,1);assert.equal(snapshot.state.npcWorld,undefined);
 assert.equal((await service.store.read(tx=>tx.list('npc_characters'))).length,0);
 await new SocialService(service.store,()=>100000).supply(save.id,snapshot.state.id);
 const npcs=await service.store.read(tx=>tx.list('npc_characters'));assert.equal(npcs.length,10);assert.ok(npcs.every(n=>n.accountId===null&&n.realm==='public'));
 assert.equal((await service.snapshot(save.id)).state.npcWorld,undefined);
});

test('gold recruitment presentation uses the inviting player friendship snapshot',()=>{
 const s=fixture(false),friendId=s.goldRaid.applicants[0].id;
 s.npcFriendIds=[friendId];
 const applicants=createGoldApplicants(s);
 assert.equal(goldNpcView(applicants.find((c:Rules)=>c.id===friendId)).friend,true);
 assert.equal(goldNpcView(applicants.find((c:Rules)=>c.id!==friendId)).friend,false);
});

test('all recruitment preferences select unique persistent residents with complete roles and mechanism coverage',()=>{
 const s=fixture(false),original=structuredClone(s.npcWorld.residents),friend=s.goldRaid.applicants.find((c:Rules)=>combatRole(c)==='ranged'&&c.goldProfile.skill==='regular');
 friend.goldProfile.friend=true;
 for(const priority of ['balanced','progress','buyers','friends']){
  goldRaidAction(s,{type:'goldRecommend',priority});const selected=s.goldRaid.selected.map((id:string)=>s.goldRaid.applicants.find((c:Rules)=>c.id===id));
  assert.equal(new Set(selected.map((c:Rules)=>c.id)).size,39);
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
 s.goldRaid.auctions=[{id:'persistent-loot',bossId:'lucifron',itemId:16800,count:1,leader:null,price:0,playerLimit:null,opening:10*GOLD,step:5*GOLD,quiet:0,round:0,limits:{[id]:10*GOLD},bids:[]}];
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
 npc.money-=10*GOLD;s.goldRaid.auctions=[{leader:id,price:10*GOLD}];
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
 for(let n=0;n<500&&s.goldRaid.auctions[0];n++)goldAuctionStep(s);finishGoldRun(s);leaveGoldRaid(s);
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


test('emergency settlement preserves public NPC escrow, dividends and equipment across asset reloads',async()=>{
 const store=new MemoryStore(),s=fixture();eligible(s);const npc=s.party[0],id=npc.id,wallet=npc.money;
 npc.money-=10*GOLD;npc.raidPendingEquipment=[{id:19147,uid:'paid-npc-ring',count:1,durability:0}];
 s.goldRaid.auctions=[{leader:id,price:10*GOLD}];s.goldRaid.pot=100*GOLD;
 emergencyGoldExit(s);const profile=s.npcWorld.residents.find((p:Rules)=>p.id===id);
 await store.transaction(tx=>persistNpcResident(tx,profile,'emergency-settlement'));
 const restored=await store.read(async tx=>loadNpcResident(tx,(await tx.get<any>('npc_characters',id))!));
 const payout=s.goldRaid.settlement.rows.find((r:Rules)=>r.id===id).total;
 assert.equal(restored.wallet,wallet+payout);assert.ok([...Object.values(restored.unit.equipment),...restored.unit.raidCollection].some((item:any)=>item.uid==='paid-npc-ring'));
 const ledger=await store.read(tx=>tx.list('ledger'));emergencyGoldExit(s);
 await store.transaction(tx=>persistNpcResident(tx,profile,'emergency-retry'));assert.deepEqual(await store.read(tx=>tx.list('ledger')),ledger);
});

test('NPC bids honor unique ownership including collections and pending combat purchases',()=>{
 const s=fixture(),npc=s.party.find((c:Rules)=>c.classId===8),item=items[18820];
 assert.equal(item.maxcount,1);npc.equipment={};npc.money=1000*GOLD;
 assert.ok(npcPriceLimit(npc,item,false,s)>0);
 npc.raidCollection=[{id:item.entry,count:1}];assert.equal(npcPriceLimit(npc,item,false,s),0);
 npc.raidCollection=[];npc.raidPendingEquipment=[{id:item.entry,count:1}];assert.equal(npcPriceLimit(npc,item,false,s),0);
});
