import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {enterDungeon,leaveDungeon,prepareEncounter,finishDungeonCannon,recordDungeonProgress,interactDungeon,dungeonRoute} from '../../../packages/game-domain/src/rules/dungeon.js';
import {combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {addItem,countItem} from '../../../packages/game-domain/src/rules/character.js';
import {creatureLoot} from '../../../packages/game-domain/src/rules/catalog.js';
import {lootRows,questProgress} from '../../../packages/game-domain/src/rules/quests.js';

function group(seed=283){let s=createGame('矿井测试',seed,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);
 s.location='deadmines';return s;
}
function pull(s){prepareEncounter(s);s.clock=s.combat.pull.startsAt;return s;}

test('instance entry validates original level and party; all source GUID alternatives are fixed in the saved run',()=>{
 const s=group();s.location='northshire';assert.throws(()=>enterDungeon(s),/入口/);s.location='deadmines';s.level=9;assert.throws(()=>enterDungeon(s),/10/);s.level=18;
 enterDungeon(s);assert.equal(dungeonRoute.length,58);assert.equal(Object.keys(s.dungeon.spawns).length,198);
 for(const encounter of dungeonRoute)for(const row of encounter.sourceSpawns){const spawn=s.dungeon.spawns[row.guid];if(spawn)assert.ok(row.templateChoices.some(c=>c.entry===spawn.entry));}
 const saved=structuredClone(s.dungeon),seed=s.rngState;leaveDungeon(s);enterDungeon(s);
 assert.deepEqual(s.dungeon,saved);assert.equal(s.rngState,seed);
});

test('a real first encounter advances the route once and cannot reward the same source GUID again',()=>{
 let s=group();enterDungeon(s);pull(s);const firstGuids=s.combat.enemies.map(e=>e.sourceGuid);
 // Genuine combat, source health/damage, recruited equipment and unmodified time.
 s.wallAt=0;s.nextTick=s.clock+100;s.nextRegen=s.clock+2000;
 s=advance(s,120000,{}).state;
 assert.equal(s.combat,null);assert.equal(s.dungeon.cursor,1);assert.equal(s.totals.kills,2);
 assert.ok(firstGuids.every(g=>s.dungeon.defeated[g]));
 const xp=s.totals.xp,kills=s.totals.kills;recordDungeonProgress(s);recordDungeonProgress(s);
 assert.equal(s.dungeon.cursor,1);assert.equal(s.totals.xp,xp);assert.equal(s.totals.kills,kills);
 // Casualties do not invalidate encounter rewards; recover before testing re-entry.
 if([s,...s.party].some(c=>c.hp<=0)){s=act(s,{type:'revive'},s.wallAt);s=advance(s,s.wallAt+11000,{}).state;}
 const run=structuredClone(s.dungeon);leaveDungeon(s);enterDungeon(s);assert.deepEqual(s.dungeon,run);
});

test('optional rare selection persists through leaving, serialization and resuming',()=>{
 const s=group(1);enterDungeon(s);const johnson=s.dungeon.spawns[3600096];
 leaveDungeon(s);const resumed=JSON.parse(JSON.stringify(s));enterDungeon(resumed);
 assert.deepEqual(resumed.dungeon.spawns[3600096],johnson);
 assert.throws(()=>enterDungeon(resumed),/已经/);
});

test('cannon requires cleared powder guards, a real powder item and the original door delay',()=>{
 const s=group();enterDungeon(s);s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id==='dm-gunpowder');
 assert.throws(()=>interactDungeon(s),/敌人/);
 for(const guid of dungeonRoute[s.dungeon.cursor].sourceGuids)s.dungeon.defeated[guid]=true;
 interactDungeon(s);assert.ok(s.bag.some(i=>i.id===5397));
 s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id==='dm-cannon');interactDungeon(s);
 assert.equal(s.bag.some(i=>i.id===5397),false);assert.equal(s.activity.endsAt-s.clock,500);
 assert.equal(s.dungeon.interactions['dm-cannon'],undefined);
 s.clock=s.activity.endsAt;finishDungeonCannon(s);
 assert.equal(s.dungeon.interactions['dm-cannon'],true);assert.equal(dungeonRoute[s.dungeon.cursor].id,'dm-cannon-alarm');
 assert.throws(()=>interactDungeon(s),/交互/);
});

