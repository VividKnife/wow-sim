import test from 'node:test';
import assert from 'node:assert/strict';
import {highestSpellRanks,spellbookSkills} from '../lib/spell-ranks.js';
import {quickActions,quickActionChoices} from '../lib/classic-action-bar.js';

const skills=[
 {spellId:1,name:'火球术',nameEn:'Fireball',rank:'Rank 2',known:true},
 {spellId:2,name:'火球术',nameEn:'Fireball',rank:'Rank 10',known:true},
 {spellId:3,name:'火球术',nameEn:'Fireball',rank:'Rank 11',known:false,canTrain:true},
 {spellId:4,name:'传送：暴风城',rank:'',known:true},
 {spellId:5,name:'传送：铁炉堡',rank:'',known:true},
 {spellId:6,name:'躲闪',rank:'Passive',known:true},
];
const ids=entries=>entries.map(entry=>entry.spellId);
test('spellbook defaults to highest learned ranks and retains distinct utility and passive spells',()=>{
 assert.deepEqual(ids(spellbookSkills(skills)),[2,4,5,6]);
 assert.deepEqual(ids(spellbookSkills(skills,'全部')),[2,4,5,6]);
 assert.deepEqual(ids(spellbookSkills(skills,'可学习')),[3]);
 assert.deepEqual(ids(spellbookSkills(skills,'未学习')),[3]);
 assert.deepEqual(ids(highestSpellRanks([...skills].reverse())).sort(),[3,4,5,6]);
});
test('both quickbar editors show highest learned ranks even when unavailable; existing bindings still resolve',()=>{
 const s={id:'player',bag:[]};
 const d={skills,skillUses:Object.fromEntries(skills.map(skill=>[skill.spellId,{canUse:skill.spellId!==2}])),strategyMembers:[{id:'player',skills}]};
 for(const mode of ['peace','combat']){
  assert.deepEqual(quickActionChoices(s,d,mode).map(action=>action.key),['spell:2','spell:4','spell:5','spell:6']);
  assert.ok(quickActions(s,d,mode).some(action=>action.key==='spell:1'));
 }
});

test('learning Arcane Intellect upgrades saved bindings in both profiles and casts the new rank',async()=>{
 const {upgradeActionSlots}=await import('../lib/classic-action-bar.js');
 const s={id:'player',bag:[]};
 const d={skills:[
  {spellId:1459,name:'奥术智慧',nameEn:'Arcane Intellect',rank:'Rank 1',known:true},
  {spellId:1460,name:'奥术智慧',nameEn:'Arcane Intellect',rank:'Rank 2',known:false},
  {spellId:1461,name:'奥术智慧',nameEn:'Arcane Intellect',rank:'Rank 3',known:false},
 ],skillUses:{1459:{canUse:true},1460:{canUse:false,reason:'法力不足'}}};
 const saved=['spell:1459',null,'item:6948','spell:99999','spell:1459'];
 assert.deepEqual(upgradeActionSlots(saved,s,d),saved);
 d.skills[1].known=true;
 const upgraded=upgradeActionSlots(saved,s,d);
 assert.deepEqual(upgraded,['spell:1460',null,'item:6948','spell:99999','spell:1460']);
 assert.deepEqual(saved,['spell:1459',null,'item:6948','spell:99999','spell:1459']);
 for(const mode of ['peace','combat']){
  const action=quickActions(s,d,mode).find(action=>action.key===upgraded[0]);
  assert.equal(action.command.id,1460);
  assert.equal(action.canUse,false);
 }
 assert.deepEqual(upgradeActionSlots(JSON.parse(JSON.stringify(upgraded)),s,d),upgraded);
});
