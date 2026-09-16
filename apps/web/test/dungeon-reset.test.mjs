import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view,advance} from '../lib/game/engine.js';
function group(){let s=createGame('重置测试',283,0);s.level=20;for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);s.location='deadmines';return s;}
test('leaving and returning preserves a run; explicit reset generates a new run while keeping earned progress',()=>{
 let s=act(group(),{type:'enterDungeon'},0);const id=s.dungeon.runId;s.dungeon.cursor=2;s.dungeon.defeated[123]=true;
 s=act(s,{type:'leaveDungeon'},0);s=act(s,{type:'enterDungeon'},0);assert.equal(s.dungeon.runId,id);assert.equal(s.dungeon.cursor,2);
 assert.throws(()=>act(s,{type:'resetDungeon'},0),/离开/);
 s=act(s,{type:'leaveDungeon'},0);const earned=JSON.stringify({bag:s.bag,money:s.money,quests:s.quests,party:s.party});
 assert.equal(view(s).dungeon.canReset,true);s=act(s,{type:'resetDungeon'},0);assert.equal(s.dungeonSave,undefined);
 assert.equal(JSON.stringify({bag:s.bag,money:s.money,quests:s.quests,party:s.party}),earned);
 s=act(s,{type:'enterDungeon'},0);assert.notEqual(s.dungeon.runId,id);assert.equal(s.dungeon.cursor,0);assert.deepEqual(s.dungeon.defeated,{});
});
test('five new instances per hour; reentry does not consume a new slot and wall time releases it',()=>{
 let s=group();for(let i=0;i<5;i++){s=act(s,{type:'enterDungeon'},0);s=act(s,{type:'leaveDungeon'},0);if(i<4)s=act(s,{type:'resetDungeon'},0);}
 s=act(s,{type:'enterDungeon'},0);s=act(s,{type:'leaveDungeon'},0);s=act(s,{type:'resetDungeon'},0);
 assert.equal(view(s).dungeon.canEnter,false);assert.throws(()=>act(s,{type:'enterDungeon'},0),/每小时/);
 let step;do{step=advance(s,3600000);s=step.state;}while(!step.complete);s=act(s,{type:'enterDungeon'},s.wallAt);assert.equal(s.dungeon.cursor,0);
});
test('reset cannot interrupt combat, travel or an escort and requires saved progress',()=>{
 let s=group();assert.throws(()=>act(s,{type:'resetDungeon'},0));s=act(s,{type:'enterDungeon'},0);s=act(s,{type:'leaveDungeon'},0);
 for(const patch of [{combat:{}},{activity:{type:'travel',endsAt:10000}},{escort:{}}])assert.throws(()=>act({...s,...patch},{type:'resetDungeon'},0));
});

test('a dead leader cannot reset a saved route even after selecting rest',()=>{
 let s=act(group(),{type:'enterDungeon'},0);s=act(s,{type:'leaveDungeon'},0);s.hp=0;s=act(s,{type:'rest'},0);
 assert.equal(view(s).dungeon.canReset,false);
 assert.throws(()=>act(s,{type:'resetDungeon'},0));
});
