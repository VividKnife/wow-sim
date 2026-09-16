import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,questProgress} from '../../../packages/game-domain/src/rules/engine.js';

function travel(s,to){s=act(s,{type:'travel',to},s.wallAt);return advance(s,s.wallAt+s.activity.endsAt-s.clock).state;}
test('Fargodeep survey requires accepting the quest and actually entering the mine',()=>{
 let s=createGame('探矿',11,0);s.level=4;s=travel(s,'goldshire');s=act(s,{type:'accept',id:62},s.wallAt);
 assert.equal(questProgress(s,62).complete,false);s=travel(s,'fargodeep');assert.equal(questProgress(s,62).complete,true);
 assert.throws(()=>act(s,{type:'turnin',id:62},s.wallAt));s=travel(s,'goldshire');s=act(s,{type:'turnin',id:62},s.wallAt);assert.equal(s.completed[62],1);
});
test('visiting without the active quest gives no remote or retrospective exploration credit',()=>{
 let s=createGame('先游览',11,0);s.level=4;s=travel(s,'fargodeep');assert.equal(s.quests[62],undefined);
 s=travel(s,'goldshire');s=act(s,{type:'accept',id:62},s.wallAt);assert.equal(questProgress(s,62).complete,false);
});
