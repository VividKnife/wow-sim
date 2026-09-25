import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,view} from '../../../packages/game-domain/src/rules/engine.js';
import {items} from '../../../packages/game-domain/src/rules/catalog.js';
import {canEquip,addItem,bagCapacity,newCharacter} from '../../../packages/game-domain/src/rules/character.js';

test('recruitment retains starting proficiencies and never issues an unusable weapon',()=>{
 for(const level of [18,20,40]){
  let s=createGame('招募检查',2,0);s.level=level;
  for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);
  for(const c of s.party){
   for(const id of newCharacter('基础',c.classId,level,c.raceId).learned)assert.ok(c.learned.includes(id),`${c.classId}: lost starting spell ${id}`);
   for(const item of Object.values(c.equipment))assert.ok(canEquip(c,items[item.id]),`${c.classId}: unusable item ${item.id}`);
  }
 }
});

test('recruits match current level and bounded equipment; identity and gear persist after player growth',()=>{
 let s=createGame('队长',2,0);s.level=18;const candidates=view(s).candidates;assert.equal(candidates.length,9);
 for(const candidate of candidates.slice(0,4))s=recruitForTest(s,{type:'recruit',id:candidate.id},0);
 assert.equal(s.party.length,4);assert.equal(new Set(s.party.map(c=>c.id)).size,4);
 for(const c of s.party){assert.equal(c.level,18);assert.equal(c.hp,stats(c).maxHp);for(const item of Object.values(c.equipment)){assert.ok(canEquip(c,items[item.id]));assert.ok(items[item.id].ItemLevel<=25);assert.equal(item.issued,true);}}
 const saved=structuredClone(s.party);s.level=20;s=advance(s,5000).state;assert.deepEqual(s.party.map(c=>[c.id,c.level,c.equipment]),saved.map(c=>[c.id,c.level,c.equipment]));
 assert.throws(()=>recruitForTest(s,{type:'recruit',id:candidates[0].id},5000));
});
test('loot allocation moves exactly one real instance and preserves bind ownership',()=>{
 let s=createGame('分配',2,0);s.level=18;s=recruitForTest(s,{type:'recruit',id:'warrior'},0);addItem(s,1270);const item=s.bag.find(i=>i.id===1270);s=act(s,{type:'equip',uid:item.uid,target:s.party[0].id},0);
 assert.equal(s.party[0].equipment[15].uid,item.uid);assert.ok(!s.bag.some(i=>i.uid===item.uid));assert.equal(s.equipment[15],undefined);
 assert.throws(()=>act(s,{type:'equip',uid:item.uid,target:s.party[0].id},0));
});

test('party view exposes learned spell names and original icons without adding trainer offers',()=>{
 let s=createGame('技能展示',2,0);s.level=20;for(const id of ['warrior','priest','rogue'])s=recruitForTest(s,{type:'recruit',id},0);
 const d=view(s);assert.ok(d.combatSkills);
 for(const c of s.party)for(const id of c.learned){const skill=d.combatSkills.find(a=>a.spellId===id);assert.ok(skill?.icon);assert.match(skill.name,/[\u4e00-\u9fff]/);}
 assert.ok(!d.skills.some(a=>a.spellId===2054));
});

test('a two-handed weapon removes the offhand and prevents simultaneous shield equipment',()=>{
 let s=createGame('双手武器',2,0);s.level=18;s=recruitForTest(s,{type:'recruit',id:'warrior'},0);const target=s.party[0].id;assert.ok(s.party[0].equipment[17]);
 // This equipment-swap fixture represents a warrior who has learned Staves.
 s.party[0].learned.push(227);
 addItem(s,35);const staff=s.bag.find(i=>i.id===35);s=act(s,{type:'equip',uid:staff.uid,target},0);
 assert.equal(s.party[0].equipment[17],undefined);assert.equal(s.party[0].equipment[16].uid,staff.uid);
 addItem(s,1166);const shield=s.bag.find(i=>i.id===1166);assert.throws(()=>act(s,{type:'equip',uid:shield.uid,target},0),/双手/);
});

test('equipping a full throwing-weapon stack preserves count and instance identity in ranged slot',()=>{
 let s=createGame('投掷武器',2,0);s.level=18;s=recruitForTest(s,{type:'recruit',id:'rogue'},0);addItem(s,2947,200);const knives=s.bag.find(i=>i.id===2947);
 s=act(s,{type:'equip',uid:knives.uid,target:s.party[0].id},0);const equipped=s.party[0].equipment[18];
 assert.equal(equipped?.uid,knives.uid);assert.equal(equipped.count,200);assert.ok(!s.bag.some(i=>i.uid===knives.uid));
});

test('two-hand swaps need room for both displaced loot items and preserve their ownership',()=>{
 let s=createGame('装备空间',2,0);s.level=18;s=recruitForTest(s,{type:'recruit',id:'warrior'},0);const target=s.party[0].id;
 s.party[0].learned.push(227);
 for(const id of [25,3651]){addItem(s,id);s=act(s,{type:'equip',uid:s.bag.find(i=>i.id===id).uid,target},0);}
 const old=[s.party[0].equipment[16],s.party[0].equipment[17]];assert.equal(old[1].ownerId,target);addItem(s,35);const staff=s.bag.find(i=>i.id===35);
 while(s.bag.length<bagCapacity(s))addItem(s,35);
 const before=structuredClone(s);assert.throws(()=>act(s,{type:'equip',uid:staff.uid,target},0),/背包/);assert.deepEqual(s,before);
 s.bag.pop();s=act(s,{type:'equip',uid:staff.uid,target},0);
 for(const item of old)assert.deepEqual(s.bag.find(i=>i.uid===item.uid),item);
 assert.equal(s.bag.length,bagCapacity(s));
});
