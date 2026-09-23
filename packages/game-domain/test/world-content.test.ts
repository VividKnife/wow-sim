import test from 'node:test';
import type {Rules} from '../src/model.ts';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../src/rules/engine.js';
import {classDefinitions,raceDefinitions,nodes as rawNodes,route,monsterIdsAt,quests,table,creatures,items,questLinks as rawLinks,endpointNodes} from '../src/rules/catalog.js';
import {racialHomes,capitals,worldRegions} from '../../game-data/world-content.js';
import {stats,canEquip,countItem,addItem} from '../src/rules/character.js';
import {questAvailable,questProgress,creditKill,questScenes} from '../src/rules/quests.js';
import {dungeonDefinitions,dungeonRoute} from '../src/rules/dungeon-registry.js';
import {dungeonMap,dungeonPath} from '../src/rules/dungeon-map.js';
import {enterDungeon,beginDungeonAdvance,recordDungeonProgress,leaveDungeon} from '../src/rules/dungeon.js';
import {recruit} from '../src/rules/party.js';
import {bindHearth} from '../src/rules/hearthstone.js';
import {bankHere} from '../src/rules/inventory.js';
import {canTrainAt} from '../src/rules/city.js';
import {applyLevel20Boost} from '../src/rules/boost.js';
import {resourceView,beginGather,finishGather} from '../src/rules/professions.js';

test('expanded regions expose source herb and ore nodes with their actual skill gates',()=>{
 const s:Rules=createGame('采集',73,0,{raceId:2,classId:7});s.professions={herbalism:{skill:150,cap:225},mining:{skill:50,cap:150}};s.location='brill';
 const resources=resourceView(s);assert.ok(resources.some(r=>r.item===765&&r.required===1));assert.ok(resources.some(r=>r.item===2449&&r.required===15));
 const herb=resources.find(r=>r.item===765)!;const before=countItem(s,765);beginGather(s,herb.id);s.clock+=3000;finishGather(s);assert.ok(countItem(s,765)>before);assert.ok(!resourceView(s).find(r=>r.id===herb.id)?.available);
 s.location='astranaar';const tin=resourceView(s).find(r=>r.item===2771)!;assert.equal(tin.required,65);assert.equal(tin.available,false);assert.throws(()=>beginGather(s,tin.id));
 s.location='orgrimmar';assert.equal(resourceView(s).length,0);
});

const nodes:Rules=rawNodes,questLinks:Rules=rawLinks;

test('every legal race/class starts at its source homeland with local quests and low-level enemies',()=>{
 for(const race of raceDefinitions)for(const cls of classDefinitions.filter(c=>c.races.includes(race.id))){
  const s:Rules=createGame('家园',19,0,{raceId:race.id,classId:cls.id}),home=racialHomes[race.id as keyof typeof racialHomes];
  assert.equal(s.location,home.start);assert.equal(s.hearth,home.start);assert.deepEqual(s.visited,[home.start]);assert.equal(s.teamId,race.faction==='Horde'?67:469);
  const source=table('playercreateinfo').find((r:Rules)=>r.race===race.id&&r.class===cls.id);
  assert.equal(nodes[s.location].map,source.map);
  assert.ok(Math.hypot(nodes[s.location].x-source.position_x,nodes[s.location].y-source.position_y)<500);
  assert.ok(view(s).quests.some(q=>q.canAccept),`${race.name}/${cls.name}: opening quest`);
  assert.ok(monsterIdsAt(s.location).some(id=>creatures[id].MinLevel<=3),race.name);
 }
});

test('all world nodes are connected, and each 1-40 region has visible, finite coordinates',()=>{
 for(const n of Object.values(nodes) as any[]){assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y),n.id);const r=route('northshire',n.id);assert.ok(Number.isFinite(r.duration),n.id);}
 for(const region of worldRegions)assert.ok(Object.values(nodes).some((n:any)=>n.region===region.name));
 assert.ok(route('stormwind','orgrimmar').path.some((e:Rules)=>e.transport));
 const first=route('northshire','orgrimmar');first.path.length=0;assert.ok(route('northshire','orgrimmar').path.length,'cached routes cannot be mutated by callers');
});

test('both factions can use bank, inn, training and flight services in all six capitals',()=>{
 for(const city of capitals)for(const raceId of [1,2]){
  let s:Rules=createGame('主城',9,0,{raceId,classId:1});s.location=city.id;
  assert.equal(view(s).city?.id,city.id);assert.equal(bankHere(s),true);bindHearth(s);assert.equal(s.hearth,city.id);
  const trainer=view(s).city!.trainer;s.location=trainer;assert.ok(canTrainAt(s));
  s.location=city.id;assert.equal(view(s).city!.canInteract,true);
  s=act(s,{type:'unlockFlight'},s.wallAt);assert.ok(s.flightPoints.includes(city.id));
  const flight=view(s).flight!.routes[0];assert.ok(flight);s.flightPoints.push(flight.to);s.money=100000;
  s=act(s,{type:'fly',to:flight.to},s.wallAt);assert.equal(s.activity.to,flight.to);
  s=advance(s,s.activity.endsAt).state;assert.equal(s.location,flight.to);
 }
});

test('faction masks, actual quest rewards, and boosted faction capitals replace the shared route',()=>{
 for(const race of raceDefinitions){
  let s:Rules=createGame('任务',2,0,{raceId:race.id,classId:classDefinitions.find(c=>c.races.includes(race.id))!.id});
  assert.equal(questAvailable(s,{...quests[783],RequiredRaces:race.faction==='Alliance'?178:77}),false);
  const q:Rules|undefined=(view(s).quests as Rules[]).find((q:Rules)=>q.canAccept&&q.objectives.length===0&&!q.choices.length&&q.endLocations.includes(s.location));
  if(q){s=act(s,{type:'accept',id:q.id},0);const xp=s.xp;s=act(s,{type:'turnin',id:q.id},0);assert.equal(s.xp-xp,q.xp);assert.equal(s.completed[q.id],1);}
  applyLevel20Boost(s);assert.equal(s.location,racialHomes[race.id as keyof typeof racialHomes].capital);assert.equal(s.hearth,s.location);
 }
});

