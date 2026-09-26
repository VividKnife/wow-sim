import {raidLoot} from '../src/rules/raid-rewards.js';
import {restoreRaidMember} from '../src/rules/raid-recovery.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {advance,act} from '../src/rules/engine.js';
import {enterGoldRaid,goldRaidAction,goldRaidView,settleGoldRaid,goldAuctionStep,finishGoldRun,leaveGoldRaid} from '../src/rules/gold-raid.js';
import {moltenCoreBosses,moltenCoreRoute,moltenCoreMap,moltenCorePath} from '../src/rules/molten-core-content.js';
import {items} from '../src/rules/catalog.js';
import type {Rules} from '../src/model.ts';

function fixture(){const s=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';enterGoldRaid(s);for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(s,{type});return s;}
function forceVictory(s:Rules){s.combat.enemies.forEach((e:Rules)=>e.hp=0);return advance(s,s.wallAt+100).state;}
test('MC map is connected, all ten bosses have rewards, and packs use diverse compositions',()=>{
 assert.equal(moltenCoreBosses.length,10);assert.equal(moltenCoreRoute.filter(n=>n.kind==='trash').length,15);
 for(const node of moltenCoreRoute){assert.ok(moltenCorePath('entrance',node.id).length>1);assert.ok(moltenCoreMap.points[node.id].every(Number.isFinite));}
 for(const [x,y] of Object.values(moltenCoreMap.points) as number[][]){assert.ok(x>=0&&x<=moltenCoreMap.width&&y>=0&&y<=moltenCoreMap.height);}
 for(const boss of moltenCoreBosses){assert.ok(raidLoot[boss.id].length>=12);assert.ok(raidLoot[boss.id].every((id:number)=>items[id]));}
});
test('navigation fights approach packs, pause preserves kills, JSON resume continues and wipe does not clear a pack',()=>{
 let s=fixture();s.settings.autoLoot=true;assert.throws(()=>goldRaidAction(s,{type:'goldNavigate',destination:'majordomo'}),/符文/);
 assert.throws(()=>goldRaidAction(s,{type:'goldNavigate',destination:'ragnaros'}),/管理者/);
 assert.throws(()=>goldRaidAction(s,{type:'goldNavigate',destination:'bad'}),/未知/);
 goldRaidAction(s,{type:'goldNavigate',destination:'lucifron'});assert.equal(s.combat.raidEncounter.id,'mc-gate');
 goldRaidAction(s,{type:'goldPause'});s=forceVictory(s);assert.deepEqual(s.goldRaid.clearedPacks,['mc-gate']);assert.equal(s.goldRaid.cleared.length,0);assert.equal(s.pending.length,0);assert.equal(s.goldRaid.autoAdvance,false);
 s=JSON.parse(JSON.stringify(s));goldRaidAction(s,{type:'goldNavigate',destination:'lucifron'});assert.equal(s.combat.raidEncounter.id,'mc-bridge');
 s=forceVictory(s);assert.equal(s.activity.type,'goldTravel');s=advance(s,s.wallAt+3000).state;assert.equal(s.combat.raidEncounter.id,'mc-imps');
 s=act(s,{type:'abandonCombat',encounterId:s.combat.id},s.wallAt);assert.equal(s.goldRaid.autoAdvance,false);assert.deepEqual(s.goldRaid.clearedPacks,['mc-gate','mc-bridge']);
 assert.equal(goldRaidView(s).map!.route.find(n=>n.id==='mc-imps')!.status,'ahead');
});
test('full map traversal saves every kill once and all-clear locks new runs until next week',()=>{
 let s=fixture();
 for(const node of moltenCoreRoute){for(const c of [s,...s.party])restoreRaidMember(c,s);s.pending=[];goldRaidAction(s,{type:'goldNavigate',destination:node.id});assert.equal(s.combat.raidEncounter.id,node.id);s=forceVictory(s);}
 assert.equal(s.goldRaid.cleared.length,10);assert.equal(s.goldRaid.clearedPacks.length,15);assert.equal(s.goldRaid.locationId,'ragnaros');
 assert.deepEqual(s.goldRaidSaves['molten-core'].cleared,s.goldRaid.cleared);
 const before=s.goldRaid.lots.length;settleGoldRaid(s);assert.equal(s.goldRaid.lots.length,before);
 for(let i=0;i<10000&&s.goldRaid.auction;i++)goldAuctionStep(s);
 finishGoldRun(s);leaveGoldRaid(s);
 assert.throws(()=>enterGoldRaid(s),/本周已全通/);
 s.wallAt+=604800000;enterGoldRaid(s);assert.deepEqual(s.goldRaid.cleared,[]);
});
for(const node of moltenCoreRoute)test('real combat: '+node.id+' / '+node.name,()=>{
 let s=fixture();
 const approach=moltenCoreRoute.slice(0,moltenCoreRoute.indexOf(node));
 s.goldRaid.cleared=approach.filter(n=>n.kind==='boss').map(n=>n.id);s.goldRaid.clearedPacks=approach.filter(n=>n.kind==='trash').map(n=>n.id);
 goldRaidAction(s,{type:'goldStart',bossId:node.id});
 for(let i=0;i<25&&s.combat;i++)s=advance(s,s.wallAt+10000).state;
 assert.equal(s.combat,null,node.name+' must finish');
 const result=s.goldRaid.attempts.at(-1);
 assert.ok(s.lastCombat.enemies.every((e:Rules)=>e.hp<=0),node.name+': '+JSON.stringify({result,enemies:s.lastCombat.enemies.map((e:Rules)=>({name:e.name,hp:e.hp}))}));
 if(node.id==='ragnaros')assert.ok(s.lastCombat.enemies.some((e:Rules)=>e.entry===12143),'Sons of Flame phase must run');
});
