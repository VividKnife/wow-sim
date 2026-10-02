import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../src/rules/engine.js';
import {startCombat,combatTick} from '../src/rules/combat.js';
import {items,spells,creatures,creatureLoot,referenceLoot} from '../src/rules/catalog.js';
import {bossMounts} from '../../game-data/mounts.js';
import {bagCapacity,makeItem} from '../src/rules/character.js';
import {collectLoot,queueCombatLoot} from '../src/rules/loot.js';
import {queueGroupLoot,resolveGroupLoot,groupLootView} from '../src/rules/group-loot.js';
import {worldSceneState} from '../../../apps/web/lib/world-scene.js';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {context,persistAssets} from '../src/context.ts';
import type {Rules,Character} from '../src/model.ts';

const reins=13335;
function bossDrop(){
 const s:Rules=createGame('男爵掉落验证',283,0);s.level=60;
 startCombat(s,[10440],true);
 // Exercise actual death settlement with a reproducible successful loot roll.
 // The production 1% table is unchanged; this is not a full boss-fight test.
 s.combat.enemies[0].hp=0;s.rngState=64;combatTick(s);
 assert.equal(s.combat,null);assert.ok(s.pending.some((i:Rules)=>i.id===reins));return s;
}
test('every currently imported creature mount drop has a collectible definition and model',()=>{
 const isMount=(id:number)=>!!items[id]?.mountId||[1,2,3,4,5].some(n=>[1,2,3].some(effect=>spells[items[id]?.['spellid_'+n]]?.['EffectApplyAuraName'+effect]===78));
 const walk=(rows:Rules[],seen=new Set<number>()):number[]=>rows.flatMap(r=>r.mincountOrRef<0&&!seen.has(-r.mincountOrRef)?walk(referenceLoot[-r.mincountOrRef]||[],new Set([...seen,-r.mincountOrRef])):r.mincountOrRef>0&&isMount(r.item)?[r.item]:[]);
 const dropped=new Set(Object.values(creatures).flatMap((c:Rules)=>walk(creatureLoot[c.LootId]||[])));
 assert.deepEqual([...dropped],[reins]);
 for(const id of dropped){const mount=bossMounts.find(m=>m.id===id);assert.ok(mount);assert.equal(worldSceneState({hp:100,mounted:id,activity:{type:'idle'}},{}).mountDisplayId,mount.displayId);}
 assert.equal(creatureLoot[10440].find((r:Rules)=>r.item===reins).ChanceOrQuestChance,1);
});
test('actual Baron loot survives a full bag, pickup and repeated learning protection, then rides outdoors',()=>{
 let s=bossDrop();const item=s.pending.find((i:Rules)=>i.id===reins);
 while(s.bag.length<bagCapacity(s))s.bag.push(makeItem(s,25));
 collectLoot(s,[item.uid]);assert.ok(s.pending.some((i:Rules)=>i.uid===item.uid));
 s.bag.pop();s=act(s,{type:'loot',uids:[item.uid]},s.wallAt);
 assert.ok(s.bag.some((i:Rules)=>i.uid===item.uid));assert.ok(!s.mounts.includes(reins));
 s=act(s,{type:'useItem',uid:item.uid},s.wallAt);assert.deepEqual(s.mounts,[reins]);assert.ok(!s.bag.some((i:Rules)=>i.uid===item.uid));
 assert.throws(()=>act({...s,level:59},{type:'mount',id:reins},s.wallAt),/60/);
 s=act(s,{type:'mount',id:reins},s.wallAt);s=advance(s,s.wallAt+3000).state;assert.equal(s.mounted,reins);
 assert.equal(worldSceneState(s,{}).mountDisplayId,10718);
 const restored=JSON.parse(JSON.stringify(s));assert.equal(restored.mounted,reins);assert.deepEqual(restored.mounts,[reins]);
});
test('epic mount rolls allow human need/greed, NPCs pass, and already collected mounts cannot be needed',()=>{
 const s:Rules=createGame('玩家',283,0),guest:Rules=createGame('队友',284,0),npc:Rules=createGame('NPC',285,0);
 guest.id='guest';npc.id='npc';npc.npcPlayer=true;s.party=[guest,npc];s.sharedParty=true;s.dungeon={id:'stratholme-undead'};
 queueCombatLoot(s,reins,1);const loot=s.groupLoot.pending[0];assert.ok(loot);assert.equal(s.pending.length,0);
 assert.equal(groupLootView(s).pending[0].members.find((m:Rules)=>m.id===npc.id).choice,'pass');assert.equal(groupLootView(s).pending[0].canNeed,true);loot.members.find((m:Rules)=>m.id===npc.id).roll=100;
 resolveGroupLoot(s,loot.id,'need');assert.equal(s.pending.length,0);
 resolveGroupLoot(s,loot.id,'greed',guest.id);assert.equal(s.pending[0].id,reins);assert.equal(guest.pending.length,0);
 assert.equal(s.groupLoot.history[0].votes.find((m:Rules)=>m.id===npc.id).choice,'pass');
 s.mounts=[reins];queueGroupLoot(s,reins,1);assert.equal(groupLootView(s).pending[0].canNeed,false);assert.equal(groupLootView(s).pending[0].canGreed,true);
 assert.throws(()=>resolveGroupLoot(s,s.groupLoot.pending[0].id,'need'),/需求条件/);
});
test('service persists boss pickup, item use and summon through a restart',async()=>{
 let now=1000000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:'boss-mount-test',now:()=>now});
 const save=await service.createSave('boss-mount-user',{name:'男爵坐骑验收',raceId:2,classId:1},'save');
 const state=(await service.snapshot(save.id)).state;
 await store.transaction(async tx=>{const c=(await tx.get<Character>('characters',state.id))!;const s=await context(tx,c,now);s.level=60;startCombat(s,[10440],true);s.combat.enemies[0].hp=0;s.rngState=64;combatTick(s);assert.ok(s.pending.some((i:Rules)=>i.id===reins));await persistAssets(tx,c,s,'boss-drop');c.rules.level=60;await tx.put('characters',c);});
 const dropped=(await service.snapshot(save.id)).state.pending.find((i:Rules)=>i.id===reins);assert.ok(dropped);
 const pickup={type:'loot',uids:[dropped.uid],requestId:'boss-pickup'};await service.command(save.id,pickup);await service.command(save.id,pickup);
 await service.command(save.id,{type:'useItem',uid:dropped.uid,requestId:'boss-learn'});
 await service.command(save.id,{type:'mount',id:reins,requestId:'boss-summon'});
 const restored=new GameService(store,{contentVersion:'boss-mount-test',now:()=>now});now+=4000;for(let tick=0;tick<3;tick++)assert.deepEqual((await restored.work()).errors,[]);
 const final=(await restored.snapshot(save.id)).state;assert.deepEqual(final.mounts,[reins]);assert.equal(final.mounted,reins);assert.ok(!final.bag.some((i:Rules)=>i.uid===dropped.uid));
});
