import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,view} from '../lib/game/engine.js';
import {stats} from '../lib/game/character.js';
import {petSpellTick} from '../lib/game/class-spell-effects.js';
import {spells} from '../lib/game/catalog.js';
const game=()=>{const s=createGame('trainer',7,0,{classId:3,raceId:2});s.level=60;s.money=10000000;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];return s;};
test('public trainer to tame to pet training preserves actual acquired Growl without unlocking wild skills',()=>{
 let s=game();for(const id of[1515,883,5149,1853])if(!s.learned.includes(id))s=act(s,{type:'train',id},s.wallAt);
 s=act(s,{type:'cast',id:1515,target:'npc:299'},s.wallAt);s=advance(s,s.wallAt+25000).state;assert.equal(s.pet.entry,299);assert.ok(s.pet.availableSkills.includes(2649));assert.ok(!s.pet.learned.includes(2649));assert.ok(!s.pet.availableSkills.includes(24597),'wild Furious Howl was never acquired');
 s.activity={type:'idle'};s.combat=null;s=act(s,{type:'petCommand',command:'train',spellId:2649},s.wallAt);assert.ok(s.pet.learned.includes(2649));assert.ok(s.hunterPet.learned.includes(2649));
});
test('pet trainer exposes sourced paid teaching wrappers and updates an existing eligible pet',()=>{
 let s=game();s=act(s,{type:'train',id:5149},0);const row=view(s).skills.find(a=>a.petSpellId===4187);assert.ok(row,'Great Stamina source trainer row');assert.ok(row.costCopper>0);s.hunterPet={entry:299,level:2};s.learned.push(883);s=act(s,{type:'cast',id:883},0);s=advance(s,s.wallAt+5000).state;const money=s.money;s=act(s,{type:'train',id:row.spellId},s.wallAt);assert.equal(s.money,money-row.costCopper);assert.ok(s.pet.availableSkills.includes(4187));assert.ok(!s.pet.learned.includes(4187));assert.throws(()=>act(s,{type:'petCommand',command:'train',spellId:4187},s.wallAt),/训练点/);
});

test('using a tamed beast source skill teaches the hunter and survives abandoning it',()=>{
 let s=game();for(const id of[1515,883,5149])if(!s.learned.includes(id))s=act(s,{type:'train',id},0);s.location='goldshire';s=act(s,{type:'cast',id:1515,target:'npc:30'},0);s=advance(s,25000).state;assert.equal(s.pet.entry,30);assert.ok(s.pet.learned.includes(17253));const teaching=s.pet.teachSpells[17253];assert.ok(teaching);assert.ok(!s.learned.includes(teaching));
 const target={id:'practice',hp:100000,armor:0,level:2,position:0,positionY:0,threat:{}};s.pet.position=0;s.pet.positionY=0;
 for(let n=0;n<200&&!s.learned.includes(teaching);n++){s.clock+=5000;s.pet.focus=100;petSpellTick(s,s.pet,s,target,[s,s.pet],{damage:(_s,_p,t,value)=>{t.hp-=value;return value;}});}
 assert.ok(s.learned.includes(teaching),'actual Bite uses must teach its source wrapper');s.activity={type:'idle'};s.combat=null;s=act(s,{type:'petCommand',command:'abandon'},s.wallAt);s.location='northshire';s=act(s,{type:'cast',id:1515,target:'npc:299'},s.wallAt);s=advance(s,s.wallAt+25000).state;assert.equal(s.pet.entry,299);assert.ok(s.pet.availableSkills.includes(17253));assert.ok(!s.pet.learned.includes(17253));assert.ok(!s.pet.availableSkills.includes(16827),'Claw was never acquired and wolves cannot learn it');
});

test('public paid trainer and pet training change actual health armor and resistance without free healing',()=>{
 let s=game();s=act(s,{type:'train',id:5149},0);s.hunterPet={entry:299,level:20};s.learned.push(883);s=act(s,{type:'cast',id:883},0);s=advance(s,5000).state;s.pet.trainingPoints=100;s.pet.hp=10;
 const before=stats(s.pet);for(const id of[4187,24545,24493]){const row=view(s).skills.find(a=>a.petSpellId===id);assert.ok(row?.icon);assert.ok(row.name!==spells[id].SpellName,'pet training has source Chinese name');s=act(s,{type:'train',id:row.spellId},s.wallAt);s=act(s,{type:'petCommand',command:'train',spellId:id},s.wallAt);}
 const after=stats(s.pet);assert.ok(after.maxHp>before.maxHp);assert.equal(s.pet.hp,10);assert.ok(after.armor>before.armor);assert.ok(after.resistances[6]>before.resistances[6]);
});
