import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../src/rules/engine.js';
import {addItem,countItem,bagCapacity} from '../src/rules/character.js';
import {items,quests,creatures} from '../src/rules/catalog.js';
import {acceptQuest,turnIn,questAvailable,questProgress,questScenes,beginQuestScene,finishQuestScene,creditKill,itemSources,questContentReason} from '../src/rules/quests.js';
import {weaponItemUse,useWeaponItem} from '../src/rules/epic-weapons.js';
import {itemUseView} from '../src/rules/utility-actions.js';
import {rollRaidLoot} from '../src/rules/raid-rewards.js';

function player(classId=5,raceId=1){const s=createGame('武器测试',42,0,{classId,raceId});s.level=60;s.party=[];s.pet=null;return s;}
function give(s,...ids){for(const id of ids)addItem(s,id);}
function use(s,id){return useWeaponItem(s,s.bag.find(i=>i.id===id));}
function scene(s,id,key){beginQuestScene(s,id,key);s.clock=s.activity.endsAt;const enemies=finishQuestScene(s);s.activity={type:'idle'};return enemies;}

test('missing weapons and quest dependencies have real templates',()=>{
 for(const id of [17182,18608,18609,18713,18715,18348,18489,18492,22726])assert.ok(items[id]?.entry===id);
 for(const id of [14530,14533,14534,14535,14435])assert.ok(creatures[id]?.MaxLevel>=60);
 assert.equal(quests[7509].RewItemId1,18348);
 for(const id of [18608,18609,18713,18715,17182,19016,19017,19018,18952,18953,18954,18955])assert.ok(itemSources(id).length,`missing source ${id}`);
});

test('priest chain requires divinity, class, warning and a completed scene',()=>{
 const s=player();s.location='stratholme-gate';
 assert.equal(questAvailable(s,quests[7621]),false);give(s,18646);
 acceptQuest(s,7621);turnIn(s,7621);acceptQuest(s,7622);
 assert.equal(questProgress(s,7622).complete,false);
 scene(s,7622,'event');turnIn(s,7622);
 assert.equal(countItem(s,18659),1);give(s,18665);
 assert.ok(itemUseView(s,s.bag.find(i=>i.id===18659)).canUse);use(s,18659);
 for(const id of [18659,18646,18665])assert.equal(countItem(s,id),0);
 assert.equal(countItem(s,18608),1);
 const mage=player(8);give(mage,18646);assert.equal(questAvailable(mage,quests[7621]),false);
});

test('removing divinity while scene is running cannot complete the trial',()=>{
 const s=player();give(s,18646);s.completed[7621]=1;s.location='stratholme-gate';acceptQuest(s,7622);
 beginQuestScene(s,7622,'event');s.bag=s.bag.filter(i=>i.id!==18646);s.clock=s.activity.endsAt;finishQuestScene(s);
 assert.equal(s.quests[7622].event,false);
});

test('benediction transformation preserves instance and has shared 30-minute cooldown',()=>{
 const s=player();give(s,18608);const i=s.bag.find(i=>i.id===18608);i.enchant='test';i.ownerId=s.id;i.durability=23;const uid=i.uid;
 use(s,18608);assert.equal(i.id,18609);assert.equal(i.uid,uid);assert.equal(i.enchant,'test');assert.equal(i.durability,23);assert.equal(i.ownerId,s.id);
 assert.throws(()=>use(s,18609),/冷却/);s.clock+=1800000;use(s,18609);assert.equal(i.id,18608);
});

test('hunter leaf leads to four solo encounters without free head fallback',()=>{
 const s=player(3,4);give(s,18703);acceptQuest(s,7632);s.location='irontree';turnIn(s,7632);acceptQuest(s,7636);
 const targets=[[18952,14533],[18953,14534],[18954,14530],[18955,14535]];
 for(let n=1;n<=4;n++){
  const special=questScenes(s,7636).find(x=>x.key==='special:'+n);assert.ok(special);assert.equal(questScenes(s,7636).some(x=>x.key==='item:'+n),false);
  s.location=special.locations[0];s.party=[{id:'helper'}];assert.equal(questScenes(s,7636).find(x=>x.key==='special:'+n).available,false);s.party=[];
  s.pet={id:'pet'};assert.equal(questScenes(s,7636).find(x=>x.key==='special:'+n).available,false);s.pet=null;
  assert.deepEqual(scene(s,7636,'special:'+n),[targets[n-1][1]]);
  creditKill(s,targets[n-1][1],{});assert.equal(countItem(s,targets[n-1][0]),0);
  creditKill(s,targets[n-1][1],{quest:7636});assert.equal(countItem(s,targets[n-1][0]),1);
 }
 s.location='irontree';turnIn(s,7636);acceptQuest(s,7635);give(s,18705);turnIn(s,7635);use(s,18707);
 assert.equal(countItem(s,18713),1);assert.equal(countItem(s,18707),0);assert.equal(countItem(s,18724),0);
 use(s,18713);assert.equal(countItem(s,18715),1);assert.equal(countItem(s,18713),1);assert.throws(()=>use(s,18713),/已经/);
});