test('level-ten parties can prepare for early Horde dungeons with legal equipment',()=>{
 const s:Rules=createGame('怒焰小队',15,0,{raceId:2,classId:7});s.level=10;
 for(const id of ['warrior','priest','rogue','mage'])recruit(s,id);
 assert.equal(s.party.length,4);
 for(const c of s.party)for(const item of Object.values(c.equipment) as any[])assert.ok(canEquip(c,items[item.id]));
 s.location='ragefire-chasm';s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;enterDungeon(s,'ragefire-chasm');assert.equal(s.dungeon.id,'ragefire-chasm');
});

test('every expanded dungeon has finite enemy stats, connected encounters and resumable progression',()=>{
 assert.equal(Object.keys(dungeonDefinitions).length,14);
 for(const def of Object.values(dungeonDefinitions) as any[]){
  const s:Rules=createGame('副本',27,0);s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
  for(const id of ['warrior','priest','rogue','mage'])recruit(s,id);
  s.location=def.entrance;enterDungeon(s,def.id);
  const map=dungeonMap(def.id),route=dungeonRoute(def.id);
  for(const e of route){assert.ok(dungeonPath(def.id,'entrance',e.id).length);assert.ok(map.points[e.id].every(Number.isFinite));}
  for(const enemy of Object.values(s.dungeon.spawns) as any[])if(enemy){assert.ok(enemy.maxHp>0&&Number.isFinite(enemy.maxHp));assert.ok(Number.isFinite(enemy.low)&&Number.isFinite(enemy.high));}
  beginDungeonAdvance(s);assert.ok(s.combat,def.id);
  const current=route[s.dungeon.cursor];for(const e of s.combat.enemies)e.hp=0;
  s.lastCombat=s.combat;s.combat=null;recordDungeonProgress(s);
  assert.ok(s.dungeon.cleared[current.id]);
  leaveDungeon(s);const restored=JSON.parse(JSON.stringify(s));enterDungeon(restored,def.id);assert.ok(restored.dungeon.cleared[current.id]);
 }
});

test('adapted task scenes require their active quest and location, take time, and survive save reload',()=>{
 let s:Rules=createGame('任务场景',21,0);s.level=40;
 const q=Object.values(quests).find((q:any)=>q.SpecialFlags&2&&![62,76,155,1861,1920,434].includes(q.entry)&&questLinks[q.entry]?.ends.some((e:Rules)=>endpointNodes(e).length)) as any;
 s.quests[q.entry]={kills:{},event:false};if(q.SrcItemId)addItem(s,q.SrcItemId,q.SrcItemCount||1);
 const scene=questScenes(s,q.entry).find(e=>e.key==='event');assert.ok(scene);
 s.location=scene.locations[0];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 assert.throws(()=>act(s,{type:'questScene',id:q.entry,key:'unknown'},0));
 s=act(s,{type:'questScene',id:q.entry,key:'event'},0);assert.equal(s.quests[q.entry].event,false);
 const half=advance(s,15000).state;assert.equal(half.quests[q.entry].event,false);
 const resumed=advance(JSON.parse(JSON.stringify(half)),30000).state,whole=advance(s,30000).state;
 assert.deepEqual(resumed,whole);assert.equal(resumed.quests[q.entry].event,true);
 const cancelled=act(half,{type:'stop'},15000);assert.equal(advance(cancelled,30000).state.quests[q.entry].event,false);
});

test('task spells are never credited by ordinary kills',()=>{
 const q=Object.values(quests).find((q:any)=>q.ReqSpellCast1&&q.ReqCreatureOrGOId1>0) as any,s:Rules=createGame('任务法术',22,0);
 assert.ok(q);s.quests[q.entry]={kills:{},event:false};creditKill(s,q.ReqCreatureOrGOId1);
 assert.equal(questProgress(s,q.entry)!.objectives!.find(o=>o.id===q.ReqCreatureOrGOId1)!.count,0);
});

test('turning in a racial class quest grants its source-backed class abilities once',()=>{
 let s:Rules=createGame('战士任务',24,0,{raceId:1,classId:1});s.level=10;
 const q=quests[1665];s.quests[q.entry]={kills:{},event:true};
 for(let n=1;n<=4;n++){if(q['ReqItemId'+n])addItem(s,q['ReqItemId'+n],q['ReqItemCount'+n]);if(q['ReqCreatureOrGOId'+n])s.quests[q.entry].kills[q['ReqCreatureOrGOId'+n]]=q['ReqCreatureOrGOCount'+n];}
 s.location=questProgress(s,q.entry)!.endLocations[0];
 assert.ok(!s.learned.includes(71));s=act(s,{type:'turnin',id:q.entry},0);
 for(const id of [71,355,7386])assert.ok(s.learned.includes(id));
 assert.throws(()=>act(s,{type:'turnin',id:q.entry},0));
});

test('Alliance and Horde can enter each other’s city dungeons',()=>{
 for(const raceId of [1,2])for(const id of ['ragefire-chasm','stockades']){
  const s:Rules=createGame('跨阵营副本',25,0,{raceId,classId:1});s.level=26;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
  for(const role of ['priest','rogue','mage','hunter'])recruit(s,role);
  s.location=id;enterDungeon(s,id);assert.equal(s.dungeon.id,id);beginDungeonAdvance(s);assert.ok(s.combat);
 }
});
