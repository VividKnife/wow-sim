import test from 'node:test';
import assert from 'node:assert/strict';
import {createExperienceNotifications} from '../lib/experience-notifications.js';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import {gainXp} from '../../../packages/game-domain/src/rules/character.js';

test('experience notifications use awarded XP, including a reward that levels the player',()=>{
 const state=createGame('经验提示',42,0),consume=createExperienceNotifications(state),before=state.totals.xp;
 gainXp(state,state,5000);
 const rewards=consume(state);
 assert.ok(state.level>1);
 assert.equal(rewards.length,1);
 assert.equal(rewards[0].amount,state.totals.xp-before);
 assert.deepEqual(consume(state),[]);
});
test('loading history and switching characters do not replay rewards',()=>{
 const state={id:'a',logSequence:5,logs:[{id:5,kind:'xp',amount:30}]},consume=createExperienceNotifications(state);
 assert.deepEqual(consume(state),[]);
 assert.deepEqual(consume({...state,id:'b',logSequence:8,logs:[{id:8,kind:'xp',amount:40}]}),[]);
 assert.deepEqual(consume({...state,id:'b',logSequence:1,logs:[{id:1,kind:'xp',amount:50}]}),[]);
});
test('multiple kills retain each reward and ignore non-reward logs or zero XP',()=>{
 const consume=createExperienceNotifications({id:'a',logSequence:0});
 const logs=[{id:1,kind:'xp',amount:35},{id:2,kind:'loot'},{id:3,kind:'xp',amount:42},{id:4,kind:'xp',amount:0}];
 assert.deepEqual(consume({id:'a',logSequence:4,logs}),[logs[0],logs[2]]);
});
test('level cap produces no experience notification',()=>{
 const state=createGame('满级',42,0);state.level=60;
 const consume=createExperienceNotifications(state);
 gainXp(state,state,100);
 assert.deepEqual(consume(state),[]);
});