test('Sulfuras consumes the eye and crafted hammer through the public item action',()=>{
 let s=player(1);give(s,17204);assert.equal(weaponItemUse(s,s.bag.find(i=>i.id===17204)).canUse,false);give(s,17193);
 s=act(s,{type:'useItem',uid:s.bag.find(i=>i.id===17204).uid},0);
 assert.equal(countItem(s,17182),1);assert.equal(countItem(s,17193),0);assert.equal(countItem(s,17204),0);
});

test('locked and foreign-owned materials are not consumed',()=>{
 const s=player(1);give(s,17204,17193);const hammer=s.bag.find(i=>i.id===17193);hammer.locked=true;
 assert.throws(()=>use(s,17204),/材料/);hammer.locked=false;hammer.ownerId='other';assert.throws(()=>use(s,17204),/材料/);
 assert.equal(countItem(s,17204),1);assert.equal(countItem(s,17182),0);
});

test('contract and binding interactions retain the rare source and reject duplicates',()=>{
 const s=player(1);give(s,17203,18563);assert.throws(()=>use(s,17203),/前往/);s.location='blackrock-depths';use(s,17203);
 assert.equal(countItem(s,17203),1);assert.equal(countItem(s,18628),1);assert.throws(()=>use(s,17203),/已经/);
 acceptQuest(s,7604);turnIn(s,7604);assert.equal(countItem(s,18592),1);assert.equal(countItem(s,17203),0);
 s.location='crystal-vale';use(s,18563);assert.equal(countItem(s,18563),1);acceptQuest(s,7785);turnIn(s,7785);
 assert.throws(()=>use(s,18563),/已经/);
});

test('full bag rejects a non-consuming reward without changing inventory',()=>{
 const s=player(1);give(s,18563);s.location='crystal-vale';while(s.bag.length<bagCapacity(s))give(s,35);const before=structuredClone(s);
 assert.throws(()=>use(s,18563),/空间/);assert.deepEqual(s,before);
});

test('Quel Serrar has class gates, conjured starter, Onyxia victory and turn-in',()=>{
 const s=player(1);give(s,18401);acceptQuest(s,7507);s.location='dire-maul-west';turnIn(s,7507);assert.equal(countItem(s,18513),1);
 acceptQuest(s,7508);turnIn(s,7508);acceptQuest(s,7509);assert.equal(countItem(s,18489),1);
 s.location='onyxias-lair';s.goldRaid={active:true,cleared:[]};assert.equal(questScenes(s,7509).find(x=>x.key==='special:1').available,false);
 creditKill(s,10184,{});assert.equal(s.quests[7509].kills[10184],undefined);
 creditKill(s,10184,{raidEncounter:{id:'onyxia'}});s.goldRaid.cleared.push('onyxia');scene(s,7509,'special:1');
 assert.equal(countItem(s,18489),0);assert.equal(countItem(s,18492),1);s.location='dire-maul-west';s.goldRaid=null;turnIn(s,7509);assert.equal(countItem(s,18348),1);
 assert.equal(questAvailable(player(8),quests[7507]),false);
});

test('future legendary chains are explicitly gated instead of awarding free raid parts',()=>{
 const s=player(1);s.completed[7785]=1;
 assert.match(questContentReason(quests[7786]),/3/);assert.equal(questAvailable(s,quests[7786]),false);
 for(const id of [9250,9251,9257,9269,9270,9271])assert.match(questContentReason(quests[id]),/6/);
 const mage=player(8);give(mage,22726);assert.equal(weaponItemUse(mage,mage.bag.find(i=>i.id===22726)).canUse,false);
});

test('Ragnaros essence is a personal guaranteed quest drop, never normal raid loot',()=>{
 const s=player(1);assert.equal(rollRaidLoot(s,'ragnaros').some(i=>i.itemId===19017),false);
 s.quests[7786]={kills:{},event:false};assert.ok(rollRaidLoot(s,'ragnaros').some(i=>i.itemId===19017&&i.quest));
 give(s,19017);assert.equal(rollRaidLoot(s,'ragnaros').some(i=>i.itemId===19017),false);
});

test('Horde priest follows the same neutral quest chain',()=>{
 const s=player(5,5);s.location='stratholme-gate';give(s,18646);acceptQuest(s,7621);turnIn(s,7621);acceptQuest(s,7622);scene(s,7622,'event');turnIn(s,7622);give(s,18665);use(s,18659);assert.equal(countItem(s,18608),1);
});

test('public hunter scene action creates the actual demon battle',()=>{
 let s=player(3,4);s.completed[7632]=1;s.location='irontree';acceptQuest(s,7636);s.location='ungoro-east';
 s=act(s,{type:'questScene',id:7636,key:'special:1'},0);
 s=act(s,{type:'sync'},10000);
 assert.equal(s.combat.quest,7636);assert.ok(s.combat.enemies.some(e=>e.entry===14533));assert.equal(countItem(s,18952),0);
});

test('abandoned Quel Serrar intermediate quest can be accepted again at Lydros',()=>{
 let s=player(1);s.completed[7507]=1;s.location='dire-maul-west';acceptQuest(s,7508);s=act(s,{type:'abandon',id:7508},0);
 assert.equal(countItem(s,18513),0);acceptQuest(s,7508);assert.equal(countItem(s,18513),1);
});
