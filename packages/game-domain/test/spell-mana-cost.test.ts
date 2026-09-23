import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {spellInfo,stats} from '../src/rules/character.js';
import {spells} from '../src/rules/catalog.js';

test('percentage spell costs follow class base mana across levels, gear and buffs',()=>{
 const c={...createGame('基础法力测试',1,0,{classId:8,raceId:1}),auras:[] as {spell:number;raidCurse:boolean;until:number}[]};
 const id=1953,sp=spells[id];assert.ok(sp.ManaCostPercentage>0);
 const baseMana=()=> (stats(c) as {baseMana:number}).baseMana;
 const expected=()=>Math.floor(sp.ManaCost+sp.ManaCostPerlevel*Math.max(0,c.level-sp.SpellLevel)+baseMana()*sp.ManaCostPercentage/100);
 for(const level of [20,40,60]){
  c.level=level;c.equipment={};c.auras=[];const cost=expected();
  assert.equal(spellInfo(c,id)!.mana,cost);
  const maximum=stats(c).maxMana;
  c.equipment={4:{id:14152}}; // Robe of the Archmage changes intellect, not base mana.
  assert.ok(stats(c).maxMana>maximum);assert.equal(spellInfo(c,id)!.mana,cost);
  c.auras=[{spell:19703,raidCurse:true,until:10000}];
  assert.equal(spellInfo(c,id)!.mana,Math.floor((sp.ManaCost+sp.ManaCostPerlevel*Math.max(0,c.level-sp.SpellLevel)+baseMana()*sp.ManaCostPercentage/100)*2));
 }
});

test('pet and escort spell costs do not inherit player class base mana',()=>{
 const c=createGame('非玩家基础法力',1,0,{classId:8,raceId:1});c.level=20;
 const id=1953,sp=spells[id],cost=Math.floor(sp.ManaCost+sp.ManaCostPerlevel*Math.max(0,c.level-sp.SpellLevel));
 for(const kind of ['petUnit','escortNpc'])assert.equal(spellInfo({...c,[kind]:true},id)!.mana,cost);
});
