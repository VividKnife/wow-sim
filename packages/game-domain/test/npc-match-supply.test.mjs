import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {updateNpcPopulation,PUBLIC_NPC_LIMIT} from '../src/npc-population.ts';
import {combatRole} from '../src/rules/combat-roles.js';
const role=c=>['tank','healer'].includes(combatRole(c))?combatRole(c):'dps';
const wall=2000000000000;
function assertSupply(profiles,level){for(const [r,count]of Object.entries({tank:2,healer:2,dps:6}))assert.ok(profiles.filter(p=>p.unit.level>=Math.max(10,level-1)&&p.unit.level<=Math.min(60,level+3)&&role(p.unit)===r).length>=count);}
test('leveling demand redistributes public identities across 10–59, without replacing permanent max-level characters',async()=>{
 const store=new MemoryStore();let first;
 for(const [i,level] of [10,20,30,40,50,59].entries()){
  const profiles=await store.transaction(tx=>updateNpcPopulation(tx,wall+i*3600000,{level}));assertSupply(profiles,level);
  first??=profiles.map(p=>p.id);assert.deepEqual(profiles.map(p=>p.id),first);
  const copies=await store.transaction(tx=>updateNpcPopulation(tx,wall+i*3600000,{level}));assert.deepEqual(copies,profiles);
 }
 const max=await store.transaction(tx=>updateNpcPopulation(tx,wall+7*3600000,{level:60,minimumLevel:60}));assertSupply(max,60);const veterans=structuredClone(max.filter(p=>p.unit.level===60));
 const low=await store.transaction(tx=>updateNpcPopulation(tx,wall+8*3600000,{level:10}));assertSupply(low,10);
 for(const veteran of veterans)assert.deepEqual(low.find(p=>p.id===veteran.id),veteran);
 const items=await store.read(tx=>tx.list('items'));assert.equal(new Set(items.map(i=>i.id)).size,items.length);
});
test('reserved public NPCs do not count towards supply, including reservations by a different player',async()=>{
 const store=new MemoryStore();const initial=await store.transaction(tx=>updateNpcPopulation(tx,wall,{level:20}));
 const tanks=initial.filter(p=>role(p.unit)==='tank');await store.transaction(async tx=>{for(const p of tanks)await tx.put('social_members',{id:p.id,groupId:'other-team'});});
 const supplied=await store.transaction(tx=>updateNpcPopulation(tx,wall,{level:20}));assertSupply(supplied,20);assert.ok(tanks.every(p=>!supplied.some(s=>s.id===p.id)));
});
test('a full public population fails atomically instead of issuing a partial role batch',async()=>{
 const store=new MemoryStore();await store.transaction(async tx=>{for(let i=0;i<PUBLIC_NPC_LIMIT;i++){
  const id=`npc:realm:${i+1}`;await tx.put('npc_characters',{id,accountId:null,realm:'public',profile:{index:i},rules:{}});await tx.put('simulation_characters',{id,accountId:null,instanceId:'busy'});
 }});
 await assert.rejects(store.transaction(tx=>updateNpcPopulation(tx,wall,{level:20})),/繁忙/);
 assert.equal(await store.read(tx=>tx.get('npc_population','public')),null);
 assert.equal((await store.read(tx=>tx.list('npc_characters'))).length,PUBLIC_NPC_LIMIT);
});
