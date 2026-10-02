import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {ensureNpcWorld,syncNpcWorld} from '../src/rules/npc-world.js';
import {trainNpcProfessions,npcIncome,buyNpcLuxury} from '../src/rules/npc-economy.js';
import {items} from '../src/rules/catalog.js';
import {marketOffer} from '../src/rules/market.js';
import {rebaseSimulation} from '../src/simulation-clock.ts';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {persistNpcResident,loadNpcResident} from '../src/npc-characters.ts';
import type {Rules} from '../src/model.ts';
const minute=60000;
function resident(level=60){const s:Rules=createGame('经济验证',714,0);s.id='economy-owner';s.level=level;ensureNpcWorld(s,4);const p=s.npcWorld.residents[3];s.npcWorld.residents=[p];return {s,p};}

test('profession training follows level/rank caps and battle levels persist trained professions',()=>{
 const {s,p}=resident(10);const low=structuredClone(p.unit.professions);
 assert.equal(Object.keys(low).length,5);assert.ok(Object.values(low).every((v:any)=>v.skill===50&&v.skill<=v.cap));
 p.unit.level=60;trainNpcProfessions(p.unit,p.index);assert.ok(Object.values(p.unit.professions).every((v:any)=>v.skill===300&&v.cap===300));
 const c=structuredClone(p.unit);c.level=60;c.professions=low;s.party=[c];syncNpcWorld(s);
 assert.ok(Object.values(p.unit.professions).every((v:any)=>v.skill===300));
});
test('professional net income scales by skill and expertise; wealth is an additional recurring source',()=>{
 const {p}=resident();p.raidProfile.personality='saver';p.raidProfile.skill='regular';
 const ordinary=npcIncome(p,3600000);assert.equal(ordinary.profession,78000);assert.equal(ordinary.wealth,0);
 p.raidProfile.skill='expert';assert.equal(npcIncome(p,3600000).profession,156000);
 p.raidProfile.personality='whale';const first=npcIncome(p,3600000),second=npcIncome(p,3600000);
 assert.equal(first.wealth,1500000);assert.deepEqual(first,second);
 const low=resident(10);low.p.raidProfile.personality='saver';assert.ok(npcIncome(low.p,3600000).profession<first.profession);
});
test('luxury shopping charges the real quote, reserves stock, binds usable gear and respects budget',()=>{
 const {p}=resident();p.unit.equipment={};const before=p.wallet;
 assert.ok(buyNpcLuxury(p,20*minute));const item:any=Object.values(p.unit.equipment)[0],offer=marketOffer(item.id)!;
 assert.equal(items[item.id].bonding,2);assert.ok(items[item.id].Quality>=3);assert.equal(p.wallet,before-offer.buy);
 assert.equal(item.ownerId,p.id);assert.equal(item.bound,true);assert.equal(p.economy.stock[item.id].purchased,1);
 assert.equal(p.economy.shopping,offer.buy);
 p.wallet=0;const saved=structuredClone(p);assert.equal(buyNpcLuxury(p,40*minute),null);assert.deepEqual(p,saved);
 p.wallet=before;p.raidProfile.personality='saver';assert.equal(buyNpcLuxury(p,40*minute),null);
});
test('background earnings, stock and purchased assets survive independent NPC row persistence',async()=>{
 const {s,p}=resident(),store=new MemoryStore(),owner={id:s.id,accountId:'account',rules:{}};
 p.unit.equipment={};npcIncome(p,3600000);assert.ok(buyNpcLuxury(p,3600000));
 await store.transaction(tx=>persistNpcResident(tx,p,'economy-save'));
 const restored=await store.read(async tx=>loadNpcResident(tx,(await tx.get<any>('npc_characters',p.id))!));
 assert.equal(restored.wallet,p.wallet);assert.deepEqual(restored.economy,p.economy);
 assert.deepEqual(restored.unit.professions,p.unit.professions);assert.deepEqual(restored.unit.equipment,p.unit.equipment);
 assert.deepEqual(restored.economy.stock,p.economy.stock);
});

test('background market deadlines remain on wall time when transferring to a different simulation clock',()=>{
 const {s,p}=resident();p.unit.equipment={};assert.ok(buyNpcLuxury(p,20*minute));
 const stock=structuredClone(p.economy.stock);rebaseSimulation(s,900000);
 assert.deepEqual(p.economy.stock,stock);
});

test('public five-man actors spend their own wallet and checkpoint consumption without a human owner',()=>{
 const {s,p}=resident();const c=structuredClone(p.unit);c.money=p.wallet;
 delete s.npcWorld;s.npcGuests=[{profile:p}];s.party=[c];const before=p.wallet;
 c.money-=10000;syncNpcWorld(s);assert.equal(p.wallet,before-10000);
});
