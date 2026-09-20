import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {dungeonRoute,enterDungeon} from '../../../packages/game-domain/src/rules/dungeon.js';
import {dungeonView} from '../../../packages/game-domain/src/rules/dungeon-view.js';
import {dungeonMap,dungeonPath} from '../../../packages/game-domain/src/rules/dungeon-map.js';
import {addItem} from '../../../packages/game-domain/src/rules/character.js';
import {recruitForTest} from './support/party-fixture.mjs';

function group(id='stockades',seed=283){
 let s=createGame('路线测试',seed,0);s.level=30;
 for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);
 for(const c of [s,...s.party]){c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;}
 s.location=id;s.settings.autoLoot=true;enterDungeon(s,id);return s;
}
const send=(s,destination)=>act(s,{type:'dungeonNavigate',destination},s.wallAt);
const step=(s,ms=100)=>advance(s,s.wallAt+ms).state;
function win(s){
 for(const mob of s.combat.enemies){mob.hp=0;mob.rewarded=true;}
 s.combat.pull.startsAt=s.clock;s.combat.pull.engagedAt=s.clock;
 return step(s);
}
function finish(s){
 const visited=[];
 for(let i=0;i<1000&&s.dungeon.autoAdvance;i++){
  if(s.combat){if(visited.at(-1)!==s.combat.routeId)visited.push(s.combat.routeId);s=win(s);}
  else s=step(s,1000);
 }
 assert.equal(s.dungeon.autoAdvance,false,'route must settle');
 return {s,visited};
}

test('maps include every encounter, all bosses and reachable branches',()=>{
 for(const id of ['deadmines','stockades']){
  const route=dungeonRoute(id),map=dungeonMap(id);
  assert.equal(Object.keys(map.points).length,route.length+1);
  for(const e of route){
   assert.ok(dungeonPath(id,'entrance',e.id).length);assert.ok(map.points[e.id].every(Number.isFinite));
   const [x,y]=map.points[e.id];assert.ok(x>=0&&x<=map.width&&y>=0&&y<=map.height);
   assert.ok(map.floors.some(f=>f.id===map.floorByNode[e.id]&&f.image.startsWith('/maps/dungeons/')));
  }
  assert.equal(map.floors.length,id==='deadmines'?2:1);
  const s=group(id),before=structuredClone(s),v=dungeonView(s);
  assert.deepEqual(s,before);assert.equal(v.route.length,route.length);
  for(const e of v.route.filter(e=>e.kind==='boss'))assert.ok(e.bossIds.length);
 }
});

test('choosing a Stockades boss clears only its wing and stops after that boss',()=>{
 let s=send(group(),'stockades-35');
 const expected=dungeonPath('stockades','entrance','stockades-35').slice(1);
 const done=finish(s);s=done.s;
 assert.deepEqual(done.visited,expected);assert.ok(s.dungeon.cleared['stockades-35']);
 assert.equal(s.combat,null);assert.equal(s.dungeon.completedAt,undefined);
 assert.equal(s.dungeon.cleared['stockades-33'],undefined);
 assert.equal(dungeonView(s).progress,expected.length);
 s=step(s,30000);assert.equal(s.combat,null);
 assert.throws(()=>send(s,'stockades-35'),/已经清理/);
});

test('retargeting in combat preserves the fight, switches wings afterwards, and persists',()=>{
 let s=send(group(),'stockades-35'),battle=s.combat.id;
 s=send(s,'stockades-33');assert.equal(s.combat.id,battle);assert.equal(s.dungeon.destination,'stockades-33');
 const expected=dungeonPath('stockades',s.combat.routeId,'stockades-33');
 s=JSON.parse(JSON.stringify(s));const done=finish(s);
 assert.deepEqual(done.visited,expected);assert.equal(done.s.dungeon.cleared['stockades-35'],undefined);
 assert.ok(done.s.dungeon.cleared['stockades-33']);assert.equal(done.s.combat,null);
});

test('pause completes the current battle and allows choosing a new destination afterwards',()=>{
 let s=send(group(),'stockades-35');s=act(s,{type:'dungeonPause'},s.wallAt);s=win(s);
 assert.equal(s.combat,null);assert.equal(s.dungeon.autoAdvance,false);
 s=send(s,'stockades-30');const done=finish(s);
 assert.ok(done.s.dungeon.cleared['stockades-30']);assert.equal(done.s.dungeon.cleared['stockades-35'],undefined);
});