test('cleared enemies stay dead after a wipe while surviving enemies keep their original level and stats',()=>{
 const s=group();enterDungeon(s);pull(s);const [a,b]=s.combat.enemies;
 a.hp=0;recordDungeonProgress(s);s.lastCombat=s.combat;s.combat=null;s.hp=0;s.activity={type:'dead'};recordDungeonProgress(s);
 s.hp=stats(s).maxHp;s.activity={type:'idle'};for(const c of s.party)c.hp=stats(c).maxHp;
 pull(s);assert.deepEqual(s.combat.enemies.map(e=>e.sourceGuid),[b.sourceGuid]);
 assert.equal(s.combat.enemies[0].level,b.level);assert.equal(s.combat.enemies[0].maxHp,b.maxHp);
 assert.throws(()=>leaveDungeon(s),/战斗/);
});

test('Sneed appears 3500ms after the shredder dies and only his death unlocks the next patrol',()=>{
 const s=group();enterDungeon(s);s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id==='dm-sneed');pull(s);
 const machine=s.combat.enemies[0];machine.hp=0;combatTick(s);recordDungeonProgress(s);
 assert.ok(s.combat);assert.equal(s.combat.pendingSpawns.length,1);assert.equal(dungeonRoute[s.dungeon.cursor].id,'dm-sneed');
 const due=s.combat.pendingSpawns[0].at;s.clock=due-100;combatTick(s);assert.equal(s.combat.enemies.length,1);
 s.clock=due;combatTick(s);assert.equal(s.combat.enemies[1].entry,643);
 s.combat.enemies[1].hp=0;combatTick(s);recordDungeonProgress(s);
 assert.equal(dungeonRoute[s.dungeon.cursor].id,'dm-patrol-02');assert.equal(s.dungeon.defeatedBosses[643],true);
});

test('stopping a fired cannon cannot consume powder without opening the door',()=>{
 let s=group();enterDungeon(s);s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id==='dm-cannon');addItem(s,5397);
 s=act(s,{type:'dungeonInteract'},0);assert.throws(()=>act(s,{type:'stop'},0),/火炮/);
 s=advance(s,500,{}).state;assert.equal(s.dungeon.interactions['dm-cannon'],true);
 assert.equal(countItem(s,5397),0);
});

test('party rest consumes individual supplies and restores living members without a browser heartbeat',()=>{
 let s=group();enterDungeon(s);s.bag=[];addItem(s,117,5);addItem(s,159,5);
 for(const c of [s,...s.party]){c.hp=1;c.mana=0;c.lastManaUse=0;}
 s=act(s,{type:'rest'},0);assert.equal(countItem(s,117),0);assert.equal(countItem(s,159),2);
 assert.ok([s,...s.party].every(c=>c.rest));
 const background=advance(s,18000).state;assert.ok(background.clock>0);assert.ok(background.party.every(c=>c.hp>1));
 const whole=advance(s,18000,{}).state;let chunk=s;
 for(let time=700;time<18000;time+=700)chunk=advance(chunk,time,{}).state;
 chunk=advance(chunk,18000,{}).state;assert.deepEqual(chunk,whole);
 assert.ok(whole.party.every(c=>c.hp>1));assert.ok(whole.party.filter(c=>[5,8].includes(c.classId)).every(c=>c.mana>0));
});

test('a wiped party can return to corpses and resume without recreating defeated enemies',()=>{
 let s=group();enterDungeon(s);pull(s);s.combat.enemies[0].hp=0;combatTick(s);recordDungeonProgress(s);
 const deadGuid=s.combat.enemies[0].sourceGuid;for(const c of [s,...s.party])c.hp=0;combatTick(s);recordDungeonProgress(s);
 s=act(s,{type:'revive'},0);assert.equal(s.activity.type,'revive');
 s=advance(s,10000,{}).state;
 assert.ok([s,...s.party].every(c=>c.hp>0));assert.equal(s.dungeon.defeated[deadGuid],true);
 assert.doesNotThrow(()=>prepareEncounter(s));
});

