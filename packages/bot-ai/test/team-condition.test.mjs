import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTeamCondition} from '../src/team-condition.js';

test('team conditions evaluate observable resources and never inspect encounter state',()=>{
 const view={clock:1000,target:{alive:true,health:{current:24,maximum:100},resource:{current:10,maximum:100}},source:{id:'any-boss',alive:true,effects:['enrage']},warnings:[]};
 Object.defineProperty(view,'encounter',{get(){throw new Error('private encounter accessed');}});
 assert.equal(compileTeamCondition({kind:'manual'})(view),false);
 const health=compileTeamCondition({kind:'healthBelow',fraction:.25});
 assert.equal(health(view),true);view.target.health.current=25;assert.equal(health(view),false);
 assert.equal(compileTeamCondition({kind:'resourceBelow',fraction:.25})(view),true);
 assert.equal(compileTeamCondition({kind:'effect',effect:'enrage'})(view),true);
 view.target.alive=false;assert.equal(health(view),false);
 view.target.alive=true;view.target.health.maximum=0;assert.equal(health(view),false);
});

test('warnings require a live source, announced time and matching observable mechanic',()=>{
 const condition=compileTeamCondition({kind:'warning',mechanic:'fear',withinMs:2000});
 const view={clock:1000,source:{id:'boss',alive:true},warnings:[{sourceId:'boss',mechanic:'fear',announcedAt:900,at:3000}]};
 assert.equal(condition(view),true);
 for(const patch of [{sourceId:'other'},{mechanic:'enrage'},{announcedAt:1001},{at:999},{at:3001},{at:NaN}]){
  assert.equal(condition({...view,warnings:[{...view.warnings[0],...patch}]}),false);
 }
 assert.equal(condition({...view,source:{id:'boss',alive:false}}),false);
 assert.equal(condition({...view,warnings:[]}),false);
});

test('compiled conditions are independent of later edits and reject unsafe definitions',()=>{
 const definition={kind:'healthBelow',fraction:.25},condition=compileTeamCondition(definition);definition.fraction=1;
 assert.equal(condition({target:{alive:true,health:{current:50,maximum:100}}}),false);
 for(const invalid of [null,[],{kind:'private-timer'},{kind:'healthBelow',fraction:NaN},{kind:'resourceBelow',fraction:2},{kind:'effect',effect:''},{kind:'manual',nextFear:1},{kind:'warning',mechanic:'fear',withinMs:Infinity}])assert.throws(()=>compileTeamCondition(invalid),TypeError);
});
