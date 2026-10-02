import {countItem,addItem} from '../../../packages/game-domain/src/rules/character.js';
import {quests,objectLocations,objectTemplates,objectLoot,objectSpawnsByNode} from '../../../packages/game-domain/src/rules/catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {gatherables,questGathering,questProgress} from '../../../packages/game-domain/src/rules/quests.js';

test('quest gathering completes a collection bar in three seconds',()=>{
 let state=createGame('采集进度',8,0);
 state.level=20;
 state.location='magetower';
 state=act(state,{type:'accept',id:1920},state.wallAt);
 const target=gatherables(state).find(object=>object.id===105174);
 assert.ok(target);
 state=act(state,{type:'gather',id:target.id},state.wallAt);
 assert.equal(state.activity.startedAt,state.clock);
 assert.equal(state.activity.endsAt-state.activity.startedAt,3000);
 const nearlyDone=advance(state,state.wallAt+2999).state;
 assert.equal(nearlyDone.activity.type,'gather');
 const done=advance(state,state.wallAt+3000).state;
 assert.notEqual(done.activity.target,target.id);
});

function spores(location='crossroads'){
 let s=createGame('孢子采集',8,0,{raceId:5});s.level=20;s.location='crossroads';
 s=act(s,{type:'accept',id:848},s.wallAt);s.location=location;return s;
}
function finish(s){return advance(s,s.wallAt+s.activity.endsAt-s.clock).state;}

test('Fungal Spores alternates three-second collection and ten-second search, then stops at four',()=>{
 let s=act(spores(),{type:'gather',id:3640},0);
 s=finish(s);
 assert.equal(countItem(s,5012),1);
 assert.equal(s.activity.target,null);
 const deadline=s.activity.endsAt;
 assert.equal(deadline-s.clock,10000);
 assert.ok(gatherables(s).some(o=>o.id===3640));
 s=advance(s,s.wallAt+9999).state;
 assert.equal(countItem(s,5012),1);
 assert.equal(s.activity.endsAt,deadline,'searching must not restart or award items early');
 for(let count=2;count<=4;count++){
  assert.equal(s.activity.endsAt-s.activity.startedAt,10000);
  s=finish(s);assert.equal(s.activity.target,3640);
  assert.equal(s.activity.endsAt-s.clock,3000);
  s=finish(s);assert.equal(countItem(s,5012),count);
 }
 assert.equal(s.activity.type,'idle');
 assert.equal(s.clock,42000);
 assert.equal(questProgress(s,848).complete,true);
 assert.ok(!gatherables(s).some(o=>o.id===3640));
});

test('stopping a search cancels automatic collection and restarting collects normally',()=>{
 let s=finish(act(spores(),{type:'gather',id:3640},0));
 s=act(s,{type:'stop'},s.wallAt+5000);
 s=advance(s,s.wallAt+20000).state;
 assert.equal(s.activity.type,'idle');assert.equal(countItem(s,5012),1);
 s=act(s,{type:'gather',id:3640},s.wallAt);
 assert.equal(s.activity.target,3640);assert.equal(s.activity.endsAt-s.clock,3000);
 s=finish(s);assert.equal(countItem(s,5012),2);
 assert.equal(s.activity.target,null);assert.equal(s.activity.endsAt-s.clock,10000);
});

test('Fungal Spores uses the same search time regardless of local mushroom spawn count',()=>{
 for(const location of ['forgotten-pools','lushwater','ratchet']){
  let s=act(spores(location),{type:'gather',id:3640},0);
  s=advance(s,42000).state;
  assert.equal(countItem(s,5012),4,location);assert.equal(s.activity.type,'idle');
 }
});

test('all ordinary quest gathering targets are available without respawn cooldowns',t=>{
 const s=createGame('采集巡检',8,0);let checked=0;const questIds=new Set(),objectsByItem=new Map();
 for(const id of Object.keys(objectLocations))for(const row of objectLoot[objectTemplates[id]?.data1]||[]){
  if(!objectsByItem.has(row.item))objectsByItem.set(row.item,new Set());
  objectsByItem.get(row.item).add(+id);
 }
 for(const q of Object.values(quests)){
  s.quests={[q.entry]:{kills:{}}};s.bag=[];s.pending=[];
  const wanted=new Set([1,2,3,4].flatMap(n=>[q['ReqItemId'+n],q['ReqSourceId'+n]]).filter(Boolean));
  const targets=new Set([1,2,3,4].map(n=>-q['ReqCreatureOrGOId'+n]).filter(id=>id>0));
  for(const item of wanted)for(const id of objectsByItem.get(item)||[])targets.add(id);
  for(const id of targets){
   const locations=objectLocations[id]||[];
   // Cover each target in its sparsest location, including single-spawn sources.
   const location=locations.filter(node=>objectSpawnsByNode[node+':'+id]?.length).sort((a,b)=>objectSpawnsByNode[a+':'+id].length-objectSpawnsByNode[b+':'+id].length)[0];
   if(location){
    s.location=location;
    const entry=gatherables(s).find(o=>o.id===+id);if(!entry)continue;
    const next=questGathering(s,q.entry,+id);
    assert.equal(next.pending,true);assert.equal(next.available.id,id);
    checked++;questIds.add(q.entry);
   }
  }
 }
 assert.ok(checked>100);t.diagnostic(`Checked ${checked} quest/object/location combinations across ${questIds.size} quests`);
});

test('pending quest loot ends the chain instead of waiting forever with a full bag',()=>{
 let s=spores();while(s.bag.length<16)addItem(s,35);
 s=act(s,{type:'gather',id:3640},0);
 for(let events=0;events<8&&s.activity.type==='gather';events++)s=finish(s);
 assert.equal(s.activity.type,'idle');assert.equal(countItem(s,5012),0);
 assert.equal(s.pending.filter(i=>i.id===5012).reduce((sum,i)=>sum+i.count,0),4);
});
