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

test('classic max-rank healing costs and cost-reduction talents match pinned data',()=>{
 for(const [classId,ids] of [[5,[[25314,710],[10917,380],[25315,410],[10961,1030]]],[2,[[25292,660],[19943,140]]],[7,[[25357,620],[10468,380],[10623,405]]],[11,[[25297,800],[9858,880],[25299,360]]]] as [number,number[][]][]){
  const c=createGame('治疗耗蓝',1,0,{classId,raceId:classId===7?2:classId===11?4:1});c.level=60;c.talents={};
  for(const [id,cost] of ids)assert.equal(spellInfo(c,id)!.mana,cost);
 }
 for(const [classId,talent,rank,id,base,fraction] of [[5,408,3,25314,710,.85],[7,593,5,25357,620,.95],[11,843,5,25297,800,.9],[11,783,3,25299,360,.91]]){
  const c=createGame('治疗减耗',1,0,{classId,raceId:classId===7?2:classId===11?4:1});c.level=60;c.talents={[talent]:rank};
  assert.equal(spellInfo(c,id)!.mana,Math.floor(base*fraction));
 }
});
