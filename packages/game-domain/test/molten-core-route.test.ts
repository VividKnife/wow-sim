import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {advance,act} from '../src/rules/engine.js';
import {enterGuildRaid,guildRaidAction,guildRaidView,restoreRaidMember,raidLoot,settleGuildRaid} from '../src/rules/guild-raid.js';
import {moltenCoreBosses,moltenCoreRoute,moltenCoreMap,moltenCorePath} from '../src/rules/molten-core-content.js';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {items} from '../src/rules/catalog.js';
import type {Rules} from '../src/model.ts';

function fixture(){const s=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';enterGuildRaid(s);return s;}
function forceVictory(s:Rules){s.combat.enemies.forEach((e:Rules)=>e.hp=0);return advance(s,s.wallAt+100).state;}
test('MC map is connected, all ten bosses have rewards, and packs use diverse compositions',()=>{
 assert.equal(moltenCoreBosses.length,10);assert.equal(moltenCoreRoute.filter(n=>n.kind==='trash').length,15);
 for(const node of moltenCoreRoute){assert.ok(moltenCorePath('entrance',node.id).length>1);assert.ok(moltenCoreMap.points[node.id].every(Number.isFinite));}
 for(const [x,y] of Object.values(moltenCoreMap.points)){assert.ok(x>=0&&x<=moltenCoreMap.width&&y>=0&&y<=moltenCoreMap.height);}
 for(const boss of moltenCoreBosses){assert.equal(raidLoot[boss.id].length,6);assert.ok(raidLoot[boss.id].every((id:number)=>items[id]));}
});
test('navigation fights approach packs, pause preserves kills, JSON resume continues and wipe does not clear a pack',()=>{
 let s=fixture();assert.throws(()=>guildRaidAction(s,{type:'raidNavigate',destination:'majordomo'}),/符文/);
 assert.throws(()=>guildRaidAction(s,{type:'raidNavigate',destination:'ragnaros'}),/管理者/);
 assert.throws(()=>guildRaidAction(s,{type:'raidNavigate',destination:'bad'}),/未知/);
 guildRaidAction(s,{type:'raidNavigate',destination:'lucifron'});assert.equal(s.combat.raidEncounter.id,'mc-gate');
 guildRaidAction(s,{type:'raidPause'});s=forceVictory(s);assert.deepEqual(s.guildRaid.clearedPacks,['mc-gate']);assert.equal(s.guildRaid.cleared.length,0);assert.equal(s.pending.length,0);assert.equal(s.guildRaid.autoAdvance,false);
 s=JSON.parse(JSON.stringify(s));guildRaidAction(s,{type:'raidNavigate',destination:'lucifron'});assert.equal(s.combat.raidEncounter.id,'mc-bridge');
 s=forceVictory(s);assert.equal(s.activity.type,'raidTravel');s=advance(s,s.wallAt+3000).state;assert.equal(s.combat.raidEncounter.id,'mc-imps');
 s=act(s,{type:'abandonCombat',encounterId:s.combat.id},s.wallAt);assert.equal(s.guildRaid.autoAdvance,false);assert.deepEqual(s.guildRaid.clearedPacks,['mc-gate','mc-bridge']);
 assert.equal(guildRaidView(s).map!.route.find(n=>n.id==='mc-imps')!.status,'ahead');
});
test('full map traversal settles all encounters once, stops for loot, and practice preserves weekly claims',()=>{
 let s=fixture();
 for(const node of moltenCoreRoute){for(const c of [s,...s.party])restoreRaidMember(c,s);s.pending=[];guildRaidAction(s,{type:'raidNavigate',destination:node.id});assert.equal(s.combat.raidEncounter.id,node.id);s=forceVictory(s);}
 assert.equal(s.guildRaid.cleared.length,10);assert.equal(s.guildRaid.clearedPacks.length,15);assert.equal(s.guildRaid.rewards.length,10);assert.equal(s.guildRaid.locationId,'ragnaros');
 const claims={...s.guildRaid.claims};guildRaidAction(s,{type:'raidRestart'});assert.deepEqual(s.guildRaid.claims,claims);assert.deepEqual(s.guildRaid.clearedPacks,[]);assert.equal(s.guildRaid.locationId,'entrance');
});
test('a completed gold encounter cannot grant guild rewards on later entry',()=>{
 const s=fixture();beginMoltenCoreBattle(s,'lucifron',s.guildRaid.tactics);
 s.combat.raidMode='gold';s.combat.enemies.forEach((e:Rules)=>e.hp=0);
 const ended=advance(s,s.wallAt+100).state;settleGuildRaid(ended);
 assert.equal(ended.guildRaid.rewards.length,0);assert.equal(ended.guildRaid.cleared.length,0);assert.equal(ended.pending.length,0);
});
for(const node of moltenCoreRoute)test('real combat: '+node.id+' / '+node.name,()=>{
 let s=fixture();
 beginMoltenCoreBattle(s,node.id,s.guildRaid.tactics);
 for(let i=0;i<25&&s.combat;i++)s=advance(s,s.wallAt+10000).state;
 assert.equal(s.combat,null,node.name+' must finish');
 const result=s.guildRaid.attempts.at(-1);
 assert.ok(s.lastCombat.enemies.every((e:Rules)=>e.hp<=0),node.name+': '+JSON.stringify({result,enemies:s.lastCombat.enemies.map((e:Rules)=>({name:e.name,hp:e.hp}))}));
 if(node.id==='ragnaros')assert.ok(s.lastCombat.enemies.some((e:Rules)=>e.entry===12143),'Sons of Flame phase must run');
});
