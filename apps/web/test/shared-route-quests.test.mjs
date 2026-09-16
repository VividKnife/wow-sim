import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view,questProgress} from '../../../packages/game-domain/src/rules/engine.js';
import {quests} from '../../../packages/game-domain/src/rules/catalog.js';
import {questAvailable} from '../../../packages/game-domain/src/rules/quests.js';

test('an Orc shaman can complete the explicitly adapted shared Northshire opening',()=>{
 let s=createGame('共享路线测试',773,0,{classId:7,raceId:2});
 const offered=view(s).quests.find(q=>q.id===783);
 assert.equal(offered?.canAccept,true);
 assert.equal(offered?.sharedRoute,true);
 s=act(s,{type:'accept',id:783},0);
 assert.equal(questProgress(s,783).complete,true);
 const before=s.xp;
 s=act(s,{type:'turnin',id:783},0);
 assert.equal(s.completed[783],1);
 assert.equal(s.xp-before,40,'the adapted route must grant its original quest reward');
});

test('shared-route adaptation never weakens class-specific or single-race requirements',()=>{
 const shaman=createGame('限制测试',774,0,{classId:7,raceId:2}),base={...quests[783],entry:990001};
 assert.equal(questAvailable(shaman,{...base,RequiredClasses:128,RequiredRaces:77}),false,'mage-only remains mage-only');
 assert.equal(questAvailable(shaman,{...base,RequiredClasses:0,RequiredRaces:1}),false,'human-only remains human-only');
});
