import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view} from '../../../packages/game-domain/src/rules/engine.js';
import {ruleMatches} from '../../../packages/game-domain/src/rules/combat-strategy.js';

const after=value=>({spell:133,condition:'combatTimeAbove',value,enabled:true});

test('combat time above is strictly greater and resets for each encounter',()=>{
 const s=createGame('开战时间',12,0),rule=after(5);
 s.clock=20000;
 assert.equal(ruleMatches(s,s,null,rule),false);
 for(const combat of [{startedAt:10000},{startedAt:7000,pull:{startsAt:10000}}]){
  s.combat=combat;
  for(const [at,expected] of [[7000,false],[10000,false],[14999,false],[15000,false],[15001,true]]){
   s.clock=at;assert.equal(ruleMatches(s,s,null,rule),expected);
  }
 }
 s.combat={startedAt:s.clock};
 assert.equal(ruleMatches(s,s,null,rule),false);
 assert.equal(ruleMatches(s,s,null,after(0)),false);
 s.clock+=1;
 assert.equal(ruleMatches(s,s,null,after(0)),true);
});

test('combat time above saves as primary or additional condition with validated thresholds',()=>{
 const s=createGame('时间策略保存',12,0);
 const rules=[after(5),{...after(0),condition:'always',and:[{condition:'combatTimeAbove',value:10}]}];
 const saved=JSON.parse(JSON.stringify(act(s,{type:'strategy',rules},0)));
 assert.deepEqual(saved.rules,rules);
 assert.deepEqual(view(saved).strategyMembers[0].rules,rules);
 saved.combat={startedAt:0};saved.clock=10000;
 assert.equal(ruleMatches(saved,saved,null,saved.rules[1]),false);
 saved.clock++;
 assert.equal(ruleMatches(saved,saved,null,saved.rules[1]),true);
 for(const value of [-1,101,NaN,Infinity]){
  assert.throws(()=>act(s,{type:'strategy',rules:[after(value)]},0),/施法条件或阈值无效/);
 }
});
