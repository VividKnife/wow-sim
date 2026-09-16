import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,questProgress,view} from '../../../packages/game-domain/src/rules/engine.js';
import {countItem,addItem} from '../../../packages/game-domain/src/rules/character.js';

function travel(s,to){s=act(s,{type:'travel',to},s.wallAt);return advance(s,s.wallAt+s.activity.endsAt-s.clock).state;}
function apprentice(){let s=createGame('取水学徒',44,0);s.level=10;s=travel(s,'goldshire');s=act(s,{type:'accept',id:1860},s.wallAt);s=travel(s,'magetower');s=act(s,{type:'turnin',id:1860},s.wallAt);return s;}
test('Mirror Lake uses the original flask and two-second spell to create its quest sample',()=>{
 let s=apprentice();s=act(s,{type:'accept',id:1861},s.wallAt);assert.equal(countItem(s,7207),1);
 assert.throws(()=>act(s,{type:'useQuestItem',id:7207},s.wallAt),/明镜湖/);
 s=travel(s,'mirror');assert.equal(questProgress(s,1861).complete,false);assert.ok(view(s).questTools.some(t=>t.id===7207));
 s=act(s,{type:'useQuestItem',id:7207},s.wallAt);assert.equal(s.activity.endsAt-s.clock,2000);
 const start=s.wallAt;s=advance(s,start+1999).state;assert.equal(countItem(s,7206),0);s=advance(s,start+2000).state;
 assert.equal(countItem(s,7207),0);assert.equal(countItem(s,7206),1);assert.equal(questProgress(s,1861).complete,true);
 assert.throws(()=>act(s,{type:'useQuestItem',id:7207},s.wallAt));s=travel(s,'magetower');s=act(s,{type:'turnin',id:1861,choice:questProgress(s,1861).choices[0].id},s.wallAt);assert.equal(countItem(s,7206),0);assert.equal(s.completed[1861],1);
});
test('interrupting collection preserves flask and abandonment removes quest-specific items',()=>{
 let s=apprentice();s=act(s,{type:'accept',id:1861},s.wallAt);s=travel(s,'mirror');s=act(s,{type:'useQuestItem',id:7207},s.wallAt);s=act(s,{type:'stop'},s.wallAt+1000);s=advance(s,s.wallAt+3000).state;
 assert.equal(countItem(s,7207),1);assert.equal(countItem(s,7206),0);s=act(s,{type:'abandon',id:1861},s.wallAt);assert.equal(countItem(s,7207),0);
 s=travel(s,'magetower');s=act(s,{type:'accept',id:1861},s.wallAt);assert.equal(countItem(s,7207),1);
});
test('full bags reject source-item acceptance atomically instead of creating an unusable quest',()=>{
 let s=apprentice();while(s.bag.length<16)addItem(s,35);const before=structuredClone(s);
 assert.throws(()=>act(s,{type:'accept',id:1861},s.wallAt),/背包/);assert.deepEqual(s,before);
});
test('Silver Stream crates require a visit and consume distinct original spawn instances',()=>{
 let s=createGame('采集学徒',44,0);s.level=20;s.completed[1920]=1;s.location='magetower';s=act(s,{type:'accept',id:1921},0);
 assert.throws(()=>act(s,{type:'gather',id:271},0));s=travel(s,'silverstream');
 for(let n=0;n<6;n++){s=act(s,{type:'gather',id:271},s.wallAt);s=advance(s,s.wallAt+5000).state;}
 assert.equal(countItem(s,7249),6);assert.equal(Object.keys(s.objectRespawns).length,6);assert.throws(()=>act(s,{type:'gather',id:271},s.wallAt));
});
test('delivering robe materials consumes them and honors the original tailoring delay',()=>{
 let s=createGame('长袍奖励',44,0);s.level=20;s.completed[1920]=1;s.location='magetower';s=act(s,{type:'accept',id:1921},0);
 addItem(s,2589,10);addItem(s,7249,6);s=act(s,{type:'turnin',id:1921},0);assert.equal(countItem(s,2589),0);assert.equal(countItem(s,7249),0);
 assert.throws(()=>act(s,{type:'accept',id:1941},9499));s=act(s,{type:'accept',id:1941},9500);s=act(s,{type:'turnin',id:1941},9500);
 assert.equal(countItem(s,7509),1);assert.throws(()=>act(s,{type:'turnin',id:1941},9500));
});
