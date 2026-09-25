import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {gatherables} from '../../../packages/game-domain/src/rules/quests.js';

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
