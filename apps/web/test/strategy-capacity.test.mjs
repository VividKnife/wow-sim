import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../../../packages/game-domain/src/rules/engine.js';
import {MAX_STRATEGY_RULES} from '../../../packages/sim-core/src/strategy-config.js';

const rule=(overrides={})=>({spell:133,condition:'always',value:0,enabled:true,...overrides});
const fullRules=()=>Array.from({length:MAX_STRATEGY_RULES},(_,i)=>rule({condition:'healthBelow',value:i}));

test('64 rules retain order and compound conditions in commands and client projections',()=>{
 const s=createGame('长策略',12,0),rules=fullRules();
 rules.at(-1).and=[{condition:'manaAbove',value:30}];
 const changed=act(s,{type:'strategy',rules},0);
 assert.deepEqual(changed.rules,rules);
 assert.deepEqual(view(JSON.parse(JSON.stringify(changed))).strategyMembers[0].rules,rules);
 assert.notDeepEqual(s.rules,rules,'command does not mutate its input save');
});

test('rule 64 executes after disabled and unmet rules instead of being truncated at 12',()=>{
 let s=createGame('末条执行',12,0);
 const rules=Array.from({length:MAX_STRATEGY_RULES-1},(_,i)=>rule({condition:'healthBelow',value:0,enabled:i%2===0}));
 rules.push(rule());
 s=act(s,{type:'strategy',rules},0);s=act(s,{type:'hunt',id:299},0);s=advance(s,200).state;
 assert.equal(s.cast.spell,133);
 assert.equal(s.rules.length,MAX_STRATEGY_RULES);
});

test('capacity and validation apply to the whole list, including disabled and last rules',()=>{
 const s=createGame('策略校验',12,0),before=structuredClone(s);
 assert.throws(()=>act(s,{type:'strategy',rules:[...fullRules(),rule({enabled:false})]},0),/最多允许 64 条/);
 for(const invalid of [rule({spell:2139}),rule({condition:'bad'}),rule({value:NaN}),rule({and:Array(4).fill({condition:'manaAbove',value:10})})]){
  const rules=fullRules();rules[MAX_STRATEGY_RULES-1]=invalid;
  assert.throws(()=>act(s,{type:'strategy',rules},0));
 }
 assert.deepEqual(s,before);
 assert.deepEqual(act(s,{type:'strategy',rules:[]},0).rules,[]);
});
