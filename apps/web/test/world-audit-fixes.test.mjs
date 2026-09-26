import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {quests,questLinks,endpointNodes,nodes,creatures,items,table} from '../../../packages/game-domain/src/rules/catalog.js';
import {questProgress,questAvailable,questContentReason,questScenes,creditKill,meetsCondition,itemSources} from '../../../packages/game-domain/src/rules/quests.js';
import {questItemActions,questFishingSources} from '../../../packages/game-data/world-quest-content.js';
import {addItem,countItem,stats} from '../../../packages/game-domain/src/rules/character.js';
import {createNpcMember} from '../../../packages/game-domain/src/rules/party.js';
import {startCombat,beginHunterTaming} from '../../../packages/game-domain/src/rules/combat.js';
import {dungeonRoute,enterDungeon,interactDungeon,prepareEncounter,recordDungeonProgress,dungeonEntryReason} from '../../../packages/game-domain/src/rules/dungeon.js';
import {dungeonBossTick,dungeonBossPhaseTick} from '../../../packages/game-domain/src/rules/dungeon-boss-ai.js';
import {selectedDungeonMembers,npcWorldView} from '../../../packages/game-domain/src/rules/npc-world.js';
import {resourceView} from '../../../packages/game-domain/src/rules/professions.js';
import {raidAttunementReason,grantRaidReadyAttunements} from '../../../packages/game-domain/src/rules/raid-attunement.js';
import {enterGoldRaid} from '../../../packages/game-domain/src/rules/gold-raid.js';

function player(classId=1){const s=createGame('审计回归',73,0,{raceId:classId===3?3:1,classId});s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;}
function dungeon(id){const s=player();for(const name of ['warrior','priest','rogue','mage'])createNpcMember(s,name);s.location=id;enterDungeon(s,id);return s;}
function completeBattle(s){for(const e of s.combat.enemies)e.hp=0;s.lastCombat=s.combat;s.combat=null;recordDungeonProgress(s);}

test('all public quests have located endpoints and scripted item inputs have valid templates',()=>{
 for(const q of Object.values(quests).filter(q=>!questContentReason(q))){
  const links=questLinks[q.entry];assert.ok(links.starts.some(e=>e.type==='item'?items[e.id]:endpointNodes(e).some(n=>nodes[n])),`start ${q.entry}`);
  assert.ok(links.ends.some(e=>endpointNodes(e).some(n=>nodes[n])),`end ${q.entry}`);
 }
 for(const [item,a]of Object.entries(questItemActions)){assert.ok(items[item]);for(const n of a.locations)assert.ok(nodes[n],n);if(a.enemy)assert.ok(creatures[a.enemy],a.enemy);for(const [id]of a.inputs||[])assert.ok(items[id],id);}
});

test('marking all four towers uses the beacon and completes after timed actions, without killing friendly markers',()=>{
 let s=player();s.quests[5097]={kills:{},event:false};addItem(s,12815,1);
 for(let n=1;n<=4;n++){
  const scene=questScenes(s,5097).find(x=>x.key==='objective:'+n);assert.ok(scene);
  s.location=scene.locations[0];s=act(s,{type:'questScene',id:5097,key:scene.key},s.wallAt);
  s=advance(JSON.parse(JSON.stringify(s)),s.wallAt+15000).state;
 }
 assert.equal(questProgress(s,5097).complete,true);assert.equal(s.combat,null);
});

test('Pamela doll requires all three parts, consumes them, and cannot be repeated for free',()=>{
 let s=player();s.location='darrowshire';s.quests[5149]={kills:{},event:false};
 assert.throws(()=>act(s,{type:'questScene',id:5149,key:'special:4'},0));
 for(const id of [12886,12887,12888])addItem(s,id,1);
 s=act(s,{type:'questScene',id:5149,key:'special:4'},0);s=advance(s,5000).state;
 assert.equal(countItem(s,12885),1);for(const id of [12886,12887,12888])assert.equal(countItem(s,id),0);
 assert.equal(questProgress(s,5149).complete,true);assert.throws(()=>act(s,{type:'questScene',id:5149,key:'special:4'},5000));
});

test('summoned item reward requires winning the quest encounter and is awarded once',()=>{
 let s=player();s.location='steamwheedle';s.quests[4005]={kills:{},event:false};addItem(s,11617,1);
 s=act(s,{type:'questScene',id:4005,key:'special:1'},0);s=advance(s,5000).state;
 assert.equal(s.combat.enemies[0].entry,9453);assert.equal(countItem(s,11522),0);
 creditKill(s,9453);assert.equal(countItem(s,11522),1);creditKill(s,9453);assert.equal(countItem(s,11522),1);
});

test('profession names, inventory/bank checks, auras and unknown inverted instance conditions keep their semantics',()=>{
 const s=player(2);s.professions.firstaid={skill:225,cap:225};assert.equal(questAvailable(s,quests[6625]),true);
 assert.equal(questAvailable(s,quests[1641]),true);
 const condition=table('conditions').find(c=>c.type===23&&c.value2>0);assert.ok(condition);assert.equal(meetsCondition(s,condition.condition_entry),!!(condition.flags&1));
 s.bank.push({id:condition.value1,count:condition.value2});assert.equal(meetsCondition(s,condition.condition_entry),!(condition.flags&1));
 const aura=table('conditions').find(c=>c.condition_entry===quests[7703].RequiredCondition);assert.equal(aura.type,1);s.classBuffs=[{spell:aura.value1,until:10000}];assert.equal(meetsCondition(s,aura.condition_entry),true);s.clock=10000;assert.equal(meetsCondition(s,aura.condition_entry),false);
 const inverse=table('conditions').find(c=>c.type===-3&&c.value1===733);assert.ok(inverse);s.location='northshire';assert.equal(meetsCondition(s,inverse.condition_entry),false);
 s.location='stratholme-undead';assert.equal(meetsCondition(s,inverse.condition_entry),true);s.dungeonSaves={'stratholme-undead':{defeatedBosses:{10440:true}}};assert.equal(meetsCondition(s,inverse.condition_entry),false);
});

