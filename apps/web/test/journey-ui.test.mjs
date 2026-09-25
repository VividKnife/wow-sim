import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJourneyState,journeySnapshot} from './browser/journey-ui-state.mjs';
import {nextQuestAction} from './browser/journey-ui-actions.mjs';
import {act,advance} from '../../../packages/game-domain/src/rules/engine.js';
test('real quest loop accepts, travels, auto-stops at ten kills, returns and rewards once',()=>{
 let state=createJourneyState();
 const snapshot=()=>journeySnapshot(state);
 const quest=()=>snapshot().view.quests.find(q=>q.id===7);
 const perform=()=>{const action=nextQuestAction(state,quest(),snapshot().view.map);assert.ok(action.command,action.label);state=act(state,action.command,state.wallAt);};
 assert.equal(quest().canAccept,true);perform();assert.equal(quest().active,true);
 perform();assert.equal(state.activity.type,'mount');
 assert.equal(nextQuestAction(state,quest(),[]).command,undefined);
 state=advance(state,state.wallAt+120000).state;assert.equal(state.location,'northwood');
 perform();state=advance(state,state.wallAt+300000).state;
 assert.equal(quest().complete,true);assert.equal(quest().objectives[0].count,10);assert.equal(state.activity.type,'idle');assert.equal(state.combat,null);assert.ok(state.lastCombat);
 perform();state=advance(state,state.wallAt+120000).state;assert.equal(state.location,'northshire');
 const before={xp:state.totals.xp,money:state.money};perform();assert.equal(state.totals.xp-before.xp,17);assert.equal(state.money-before.money,25);assert.equal(quest().completed,true);assert.equal(nextQuestAction(state,quest(),[]).command,undefined);
 assert.throws(()=>act(state,{type:'turnin',id:7},state.wallAt),/任务未完成/);
 assert.throws(()=>act(state,{type:'travel',to:state.location},state.wallAt),/已经在这里/);
});
test('combat stop and unsupported reward states do not silently submit',()=>{
 const q={active:true,complete:true,canTurnIn:true,choices:[{id:1}],id:2};
 assert.equal(nextQuestAction({hp:1,activity:{type:'idle'}},q,[]).command,undefined);
 assert.equal(nextQuestAction({hp:1,combat:{},activity:{type:'hunt'}},q,[]).command.type,'stop');
 assert.equal(nextQuestAction({hp:1,combat:{},activity:{type:'idle'}},q,[]).command,null);
 assert.equal(nextQuestAction({hp:0,activity:{type:'dead'}},q,[]).command.type,'revive');
});
