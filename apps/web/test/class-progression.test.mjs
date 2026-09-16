import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../lib/game/engine.js';
import {canEquip,newCharacter,stats} from '../lib/game/character.js';
import {questAvailable} from '../lib/game/quests.js';
import {healthRegen} from '../lib/game/recovery.js';

const playableSamples=[
 [1,1],  // human warrior
 [2,3],  // dwarf paladin
 [3,2],  // orc hunter
 [4,5],  // undead rogue
 [5,4],  // night elf priest
 [7,6],  // tauren shaman
 [8,7],  // gnome mage
 [9,2],  // orc warlock
 [11,4], // night elf druid
];

test('every Classic class creates with a valid race and its own power resource',()=>{
 const expectedPower={1:'rage',2:'mana',3:'mana',4:'energy',5:'mana',7:'mana',8:'mana',9:'mana',11:'mana'};
 for(const [classId,raceId] of playableSamples){
  const s=createGame('职业测试',classId*100+raceId,0,{classId,raceId});
  assert.equal(s.classId,classId);
  assert.equal(s.raceId,raceId);
  assert.equal(s.power,expectedPower[classId]);
  assert.ok(s.learned.length>0,`class ${classId} has a starting skill`);
  assert.equal(s.hp,stats(s).maxHp);
  if(s.power==='mana')assert.equal(s.mana,stats(s).maxMana);
  if(s.power==='rage')assert.equal(s.rage,0);
  if(s.power==='energy')assert.equal(s.energy,100);
 }
});

test('character creation rejects unknown and non-playable race-class combinations',()=>{
 assert.throws(()=>createGame('非法职业',11,0,{classId:6,raceId:1}),/职业|class/i);
 assert.throws(()=>createGame('非法种族',13,0,{classId:8,raceId:9}),/种族|race/i);
 assert.throws(()=>createGame('阵营组合',17,0,{classId:2,raceId:2}),/组合|职业|种族/);
});

test('race-aware level stats and identity are exposed without changing mage defaults',()=>{
 const human=newCharacter('人类法师',8,1,1),gnome=newCharacter('侏儒法师',8,1,7);
 assert.equal(human.raceId,1);
 assert.equal(gnome.raceId,7);
 assert.notEqual(stats(human).int,stats(gnome).int);
 const fresh=createGame('新存档',19,0);
 const restored=advance(fresh,0).state,d=view(restored);
 assert.equal(restored.classId,8);
 assert.equal(restored.raceId,1);
 assert.equal(d.className,'法师');
 assert.equal(d.raceName,'人类');
 assert.deepEqual(Object.keys(d.resource).sort(),['max','name','value']);
});

test('equipment and quest masks use the character race and class bits',()=>{
 const orcWarrior=newCharacter('兽人战士',1,10,2);
 const humanMage=newCharacter('人类法师',8,10,1);
 const orcOnlyShirt={RequiredLevel:1,AllowableClass:-1,AllowableRace:2,RequiredSkill:0,class:4,subclass:0,InventoryType:4};
 assert.equal(canEquip(orcWarrior,orcOnlyShirt),true);
 assert.equal(canEquip(humanMage,orcOnlyShirt),false);
 const baseQuest={entry:990001,MinLevel:1,MaxLevel:20,SpecialFlags:0,PrevQuestId:0,NextQuestId:0,ExclusiveGroup:0,RequiredCondition:0};
 const state={...orcWarrior,clock:0,quests:{},completed:{},questWaits:{}};
 assert.equal(questAvailable(state,{...baseQuest,RequiredClasses:1,RequiredRaces:2}),true);
 assert.equal(questAvailable(state,{...baseQuest,RequiredClasses:128,RequiredRaces:1}),false);
});

test('training enforces support, class, level, previous rank, money, and trainer location',()=>{
 let shaman=createGame('萨满',71,0,{classId:7,raceId:2});
 shaman.level=6;shaman.money=100;
 assert.throws(()=>act({...shaman,location:'echo'},{type:'train',id:332},0),/训练师|地点/);
 assert.throws(()=>act({...shaman,level:5},{type:'train',id:332},0),/6 级/);
 assert.throws(()=>act({...shaman,learned:shaman.learned.filter(id=>id!==331)},{type:'train',id:332},0),/前一等级|前置/);
 assert.throws(()=>act({...shaman,money:99},{type:'train',id:332},0),/费用/);
 assert.ok(act(shaman,{type:'train',id:2484},0).learned.includes(2484));
 const mage=createGame('法师',73,0);mage.level=6;mage.money=100;
 assert.throws(()=>act(mage,{type:'train',id:332},0),/职业/);
 const warrior=createGame('跳级战士',75,0,{classId:1,raceId:1});warrior.level=20;warrior.money=10000;
 assert.throws(()=>act(warrior,{type:'train',id:285},0),/前一等级|前置/);
 shaman=act(shaman,{type:'train',id:332},0);
 assert.equal(shaman.money,0);
 assert.ok(shaman.learned.includes(332));
});