test('P1 scope excludes Naxxramas and AQ opening but retains supported dungeon set quests',()=>{
 assert.ok(questContentReason(quests[9121]));assert.ok(questContentReason(quests[8743]));assert.equal(questContentReason(quests[8945]),'');
});

test('quest fish navigation matches actual fishing pools and skill requirements',()=>{
 const s=player();s.professions.fishing={skill:300,cap:300};
 for(const [id,source]of Object.entries(questFishingSources)){s.location=source.locations[0];assert.ok(itemSources(+id).includes(s.location));assert.ok(resourceView(s).find(r=>r.item===+id&&r.available));}
});

test('taming a distant enemy already in combat refuses before spending resources or repositioning it',()=>{
 const s=player(3);s.learned.push(1515);s.location='northshire';startCombat(s,[299]);const e=s.combat.enemies[0];e.position=s.position+60;const mana=s.mana;
 assert.throws(()=>beginHunterTaming(s,e.id),/射程/);assert.equal(s.mana,mana);assert.equal(e.position,s.position+60);assert.equal(s.cast,null);
});

test('gold raid members never count as dungeon party members and raids lock dungeon entry',()=>{
 const s=player();for(const name of ['warrior','priest','rogue','mage'])createNpcMember(s,name);s.party.push(...Array.from({length:20},(_,i)=>({...s.party[0],id:'gold:'+i,goldNpc:true})));s.goldRaid={active:true};
 assert.equal(selectedDungeonMembers(s).length,4);assert.ok(!('owned' in npcWorldView(s)));assert.equal(npcWorldView(s).locked,true);assert.match(dungeonEntryReason(s,'deadmines'),/团队副本/);
});

test('both factions require the leader attunement, while raid-ready presets provide it',()=>{
 for(const team of [67,469]){
  const s=player();s.teamId=team;for(const name of ['warrior','priest','rogue','mage'])createNpcMember(s,name);
  assert.throws(()=>enterGoldRaid(s),/传送门/);assert.throws(()=>enterGoldRaid(s,'onyxias-lair'),/龙火护符/);
  grantRaidReadyAttunements(s);assert.equal(raidAttunementReason(s,'molten-core'),'');assert.equal(raidAttunementReason(s,'onyxias-lair'),'');
  enterGoldRaid(s,'onyxias-lair');assert.equal(s.goldRaid.active,true);
 }
});

test('Ring of Law starts explicitly, runs three waves, chooses one champion and resumes after reload',()=>{
 let s=dungeon('blackrock-depths'),e=dungeonRoute(s).find(e=>e.id==='brd-arena');s.dungeon.cursor=dungeonRoute(s).indexOf(e);interactDungeon(s);
 assert.equal(s.combat.enemies.length,3);completeBattle(s);assert.equal(s.dungeon.cleared[e.id],undefined);
 s=JSON.parse(JSON.stringify(s));prepareEncounter(s);assert.equal(s.combat.enemies.length,3);completeBattle(s);
 prepareEncounter(s);assert.equal(s.combat.enemies.length,1);assert.ok([9027,9028,9029,9030,9031,9032].includes(s.combat.enemies[0].entry));completeBattle(s);assert.equal(s.dungeon.cleared[e.id],true);
});

test('bar event requires and consumes six beers before Phalanx opens the way',()=>{
 const s=dungeon('blackrock-depths'),route=dungeonRoute(s),e=route.find(e=>e.waves&&e.id!=='brd-arena');s.dungeon.cursor=route.indexOf(e);
 assert.throws(()=>interactDungeon(s),/需要/);addItem(s,11325,6);interactDungeon(s);assert.equal(countItem(s,11325),0);assert.ok(s.combat.enemies.some(e=>e.entry===9502));completeBattle(s);assert.equal(s.dungeon.interactions[e.id],true);
});

test('tribute requires the king, counts spared guards, grants the king aura and cannot be claimed twice',()=>{
 const s=dungeon('dire-maul-north'),route=dungeonRoute(s);s.dungeon.cursor=route.findIndex(e=>e.id==='gordok-tribute');assert.throws(()=>interactDungeon(s),/首领/);
 s.dungeon.defeatedBosses[11501]=true;interactDungeon(s);assert.equal(s.dungeon.tribute,6);assert.ok(s.classBuffs.some(a=>a.spell===22799));assert.ok(s.bag.length>0);
 s.dungeon.cursor=route.findIndex(e=>e.id==='gordok-tribute');assert.throws(()=>interactDungeon(s),/已完成/);
});

test('Gandling teleports after sixteen seconds, clears threat, summons guardians and returns the player after their deaths',()=>{
 const s=player();startCombat(s,[1853],true);const e=s.combat.enemies[0];e.target=s.id;e.threat[s.id]=4000;
 dungeonBossTick(s,e,[s],()=>{});s.clock=16000;dungeonBossTick(s,e,[s],()=>{});
 const room=s.combat.gandlingRooms[0];assert.ok(room.guards.length>=3&&room.guards.length<=4);assert.equal(e.threat[s.id],undefined);
 for(const id of room.guards)s.combat.enemies.find(e=>e.id===id).hp=0;
 dungeonBossPhaseTick(s,[s],()=>{});assert.equal(room.closed,true);assert.equal(s.position,room.origin.x);
 e.hp=e.maxHp*.03;s.clock=100000;dungeonBossTick(s,e,[s],()=>{});assert.equal(s.combat.gandlingRooms.length,1);
});
