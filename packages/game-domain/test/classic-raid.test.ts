import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo,defaultRaidTactics} from '../src/molten-core-demo.ts';
import {enterGoldRaid,goldRaidAction,goldRaidView} from '../src/rules/gold-raid.js';
import {raidCompositionPresets,validateRaidComposition} from '../src/rules/raid-composition.js';
import {combatRole} from '../src/rules/combat-roles.js';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {raidCreatureStats,raidScaling} from '../src/rules/raid-scaling.js';
import {raidSpellValue} from '../src/rules/raid-spells.js';
import {combatTick} from '../src/rules/combat.js';
import {createRaidChallenge,challengeInputs} from '../../../scripts/support/raid-challenge.mjs';
import {canEquip} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';
const recruitment=()=>{const s=createMoltenCoreDemo().state;enterGoldRaid(s);goldRaidAction(s,{type:'goldPublish'});return s;};

test('40-person presets honor exact quotas, include the leader, and do not replace resident gear',()=>{
 const s=recruitment(),before=JSON.stringify(s.npcWorld.residents);
 for(const composition of Object.values(raidCompositionPresets)){
  goldRaidAction(s,{type:'goldRecommend',composition});const v:any=goldRaidView(s)!;
  assert.equal(v.selected.length,39);assert.equal(new Set(v.selected).size,39);
  assert.equal(v.roles.tank,composition.tanks);assert.equal(v.roles.healer,composition.healers);
  assert.equal(v.roles.damage,40-composition.tanks-composition.healers);
 }
 assert.equal(JSON.stringify(s.npcWorld.residents),before);
 goldRaidAction(s,{type:'goldLaunch'});assert.equal(s.party.length,39);
});

test('invalid quotas fail atomically, and zero-support/underfilled raids can launch with warnings',()=>{
 for(const composition of [{size:41,tanks:3,healers:8},{size:40,tanks:NaN,healers:8},{size:40,tanks:1.5,healers:8},{size:5,tanks:3,healers:3}])assert.throws(()=>validateRaidComposition(composition));
 const s=recruitment();goldRaidAction(s,{type:'goldRecommend',composition:{size:10,tanks:0,healers:0}});
 const selected=[...s.goldRaid.selected];assert.throws(()=>goldRaidAction(s,{type:'goldRecommend',composition:{size:40,tanks:0,healers:39}}),/不足/);assert.deepEqual(s.goldRaid.selected,selected);
 assert.ok(goldRaidView(s)!.recruitmentWarnings!.length>0);
 goldRaidAction(s,{type:'goldLaunch'});assert.equal(s.party.length,9);
 beginMoltenCoreBattle(s,'lucifron',defaultRaidTactics);assert.equal(s.combat.enemies[0].hp,351780);
});

test('eight Firesworn use unscaled stats and all extra tanks receive initial assignments',()=>{
 const s=createRaidChallenge({tanks:4,healers:10});beginMoltenCoreBattle(s,'garr',defaultRaidTactics);
 assert.equal(s.combat.enemies.length,9);
 assert.equal(new Set(s.combat.enemies.map((e:any)=>e.target)).size,4);
 for(const e of s.combat.enemies)assert.equal(e.hp,raidCreatureStats(e.entry).sourceHp);
 moltenCoreTick(s,[s,...s.party],()=>{});
 assert.equal(new Set(s.party.filter((c:any)=>combatRole(c)==='tank').map((c:any)=>c.raidTargetId)).size,4);
});

test('Ragnaros submerges after three minutes with eight sons and a 90-second phase',()=>{
 const s=createMoltenCoreDemo().state;beginMoltenCoreBattle(s,'ragnaros',defaultRaidTactics);
 s.clock=180000;moltenCoreTick(s,[s,...s.party],()=>{});
 assert.equal(s.combat.enemies.filter((e:any)=>e.entry===12143).length,8);assert.equal(s.combat.raidEncounter.emergeAt,270000);
 s.clock=269900;moltenCoreTick(s,[s,...s.party],()=>{});assert.equal(s.combat.raidEncounter.submerged,true);
 s.clock=270000;moltenCoreTick(s,[s,...s.party],()=>{});assert.equal(s.combat.raidEncounter.submerged,false);
});

test('original spell damage is independent of party size and timeout does not invent a boss enrage',()=>{
 const s=createMoltenCoreDemo().state;
 assert.equal(raidSpellValue(s,19702),2000);assert.equal(raidSpellValue(s,20476),3200);
 for(let i=0;i<30;i++){const n=raidSpellValue(s,18435);assert.ok(n>=3063&&n<=3937);}
 beginMoltenCoreBattle(s,'lucifron',defaultRaidTactics);s.clock=raidScaling.encounterLimitMs;const hp=[s,...s.party].map(c=>c.hp);
 combatTick(s);assert.equal(s.combat,null);assert.equal(s.lastCombat.raidEncounter.timedOut,true);assert.equal(s.lastCombat.abandoned,true);
 assert.deepEqual([s,...s.party].map(c=>c.hp),hp);
});

test('challenge equipment tiers use real legal items, exact rarity counts, and stable identities',()=>{
 for(const gear of ['dungeon','halfEpic','fullEpic']){
  const s=createRaidChallenge({gear});assert.equal(new Set([s,...s.party].map(c=>c.id)).size,40);
  for(const c of [s,...s.party]){
   const equipment=Object.values(c.equipment) as any[];for(const e of equipment)assert.ok(canEquip(c,items[e.id]));
   const epic=equipment.filter(e=>items[e.id].Quality===4).length;
   assert.equal(epic,gear==='dungeon'?0:gear==='halfEpic'?Math.floor(equipment.length/2):equipment.length);
   if(items[c.equipment[16]?.id]?.InventoryType===17)assert.equal(c.equipment[17],undefined);
   for(const e of equipment)if(items[e.id].maxcount>0)assert.ok(equipment.filter(i=>i.id===e.id).length<=items[e.id].maxcount);
  }
  assert.equal(challengeInputs(s).length,40);
 }
});
