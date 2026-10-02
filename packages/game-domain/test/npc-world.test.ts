import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {createGame,act,view,advance} from '../src/rules/engine.js';
import {stats} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';
import {equipmentUpgrade} from '../src/rules/npc-equipment.js';
import {queueGroupLoot,resolveGroupLoot,groupLootView,tickGroupLoot} from '../src/rules/group-loot.js';
import {queueCombatLoot} from '../src/rules/loot.js';
import {ensureNpcWorld,syncNpcWorld} from '../src/rules/npc-world.js';
import {projectClientSnapshot} from '../src/rules/client-snapshot.ts';
import type {Rules} from '../src/model.ts';

function world(){let s:Rules=createGame('旅人',1729,0);s.level=24;s.location='deadmines';const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;ensureNpcWorld(s);return s;}
test('level-60 damage warriors and rogues start with two usable weapons while tanks keep shields',()=>{
 let s:Rules=createGame('旅人',1729,0);s.level=60;ensureNpcWorld(s);
 const fighters=s.npcWorld.residents.map((p:Rules)=>p.unit).filter((c:Rules)=>[1,4].includes(c.classId));
 for(const c of fighters){
  assert.ok(c.equipment[16],c.name);
  if(c.classId===1&&c.strategyPolicy.role==='tank')assert.equal(items[c.equipment[17]?.id]?.InventoryType,14,c.name);
  else {assert.equal(items[c.equipment[17]?.id]?.class,2,c.name);assert.ok(c.learned.includes(674),c.name);assert.notEqual(items[c.equipment[16].id].InventoryType,17,c.name);}
 }
});
function run(){let s=world();s.npcWorld.selection=[0,4,2,3].map(i=>s.npcWorld.residents[i].id);return act(s,{type:'enterDungeon',contentId:'deadmines'},0);}
test('loot is awarded once; upgrades persist and no longer qualify as need; hidden rolls are not projected',()=>{
 const s=run(),rogue=s.party.find((c:Rules)=>c.classId===4);rogue.equipment={};
 assert.ok(equipmentUpgrade(rogue,items[5191]).need);queueGroupLoot(s,5191,1);
 const loot=s.groupLoot.pending[0];for(const m of loot.members)m.roll=m.id===rogue.id?100:1;
 assert.ok(!Object.hasOwn(groupLootView(s).pending[0].members[0],'roll'));
 resolveGroupLoot(s,loot.id,'pass');assert.equal(rogue.equipment[16].id,5191);assert.equal(s.pending.length,0);
 assert.equal(s.npcWorld.residents.find((p:Rules)=>p.id===rogue.id).unit.equipment[16].id,5191);
 // A sword can still improve a second weapon slot. Fill both before checking duplicates.
 if(rogue.learned.includes(674))rogue.equipment[17]={...rogue.equipment[16],uid:'second-sword'};
 assert.equal(equipmentUpgrade(rogue,items[5191]).need,false);
 assert.throws(()=>resolveGroupLoot(s,loot.id,'pass'),/已经分配/);
 const projected=projectClientSnapshot(s,view(s));assert.equal((projected.view as any).groupLoot.history.length,1);assert.ok(!(projected.player as any).npcWorld);
});

test('a lone human has no roll timeout, automatic policy resolves safely, quest drops keep old routing',()=>{
 const s=run();assert.equal(queueGroupLoot(s,5397,1),false);queueGroupLoot(s,5191,1);s.clock=100000;s.combat={id:'battle',dungeon:true};tickGroupLoot(s);assert.equal(s.groupLoot.pending[0].deadline,null);
 s.combat=null;tickGroupLoot(s);assert.equal(s.groupLoot.pending[0].deadline,null);s.clock=99999999;tickGroupLoot(s);assert.equal(s.groupLoot.pending.length,1);resolveGroupLoot(s,s.groupLoot.pending[0].id,'pass');
 queueGroupLoot(s,5191,1);s.npcWorld.autoLoot=true;tickGroupLoot(s);assert.equal(s.groupLoot.pending.length,0);
});

test('actual NPC dungeon combat advances using existing combat engine',()=>{
 let s=run();s.settings.autoLoot=true;s.npcWorld.autoLoot=true;s=act(s,{type:'dungeonNext'},0);
 const next=advance(s,20000,{maxTicks:1000});assert.ok(next.complete);assert.ok(next.state.logs.some((l:Rules)=>l.kind==='damage'||l.kind==='incoming'));syncNpcWorld(next.state);
 assert.equal(next.state.party.length,4);
});

test('unique-item eligibility and simultaneous duplicate drops cannot bypass the ownership limit',()=>{
 const s=run(),unique=Object.values(items).find((i:any)=>i.maxcount===1&&i.Quality>=2&&[2,4].includes(i.class)&&i.InventoryType&&!i.startquest&&i.bonding!==4) as any;
 assert.ok(unique);s.pending.push({id:unique.entry,uid:'owned-unique',count:1});queueGroupLoot(s,unique.entry,1);const l=s.groupLoot.pending[0];assert.equal(l.members[0].eligible,false);assert.equal(groupLootView(s).pending[0].canGreed,false);assert.throws(()=>resolveGroupLoot(s,l.id,'greed'),/唯一/);resolveGroupLoot(s,l.id,'pass');
 assert.equal(s.pending.filter((i:Rules)=>i.id===unique.entry).length,1);
});

test('automatic group rolls do not disarm dungeon auto advance between encounters',()=>{
 let s=run();s.settings.autoLoot=true;s.npcWorld.autoLoot=true;s=act(s,{type:'dungeonNext'},0);
 // Existing combat must end before a queued roll can change equipment.
 s.combat=null;s.activity={type:'idle'};queueGroupLoot(s,5191,1);
 const result=advance(s,100).state;assert.equal(result.groupLoot.pending.length,0);assert.equal(result.dungeon.autoAdvance,true);
});

test('ordinary dungeon loot rotates through NPC seats and credits the entire stack value without opening rolls',()=>{
 const s=run(),npc=s.party[0],profile=s.npcWorld.residents.find((p:Rules)=>p.id===npc.id),wallet=profile.wallet;
 s.combat={id:'ordinary-loot',dungeon:true};
 queueCombatLoot(s,2770,3);queueCombatLoot(s,2770,3);
 assert.equal(s.pending.find((i:Rules)=>i.id===2770).count,3);
 assert.equal(profile.wallet,wallet+items[2770].SellPrice*3);
 assert.equal(s.groupLoot?.pending.length||0,0);
});