test('talent allocation enforces support, class, point budget, tier and prerequisites',()=>{
 const mage=createGame('天赋法师',79,0);mage.level=10;
 assert.equal(act(mage,{type:'talent',id:70},0).talents[70],1);
 assert.throws(()=>act(mage,{type:'talent',id:23},0),/投入 10 点/);
 assert.throws(()=>act(mage,{type:'talent',id:921},0),/职业/);
 const learned=act(mage,{type:'talent',id:26},0);
 assert.equal(learned.talents[26],1);
 assert.ok(learned.learned.includes(11069));
 assert.throws(()=>act(learned,{type:'talent',id:26},0),/天赋点/);
 const paladin=createGame('前置圣骑士',83,0,{classId:2,raceId:1});paladin.level=20;paladin.talents={1422:5,1630:3,1423:2};
 assert.throws(()=>act(paladin,{type:'talent',id:1424},0),/前置/);
});

test('talent reset is trainer-only, refunds points, removes grants, and escalates from 1g to 5g',()=>{
 let mage=createGame('洗点法师',89,0);mage.level=10;mage.money=60000;
 mage=act(mage,{type:'talent',id:26},0);
 assert.throws(()=>act({...mage,location:'echo'},{type:'resetTalents'},0),/训练师|地点/);
 mage=act(mage,{type:'resetTalents'},0);
 assert.deepEqual(mage.talents,{});
 assert.equal(mage.money,50000);
 assert.equal(mage.talentResetCount,1);
 assert.equal(mage.learned.includes(11069),false);
 const d=view(mage);
 assert.equal(d.talentResetCost,50000);
 assert.equal(d.canResetTalents,false);
});

test('view publishes current-class progression and explicit blocked reasons',()=>{
 const s=createGame('进度视图',97,0,{classId:7,raceId:2}),d=view(s);
 assert.equal(d.className,'萨满祭司');
 assert.equal(d.raceName,'兽人');
 assert.equal(d.faction,'Horde');
 assert.equal(d.creationOptions.classes.length,9);
 assert.equal(d.creationOptions.races.length,8);
 assert.equal(d.talentTrees.length,3);
 assert.ok(d.talentTrees.every(tree=>tree.classId===7));
 assert.ok(d.skills.length>0&&d.skills.every(skill=>skill.classId===7));
 assert.equal(d.skills.find(skill=>skill.spellId===2484).supported,true);
 assert.match(d.skills.find(skill=>skill.spellId===2484).blockedReason,/6 级/);
 const warrior=view(createGame('怒气视图',99,0,{classId:1,raceId:1}));
 assert.deepEqual([warrior.skills.find(skill=>skill.spellId===78).powerName,warrior.skills.find(skill=>skill.spellId===78).powerCost],['怒气',15]);
 assert.ok(d.talents.length>0&&d.talents.every(talent=>talent.classId===7));
 assert.equal(typeof d.talents[0].canLearn,'boolean');
});

test('all classes use the pinned core health regeneration formulas',()=>{
 const cases=[[1,1.26,-22.6],[2,.25,0],[3,.43,-5.5],[4,.84,-13],[5,.15,1.4],[7,.28,-3.6],[8,.11,1],[9,.12,1.5],[11,.11,1]];
 for(const [classId,factor,offset] of cases){
  const raceId=playableSamples.find(([id])=>id===classId)[1],c=newCharacter('恢复',classId,18,raceId);
  const expected=Math.floor(Math.max(0,stats(c).spi*factor+offset)*2);
  assert.doesNotThrow(()=>healthRegen(c),`class ${classId}`);
  assert.equal(healthRegen(c),expected,`class ${classId}`);
 }
});

test('a player paladin can use its learned class unlock to resurrect a companion',()=>{
 let s=createGame('救赎者',101,0,{classId:2,raceId:1});s.level=12;s.mana=stats(s).maxMana;
 s=act(s,{type:'train',id:7328},0);
 const target={...newCharacter('倒下的队友',5,12,1),id:'fallen',hp:0,mana:0};s.party=[target];
 s=act(s,{type:'resurrect',target:'fallen'},0);
 assert.equal(s.activity.caster,'player');
 assert.equal(s.activity.spell,7328);
 s=advance(s,s.activity.endsAt).state;
 assert.ok(s.party[0].hp>0);
});

test('recovery view offers resurrection from player paladins and shamans',()=>{
 for(const [classId,raceId,spellId] of [[2,1,7328],[7,2,2008]]){
  let s=createGame('复活视图',107+classId,0,{classId,raceId});s.level=12;s.money=1000;s.mana=stats(s).maxMana;
  s=act(s,{type:'train',id:spellId},0);s.party=[{...newCharacter('倒下者',5,12,1),id:'fallen',hp:0,mana:0}];
  const fallen=view(s).recovery.fallen.find(c=>c.id==='fallen');
  assert.equal(fallen.canResurrect,true,`class ${classId}`);
  assert.equal(fallen.reason,'');
 }
});
