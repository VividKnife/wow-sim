import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';
import {quests} from '../../../packages/game-domain/src/rules/catalog.js';
import {questAvailable} from '../../../packages/game-domain/src/rules/quests.js';

test('an Orc shaman starts in the Valley of Trials and cannot take the Alliance opening',()=>{
 let s=createGame('部落路线',773,0,{classId:7,raceId:2});
 assert.equal(s.location,'valley-of-trials');assert.equal(s.hearth,s.location);
 assert.equal(view(s).quests.find(q=>q.id===783)?.canAccept,false);
 assert.throws(()=>act(s,{type:'accept',id:783},0),/无法接受/);
 s=act(s,{type:'accept',id:4641},0);s=act(s,{type:'turnin',id:4641},0);
 assert.equal(s.completed[4641],1);assert.ok(s.xp>0);
});
test('faction, class and single-race quest masks all remain enforced',()=>{
 const shaman=createGame('限制测试',774,0,{classId:7,raceId:2}),base={...quests[783],entry:990001};
 for(const mask of [77,1])assert.equal(questAvailable(shaman,{...base,RequiredClasses:0,RequiredRaces:mask}),false);
 assert.equal(questAvailable(shaman,{...base,RequiredClasses:128,RequiredRaces:178}),false);
});
