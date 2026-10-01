import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {ensureNpcMatchSupply,NPC_MATCH_SUPPLY} from '../src/rules/npc-world.js';
import {combatRole} from '../src/rules/combat-roles.js';
const role=c=>['tank','healer'].includes(combatRole(c))?combatRole(c):'dps';
function assertSupply(s){assert.ok(Array.from({length:6},(_,i)=>s.level-5+i).some(lower=>Object.entries(NPC_MATCH_SUPPLY.target).every(([r,count])=>s.npcWorld.residents.filter(p=>p.unit.level>=lower&&p.unit.level<=lower+5&&role(p.unit)===r).length>=count)),`level ${s.level} has a complete compatible standby pool`);}
test('every dungeon level 10–60 retains role supply without rerolling existing identities or combat RNG',()=>{
 const s=createGame('供给覆盖',791,0);s.level=10;ensureNpcMatchSupply(s);assert.equal(s.npcWorld.residents.length,10);const original=s.npcWorld.residents.map(p=>({id:p.id,unit:structuredClone(p.unit),wallet:p.wallet}));const rng=s.rngState;
 for(let level=10;level<=60;level++){s.level=level;ensureNpcMatchSupply(s);assertSupply(s);const count=s.npcWorld.residents.length;ensureNpcMatchSupply(s);assert.equal(s.npcWorld.residents.length,count,'retries do not create more NPCs');}
 assert.equal(s.rngState,rng);assert.ok(s.npcWorld.residents.length<=192);
 for(const before of original){const after=s.npcWorld.residents.find(p=>p.id===before.id);assert.deepEqual(after.unit,before.unit);assert.equal(after.wallet,before.wallet);}
 assert.equal(new Set(s.npcWorld.residents.map(p=>p.id)).size,s.npcWorld.residents.length);
 const restored=structuredClone(s);ensureNpcMatchSupply(restored);assert.deepEqual(restored,s);
});
test('fresh demand at 10, 20, 30, 40, 50 and 60 has real class builds and per-item identities',()=>{
 for(const level of [10,20,30,40,50,60]){const s=createGame('等级'+level,level,0);s.level=level;ensureNpcMatchSupply(s);assertSupply(s);
  const items=s.npcWorld.residents.flatMap(p=>Object.values(p.unit.equipment).map(i=>i.uid));assert.equal(new Set(items).size,items.length);
  for(const p of s.npcWorld.residents)assert.equal(p.unit.npcBuild.role,combatRole(p.unit));
 }
});
test('finder supply grows into a raid roster without replacing candidates or colliding item identities',async()=>{
 const {ensureNpcWorld,npcAction,NPC_REFRESH_MS}=await import('../src/rules/npc-world.js');
 const s=createGame('名册扩容',613,0);s.level=60;ensureNpcMatchSupply(s);const before=structuredClone(s.npcWorld.residents);
 s.wallAt+=NPC_REFRESH_MS;npcAction(s,{type:'npcRefresh'});assert.equal(s.npcWorld.board.ids.length,6);
 ensureNpcWorld(s);assert.ok(s.npcWorld.residents.length>=72);assert.ok(s.npcWorld.residents.length<=192);
 for(const member of before)assert.ok(s.npcWorld.residents.some(p=>p.id===member.id));
 assert.equal(new Set(s.npcWorld.residents.map(p=>p.id)).size,s.npcWorld.residents.length);
});
test('mixed-level party requests replenish the common interval rather than counting unusable lower-level NPCs',()=>{
 const s=createGame('混级队伍',901,0);s.level=10;ensureNpcMatchSupply(s);const ids=s.npcWorld.residents.map(p=>p.id);s.level=15;
 ensureNpcMatchSupply(s,15,20);
 for(const [r,count] of Object.entries(NPC_MATCH_SUPPLY.target))assert.ok(s.npcWorld.residents.filter(p=>p.unit.level>=15&&p.unit.level<=20&&role(p.unit)===r).length>=count);
 assert.ok(ids.every(id=>s.npcWorld.residents.some(p=>p.id===id&&p.unit.level===10)));
 assert.throws(()=>ensureNpcMatchSupply(s,30,60),/范围/);
});
test('NPCs reserved by another social party do not count towards standby supply',()=>{
 const s=createGame('预留补位',207,0);s.level=20;ensureNpcMatchSupply(s);const unavailable=s.npcWorld.residents.filter(p=>role(p.unit)==='tank').map(p=>p.id);
 ensureNpcMatchSupply(s,15,25,unavailable);assert.equal(s.npcWorld.residents.filter(p=>role(p.unit)==='tank'&&!unavailable.includes(p.id)).length,2);
 assert.ok(unavailable.every(id=>s.npcWorld.residents.some(p=>p.id===id)));
});
test('role totals split across incompatible levels replenish only the cheapest complete standby window',()=>{
 const s=createGame('跨级缺口',302,0);s.level=20;ensureNpcMatchSupply(s);
 for(const p of s.npcWorld.residents)p.unit.level=role(p.unit)==='tank'?15:25;
 const before=structuredClone(s.npcWorld.residents);ensureNpcMatchSupply(s);
 assertSupply(s);assert.equal(s.npcWorld.residents.length,12,'two tanks complete the upper window; no unnecessary healer or DPS generation');
 assert.deepEqual(s.npcWorld.residents.slice(0,10),before);assert.ok(s.npcWorld.residents.slice(10).every(p=>p.unit.level===20&&role(p.unit)==='tank'));
});
test('dungeon minimum excludes otherwise nearby candidates',()=>{
 const s=createGame('副本门槛',402,0);s.level=15;ensureNpcMatchSupply(s);s.level=20;
 ensureNpcMatchSupply(s,20,25);assertSupply(s);
 for(const [r,count] of Object.entries(NPC_MATCH_SUPPLY.target))assert.equal(s.npcWorld.residents.filter(p=>p.unit.level>=20&&role(p.unit)===r).length,count);
});
test('capacity exhaustion cannot create a partial batch, reroll identities, or remove earned assets',()=>{
 const s=createGame('供给上限',502,0);s.level=20;ensureNpcMatchSupply(s);
 // Fill the remaining cold roster budget with unavailable identities, leaving
 // one slot although restoring the two missing tanks requires two.
 const template=s.npcWorld.residents[0];
 while(s.npcWorld.residents.length<119){const p=structuredClone(template);p.index=10000+s.npcWorld.residents.length;p.id=`cold:${p.index}`;p.unit.id=p.id;p.unit.hp=0;s.npcWorld.residents.push(p);}
 const busy=s.npcWorld.residents.filter(p=>p.unit.hp>0&&role(p.unit)==='tank').map(p=>p.id),before=structuredClone(s);
 assert.throws(()=>ensureNpcMatchSupply(s,15,25,busy),/候选池已满/);assert.deepEqual(s,before);
});
