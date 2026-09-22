import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,view,act} from '../../../packages/game-domain/src/rules/engine.js';
import {talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {partyRecommendation} from '../lib/party-recommendation.js';
function hero(classId,tree){const s=createGame('队长',123,0,{classId,raceId:classId===11?4:classId===7?2:1});s.level=18;s.money=300000;if(tree){const t=Object.values(talents).find(t=>t.classId===classId&&t.tree===tree);s.talents[t.id]=1;}return s;}
function recommend(s,replaceId){return partyRecommendation(s,view(s),replaceId);}
test('talent-based tank, healer and damage builds recommend the remaining four slots',()=>{
 for(const [classId,tree,role,target]of [[1,163,'tank',{tank:0,healer:1,dps:3}],[5,202,'healer',{tank:1,healer:0,dps:3}],[5,203,'dps',{tank:1,healer:1,dps:2}],[2,383,'tank',{tank:0,healer:1,dps:3}],[7,262,'healer',{tank:1,healer:0,dps:3}]]){
  const plan=recommend(hero(classId,tree));assert.equal(plan.playerRole,role);assert.deepEqual(plan.companionTarget,target);assert.match(plan.basis,/天赋/);
 }
});
test('explicit strategy responsibilities and bear form agree with combat role inference',()=>{
 const s=hero(11,281);s.form='bear';assert.equal(recommend(s).playerRole,'tank');s.form='cat';assert.equal(recommend(s).playerRole,'dps');s.strategyPolicy={role:'tank'};assert.equal(recommend(s).playerRole,'tank');assert.equal(recommend(s).basis,'已指定策略职责');
});
test('healer recruitment immediately updates deficits and candidate defaults',()=>{
 let s=hero(1,163);assert.equal(recommend(s).candidates.find(c=>c.id==='priest').preferredRole,'healer');
 s=act(s,{type:'recruit',id:'priest',role:'healer'},0);const plan=recommend(s);
 assert.deepEqual(plan.missing,{tank:0,healer:0,dps:3});assert.equal(plan.candidates.find(c=>c.id==='priest').preferredRole,'ranged');assert.equal(plan.candidates.find(c=>c.id==='paladin').preferredRole,'melee');
});
test('a full balanced party only recommends the vacancy created by replacement',()=>{
 let s=hero(1,163);for(const [id,role]of [['priest','healer'],['mage','ranged'],['rogue','melee'],['hunter','ranged']])s=act(s,{type:'recruit',id,role},0);
 assert.equal(recommend(s).balanced,true);assert.ok(recommend(s).candidates.every(c=>c.recommendedRoles.length===0));
 const plan=recommend(s,s.party[0].id);assert.deepEqual(plan.missing,{tank:0,healer:1,dps:0});assert.equal(plan.balanced,false);assert.equal(plan.candidates[0].recommendedRoles[0],'healer');
});
test('oversubscribed and unspent builds are explained without imposing a composition',()=>{
 let s=hero(1);assert.equal(recommend(s).basis,'当前职业默认职责');for(let n=0;n<4;n++)s=act(s,{type:'recruit',id:'warrior',role:'tank'},0);
 const plan=recommend(s);assert.deepEqual(plan.counts,{tank:5,healer:0,dps:0});assert.equal(plan.balanced,false);assert.deepEqual(plan.missing,{tank:0,healer:1,dps:3});
});
