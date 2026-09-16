import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,questProgress} from '../../../packages/game-domain/src/rules/engine.js';
import {addItem,countItem,bagCapacity} from '../../../packages/game-domain/src/rules/character.js';

// Pinned core Player::AddQuest consumes an item questgiver unless it is also
// a required objective or the quest's source item. These are real catalog rows.
test('accepting an item quest consumes the starter and creates the required replacement',()=>{
 let s=createGame('任务信件',44,0);s.level=20;addItem(s,1307);
 s=act(s,{type:'accept',id:123},0);
 assert.equal(countItem(s,1307),0);assert.equal(countItem(s,2223),1);
 assert.ok(questProgress(s,123).complete);
 s=act(s,{type:'abandon',id:123},0);assert.equal(countItem(s,2223),0);
 assert.throws(()=>act(s,{type:'accept',id:123},0),/无法接受/);
});

test('treasure map starter is consumed while the VanCleef letter remains for delivery',()=>{
 let s=createGame('藏宝图',44,0);s.level=20;addItem(s,1357);addItem(s,2874);
 s=act(s,{type:'accept',id:136},0);assert.equal(countItem(s,1357),0);
 s=act(s,{type:'accept',id:373},0);assert.equal(countItem(s,2874),1);
 s.location='stormwind';const q=questProgress(s,373);s.location=q.endLocations[0];
 s=act(s,{type:'turnin',id:373},0);assert.equal(countItem(s,2874),0);
});

test('full inventory and quest log rejection preserve the starter atomically',()=>{
 let s=createGame('满包信件',44,0);s.level=20;addItem(s,1307);
 while(s.bag.length<bagCapacity(s))addItem(s,35);
 const before=structuredClone(s);
 assert.throws(()=>act(s,{type:'accept',id:123},0),/背包/);assert.deepEqual(s,before);
 const fullLog=structuredClone(before);fullLog.quests=Object.fromEntries(Array.from({length:20},(_,i)=>[10000+i,{kills:{}}]));
 const original=structuredClone(fullLog);assert.throws(()=>act(fullLog,{type:'accept',id:123},0),/日志已满/);assert.deepEqual(fullLog,original);
});
