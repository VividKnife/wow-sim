import test from 'node:test';
import assert from 'node:assert/strict';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {advance} from '../src/rules/engine.js';
import {enterGoldRaid,leaveGoldRaid,goldRaidAction,goldRaidView,settleGoldRaid,goldAuctionStep,finishGoldRun} from '../src/rules/gold-raid.js';
import {raidRoutePlan,raidMapView} from '../src/rules/molten-core-content.js';
import {raidLoot} from '../src/rules/raid-rewards.js';
import {onyxiaTick} from '../src/rules/onyxia-encounter.js';
import {dungeonDefinitions} from '../src/rules/dungeon-registry.js';
import {dungeonMap} from '../src/rules/dungeon-map.js';
import {nodes,edges,monsterIdsAt,creatures,quests,items} from '../src/rules/catalog.js';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import type {Rules} from '../src/model.ts';

function fixture(){const s=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';enterGoldRaid(s,'onyxias-lair');for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(s,{type});return s;}
function start(){const s=fixture();s.goldRaid.clearedPacks=['onyxia-warders'];goldRaidAction(s,{type:'goldStart',bossId:'onyxia'});return s;}
test('all 28 classic dungeon wings and high level regions are reachable with original maps',()=>{
 assert.equal(Object.keys(dungeonDefinitions).length,28);
 const seen=new Set(['northshire']);for(let changed=true;changed;){changed=false;for(const e of edges)if(seen.has(e.a)!==seen.has(e.b)){seen.add(e.a);seen.add(e.b);changed=true;}}
 for(const id of Object.keys(nodes))assert.ok(seen.has(id),id);
 for(const def of Object.values(dungeonDefinitions)){assert.ok(def.reference.encounters.length);assert.ok(dungeonMap(def.id).floors.length,def.id);}
 for(const id of ['lights-hope','everlook','cenarion-hold','thorium-point','marshals-refuge'])assert.ok(monsterIdsAt(id).some(id=>creatures[id].MinLevel>=45),id);
 assert.ok(Object.values(quests).filter((q:any)=>q.QuestLevel>40).length>1000);
});
test('Onyxia route has real loot and independent weekly gold progress',()=>{
 const s=fixture();assert.equal(s.party.length,24);assert.deepEqual(raidRoutePlan(s.goldRaid,'onyxia'),['onyxia-warders','onyxia']);assert.equal(raidMapView(s,s.goldRaid,true).name,'奥妮克希亚的巢穴');
 assert.ok(raidLoot.onyxia.length>10);assert.ok(raidLoot.onyxia.every((id:number)=>items[id]));assert.ok(raidLoot.onyxia.includes(17075));assert.ok(!raidLoot.onyxia.includes(13139));
 finishGoldRun(s);leaveGoldRaid(s);s.goldRaidSaves['onyxias-lair']={week:Math.floor((s.wallAt-345600000)/604800000),cleared:['onyxia'],clearedPacks:['onyxia-warders'],locationId:'onyxia'};
 enterGoldRaid(s);assert.equal(s.goldRaid.raidId,'molten-core');assert.deepEqual(s.goldRaid.cleared,[]);
 finishGoldRun(s);leaveGoldRaid(s);assert.throws(()=>enterGoldRaid(s,'onyxias-lair'),/本周已全通/);
});
test('Onyxia phases survive JSON save, summon once per wave and stop flight at 40 percent',()=>{
 let s=start();let boss=s.combat.enemies[0];const actors=[s,...s.party],hurt=()=>{};
 boss.hp=boss.maxHp*.64;onyxiaTick(s,actors,hurt);assert.equal(s.combat.raidEncounter.phase,2);assert.equal(boss.airborne,true);assert.equal(s.combat.enemies.filter((e:Rules)=>e.entry===11262).length,8);
 onyxiaTick(s,actors,hurt);assert.equal(s.combat.enemies.length,9);
 s=JSON.parse(JSON.stringify(s));boss=s.combat.enemies[0];boss.hp=boss.maxHp*.39;onyxiaTick(s,[s,...s.party],hurt);assert.equal(s.combat.raidEncounter.phase,3);assert.equal(boss.airborne,false);assert.ok(s.combat.raidEncounter.events.some((e:Rules)=>e.text.includes('落地')));
});
test('deep breath causes actual damage only inside the telegraphed lane',()=>{
 const s=start(),r=s.combat.raidEncounter,b=s.combat.enemies[0];r.phase=2;r.nextWhelps=s.clock+999999;r.nextSpecial=s.clock+999999;r.nextBreath=s.clock;r.tactics.avoidFire=false;b.airborne=true;onyxiaTick(s,[s,...s.party],()=>{});s.positionY=r.breath.lane;s.party[0].positionY=r.breath.lane+8;s.clock=r.breath.at;
 const hits:string[]=[];onyxiaTick(s,[s,...s.party],(_s:Rules,_b:Rules,c:Rules,amount:number,label:string)=>{if(label==='深呼吸'){c.hp-=amount;hits.push(c.id);}});assert.ok(hits.includes(s.id));assert.ok(!hits.includes(s.party[0].id));assert.equal(r.breath,null);
});
test('Onyxia gold rewards are idempotent and weekly reset reopens the raid',()=>{
 let s=start();for(const e of s.combat.enemies)e.hp=0;s=advance(s,s.wallAt+100).state;const r=s.goldRaid;
 assert.ok(r.cleared.includes('onyxia'));const count=r.lots.length;assert.ok(count>0);settleGoldRaid(s);assert.equal(r.lots.length,count);
 for(let i=0;i<1000&&r.auction;i++)goldAuctionStep(s);finishGoldRun(s);leaveGoldRaid(s);s.wallAt+=604800000;enterGoldRaid(s,'onyxias-lair');assert.deepEqual(s.goldRaid.cleared,[]);
});
test('service enters and leaves an Onyxia gold instance after settlement',async()=>{
 const store=new MemoryStore(),service=new GameService(store,{contentVersion:'test',now:()=>Date.UTC(2026,8,23),seed:()=>60325});
 const save=await service.createSave('p1',{name:'巢穴测试',classId:8,raceId:1,raidReady:true},'p1-save');
 let result=await service.command(save.id,{type:'enterDungeon',contentId:'onyxias-lair-gold',capacity:25,requestId:'ony-enter'});assert.equal(result.state!.goldRaid.raidId,'onyxias-lair');
 await service.command(save.id,{type:'goldSettle',requestId:'ony-settle'});
 const restarted=new GameService(store,{contentVersion:'test',now:()=>Date.UTC(2026,8,23),seed:()=>60325});result=await restarted.command(save.id,{type:'leaveInstance',requestId:'ony-leave'});assert.equal(result.state!.party.length,0);assert.equal(result.state!.goldRaid.active,false);
});
test('configured 25-player raid completes Onyxia through the real combat engine',()=>{
 let s=start();s.settings.autoLoot=true;for(let n=0;n<370&&s.combat;n++)s=advance(s,s.wallAt+1000).state;
 assert.equal(s.combat,null);assert.equal(s.goldRaid.attempts.at(-1)?.won,true,JSON.stringify({attempt:s.goldRaid.attempts.at(-1),phase:s.lastCombat?.raidEncounter?.phase,boss:s.lastCombat?.enemies[0]?.hp,events:s.lastCombat?.raidEncounter?.events?.slice(-5)}));assert.ok(s.goldRaid.cleared.includes('onyxia'));
});