test('priest resurrection has its source cost and cast time, and restores flat health and mana',()=>{
 let s=group();enterDungeon(s);const priest=s.party.find(c=>c.classId===5),mage=s.party.find(c=>c.classId===8);mage.hp=0;mage.mana=0;
 const mana=priest.mana,cost=Math.floor(stats(priest).baseMana*.75);
 s=act(s,{type:'resurrect',target:mage.id},0);
 assert.equal(s.party.find(c=>c.classId===5).mana,mana);assert.equal(s.activity.timing.cost,cost);assert.equal(s.activity.endsAt-s.clock,10000);
 s=advance(s,9900,{}).state;assert.equal(s.party.find(c=>c.classId===8).hp,0);
 s=advance(s,10000,{}).state;const restored=s.party.find(c=>c.classId===8);assert.ok(s.party.find(c=>c.classId===5).mana<mana);
 // The shared regeneration tick at 10s also occurs after resurrection.
 assert.ok(restored.hp>=70);assert.ok(restored.hp<stats(restored).maxHp/2);assert.ok(restored.mana>=135);
 const oldHp=s.hp;s.party.find(c=>c.classId===1).hp=0;s=act(s,{type:'revive'},10000);
 s=advance(s,20000,{}).state;assert.equal(s.hp,oldHp);assert.ok(s.party.find(c=>c.classId===1).hp>0);
});

test('VanCleef drops the Alliance letter before its quest is accepted, enabling the item-started follow-up',()=>{
 let s=group();enterDungeon(s);s.dungeon.cursor=dungeonRoute.findIndex(e=>e.id==='dm-vancleef');pull(s);
 // Reward-path fixture: defeat the source encounter to exercise its real loot table.
 for(const e of s.combat.enemies)e.hp=0;combatTick(s);recordDungeonProgress(s);
 assert.ok(s.pending.some(i=>i.id===2874));assert.equal(countItem(s,2874),0);
 s=act(s,{type:'loot'},s.wallAt);
 assert.equal(countItem(s,2874),1);assert.equal(questProgress(s,373).canAccept,true);
 s=act(s,{type:'accept',id:373},0);assert.equal(questProgress(s,373).complete,true);
 leaveDungeon(s);s=act(s,{type:'travel',to:'cathedral'},0);s=advance(s,s.activity.endsAt-s.clock).state;
 s=act(s,{type:'turnin',id:373},s.wallAt);assert.equal(s.completed[373],1);assert.equal(countItem(s,2874),0);
 lootRows(s,creatureLoot[639].filter(r=>r.item===2874));assert.equal(countItem(s,2874),0);
});

test('letter loot eligibility is independent of acceptance level and respects faction and quest status',()=>{
 const rows=creatureLoot[639].filter(r=>r.item===2874);let s=createGame('信件',123,0);
 lootRows(s,rows);assert.equal(countItem(s,2874),1);assert.equal(questProgress(s,373).canAccept,false);
 const horde=createGame('阵营条件',123,0);horde.teamId=67;lootRows(horde,rows);assert.equal(countItem(horde,2874),0);
 s=group();s.quests[373]={kills:{},event:false};lootRows(s,rows);assert.equal(countItem(s,2874),0);
});

test('leaving with a fallen companion still permits recovery outside and re-entry',()=>{
 let s=group();enterDungeon(s);s.party.find(c=>c.classId===5).hp=0;leaveDungeon(s);
 s=act(s,{type:'revive'},0);s=advance(s,10000).state;
 assert.ok(s.party.every(c=>c.hp>0));assert.doesNotThrow(()=>enterDungeon(s));
});

test('instance journey advances under its runner without a browser heartbeat',()=>{
 let s=act(group(),{type:'enterDungeon'},0);
 s=act(s,{type:'dungeonNext'},0);
 const before=structuredClone(s);s=advance(s,500).state;
 assert.equal(s.clock,500);assert.deepEqual(s.dungeon.spawns,before.dungeon.spawns);
 assert.throws(()=>act(s,{type:'hunt',id:598},s.wallAt),/离开副本/);
 assert.throws(()=>act(s,{type:'travel',to:'oldtown'},s.wallAt),/离开副本/);
});
