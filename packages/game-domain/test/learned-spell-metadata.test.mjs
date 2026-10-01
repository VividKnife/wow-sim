import test from 'node:test';
import assert from 'node:assert/strict';
import {knownRank} from '../src/rules/character.js';
import {spells,spellChain,classAbilities} from '../src/rules/catalog.js';

const reference=(actor,first)=>actor.learned.filter(id=>spells[id]&&
 ((spellChain[id]?.first_spell||id)===first||spells[id].SpellName===spells[first]?.SpellName))
 .sort((a,b)=>spells[b].SpellLevel-spells[a].SpellLevel)[0]||null;

test('rank index preserves chain/name matching, highest rank and learned-order ties across classes',()=>{
 for(const abilities of Object.values(classAbilities)){
  const learned=[...new Set(abilities.map(a=>a.spellId))];
  const actor={learned};
  const roots=[...new Set([...learned,...learned.map(id=>spellChain[id]?.first_spell),-1].filter(id=>id!==undefined))];
  for(const first of roots)assert.equal(knownRank(actor,first),reference(actor,first),String(first));
  actor.learned.reverse();
  for(const first of roots)assert.equal(knownRank(actor,first),reference(actor,first),`reversed ${first}`);
 }
});

test('rank index follows in-place learning, unlearning, replacement and JSON restoration',()=>{
 const actor={learned:[133]};
 assert.equal(knownRank(actor,133),133);
 actor.learned.push(143);assert.equal(knownRank(actor,133),143);
 actor.learned[1]=145;assert.equal(knownRank(actor,133),145);
 actor.learned.splice(1,1);assert.equal(knownRank(actor,133),133);
 actor.learned=[116];assert.equal(knownRank(actor,133),null);
 actor.learned.push(99999999);assert.equal(knownRank(actor,99999999),null);
 assert.deepEqual(actor,JSON.parse(JSON.stringify(actor)));
 assert.equal(knownRank(JSON.parse(JSON.stringify(actor)),116),116);
});

test('environment passives follow learned edits while form and effect expiry remain live',async()=>{
 const {environmentModifiers}=await import('../src/rules/class-environment.js');
 const actor={learned:[],raceId:1,time:0,form:null,environmentBuffs:[]};
 assert.equal(environmentModifiers(actor).safeFall,0);
 actor.learned.push(1860);assert.equal(environmentModifiers(actor).safeFall,17);
 actor.learned[0]=20719;assert.equal(environmentModifiers(actor).safeFall,0);
 actor.form='cat';assert.equal(environmentModifiers(actor).safeFall,17);
 actor.form='aquatic';assert.equal(environmentModifiers(actor).waterBreathing,true);
 actor.environmentBuffs.push({spell:546,until:100});
 assert.equal(environmentModifiers(actor,99).waterWalk,true);
 assert.equal(environmentModifiers(actor,100).waterWalk,false);
 actor.learned.length=0;actor.form=null;
 assert.equal(environmentModifiers(actor).safeFall,0);
 assert.equal(environmentModifiers(actor).waterBreathing,false);
});
