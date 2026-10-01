import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view} from '../src/rules/engine.js';
import {quests,questLinks,nodes,classDefinitions} from '../src/rules/catalog.js';
import {visibleQuestIds,questAvailable,atEndpoint,questProgress} from '../src/rules/quests.js';
import {questNavigation} from '../src/rules/navigation.js';
import {localInteractions} from '../src/rules/interactions.js';

// Independent exhaustive predicate is the old public visibility policy. It
// deliberately does not use the new indices or projection candidate selection.
function exhaustive(s){return Object.values(quests).filter(q=>s.quests[q.entry]||questAvailable(s,q)&&atEndpoint(s,q,'starts')).map(q=>q.entry);}
function check(s){assert.deepEqual(visibleQuestIds(s),exhaustive(s),`${s.location}/${s.classId}/${s.raceId}/${s.level}`);}
test('quest candidates match exhaustive public eligibility at every world location',()=>{
 const s=createGame('索引',37,0);s.level=60;
 for(const location of Object.keys(nodes)){s.location=location;check(s);}
});
test('all class/race starts, level gates, progress and waiting conditions remain dynamic',()=>{
 for(const cls of classDefinitions)for(const raceId of cls.races){
  const s=createGame('出生地',37,0,{classId:cls.id,raceId});
  for(const level of [1,10,30,60]){s.level=level;check(s);}
  const id=visibleQuestIds(s)[0];if(!id)continue;
  s.questWaits={[id]:500};check(s);assert.ok(!visibleQuestIds(s).includes(id));
  s.clock=500;check(s);assert.ok(visibleQuestIds(s).includes(id));
  s.completed[id]=1;check(s);
  s.quests[id]={kills:{},event:false};s.location='deadmines';check(s);assert.ok(visibleQuestIds(s).includes(id));
 }
});
test('carried quest starters are visible anywhere and disappear when removed',()=>{
 const starts=Object.entries(questLinks).flatMap(([id,links])=>(links.starts||[]).filter(e=>e.type==='item').map(e=>({quest:Number(id),item:e.id})));
 assert.ok(starts.length>0);
 const s=createGame('物品任务',37,0);s.level=60;s.location='deadmines';
 for(const {item,quest} of starts){
  s.bag.push({uid:`starter-${item}`,id:item,count:1});check(s);
  if(questAvailable(s,quests[quest]))assert.ok(visibleQuestIds(s).includes(quest));
  s.bag.pop();check(s);
 }
});
test('public details and NPC interaction ordering match exhaustive quest views',()=>{
 const s=createGame('任务细节',37,0);s.level=20;s.location='goldshire';
 s.quests[62]={kills:{},event:false};
 const all=Object.values(quests).map(q=>{const p=questProgress(s,q.entry);return {...p,navigation:questNavigation(s,p)};});
 const projected=view(s);
 assert.deepEqual(projected.quests,all.filter(q=>q.active||q.canAccept||q.canTurnIn));
 assert.deepEqual(projected.interactions,localInteractions(s,all));
});
