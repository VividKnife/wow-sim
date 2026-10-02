import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act} from '../src/rules/engine.js';
import {quests} from '../src/rules/catalog.js';
import {addItem} from '../src/rules/character.js';
import {isLowLevelQuest} from '../../sim-core/src/quest-level.js';
import {validateRuleAction} from '../../protocol/src/rule-action.ts';
import {controllerAction} from '../src/controller-actions.ts';

const setup=()=>{const s=createGame('清理任务',37,0);s.level=60;for(const id of [166,168,214])s.quests[id]={kills:{},event:false};return s;};
test('green threshold matches the existing five-level marker',()=>{
 assert.equal(isLowLevelQuest(20,15),true);assert.equal(isLowLevelQuest(20,16),false);
});
test('only confirmed quests are abandoned, including complete quests and their obsolete items',()=>{
 const s=setup();addItem(s,3637,1);
 const command={type:'abandonLowLevelQuests',ids:[166,168]};validateRuleAction(command);
 const result=act(s,command,0);
 assert.deepEqual(Object.keys(result.quests),['214']);
 assert.ok(!result.bag.some(i=>i.id===3637));assert.equal(result.completed[166],undefined);
});
test('invalid or stale batches are rejected before removing any quest',()=>{
 const s=setup();s.level=quests[166].QuestLevel+4;
 for(const ids of [[],[168,166],[166,166],[168,999999],[168,'166'],null]){
  const before=structuredClone(s);
  assert.throws(()=>act(s,{type:'abandonLowLevelQuests',ids},0),/重新确认/);
  assert.deepEqual(s,before);
 }
});
test('a member batch only changes the requesting participant',()=>{
 let s=setup();const member=setup();member.id='member';s.party=[member];s.dungeon={id:'deadmines'};
 const controllers=[{actorId:s.id,accountId:'leader'},{actorId:member.id,accountId:'member'}];
 const action=controllerAction(s,controllers,controllers[1],{kind:'action',action:{type:'abandonLowLevelQuests',ids:[166,168]}});
 s=act(s,action,0,{actorId:member.id});
 assert.deepEqual(Object.keys(s.quests),['166','168','214']);
 assert.deepEqual(Object.keys(s.party[0].quests),['214']);
});