test('full clear after a boss detour covers every remaining encounter exactly once',()=>{
 let {s,visited}=finish(send(group(),'stockades-35'));
 const done=finish(send(s,'full')),all=[...visited,...done.visited];
 assert.equal(new Set(all).size,all.length,'cleared spawns never respawn');
 assert.ok(done.s.dungeon.completedAt);assert.equal(dungeonView(done.s).progress,dungeonRoute('stockades').length);
 for(const e of dungeonRoute('stockades'))assert.ok(done.s.dungeon.cleared[e.id]||done.s.dungeon.skipped[e.id]);
});

test('Deadmines target path includes boss gates, both Sneed phases, powder and cannon, but skips side bosses',()=>{
 const s=send(group('deadmines'),'dm-vancleef'),path=s.dungeon.path;
 for(const id of ['dm-rhahkzor','dm-sneed','dm-gilnid','dm-gunpowder','dm-cannon','dm-smite'])assert.ok(path.includes(id));
 for(const id of ['dm-miner-johnson','dm-cookie','dm-cove-side'])assert.ok(!path.includes(id));
 const done=finish(s);
 assert.ok(done.s.dungeon.defeatedBosses[643]);assert.ok(done.s.dungeon.interactions['dm-cannon']);
 assert.ok(done.s.dungeon.cleared['dm-vancleef']);assert.equal(done.s.dungeon.cleared['dm-cookie'],undefined);
 const cookie=finish(send(done.s,'dm-cookie'));
 assert.ok(cookie.s.dungeon.cleared['dm-cookie']);assert.equal(cookie.s.combat,null);
});

test('invalid and absent destinations are rejected without changing the run',()=>{
 const s=group('deadmines'),e=dungeonRoute('deadmines').find(e=>e.id==='dm-miner-johnson');
 for(const guid of e.sourceGuids)s.dungeon.spawns[guid]=null;
 const before=structuredClone(s);
 for(const destination of ['unknown','stockades-35',null,{},'dm-miner-johnson'])assert.throws(()=>send(s,destination));
 assert.deepEqual(s,before);assert.equal(dungeonView(s).route.find(r=>r.id===e.id).status,'absent');
});

test('task marks include kill objectives and boss quest drops and disappear at completion',()=>{
 const s=group('stockades');
 // Quell the Uprising: prisoners; The Stockade Riots: Bazil's head.
 s.quests[387]={kills:{},event:false};s.quests[391]={kills:{},event:false};
 let v=dungeonView(s);assert.ok(v.route.some(r=>r.kind==='trash'&&r.quests.some(q=>q.questId===387)));
 assert.ok(v.route.find(r=>r.id==='stockades-35').quests.some(q=>q.questId===391));
 addItem(s,2926);s.quests[387].kills={1706:10,1711:8,1715:8};v=dungeonView(s);
 assert.ok(v.route.every(r=>r.quests.length===0));
});

test('inventory interruption preserves a destination for explicit resume',()=>{
 let s=send(group(),'stockades-30');s.settings.autoLoot=false;s.pending=[{id:25,count:1,uid:'test-drop'}];s=win(s);
 assert.equal(s.dungeon.autoAdvance,false);assert.match(s.dungeon.advanceReason,/背包/);
 const destination=s.dungeon.destination,path=[...s.dungeon.path];s.pending=[];
 s=act(s,{type:'dungeonNext'},s.wallAt);assert.equal(s.dungeon.destination,destination);assert.deepEqual(s.dungeon.path,path);
 assert.ok(s.combat);
});

test('full clear returns to a manually skipped but present optional encounter',()=>{
 let s=group('deadmines');
 const optional=dungeonRoute('deadmines').find(e=>e.id==='dm-cove-side');
 s.dungeon.skipped[optional.id]=true;
 s=send(s,'full');assert.equal(s.dungeon.skipped[optional.id],undefined);
 assert.equal(dungeonView(s).route.find(r=>r.id===optional.id).status,'ahead');
});

test('changing destination during a cannon cast completes the real door interaction first',()=>{
 let s=send(group('deadmines'),'dm-vancleef');
 for(let i=0;i<600&&s.activity.type!=='dungeonCannon';i++)s=s.combat?win(s):step(s,1000);
 assert.equal(s.activity.type,'dungeonCannon');const end=s.activity.endsAt;
 s=send(s,'dm-cove-side');assert.equal(s.activity.endsAt,end);assert.equal(s.activity.type,'dungeonCannon');
 const done=finish(s);assert.ok(done.s.dungeon.interactions['dm-cannon']);assert.ok(done.s.dungeon.cleared['dm-cove-side']);
 assert.equal(done.s.dungeon.cleared['dm-vancleef'],undefined);
});
