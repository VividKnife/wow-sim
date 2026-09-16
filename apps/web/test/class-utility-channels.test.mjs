import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance} from '../../../packages/game-domain/src/rules/engine.js';
import {stats,spellInfo} from '../../../packages/game-domain/src/rules/character.js';
import {summonClassPet} from '../../../packages/game-domain/src/rules/class-spell-effects.js';
import {classUtilityUse,classUtilityView} from '../../../packages/game-domain/src/rules/class-utility.js';
function state(classId,id){const s=createGame('channel',11,0,{classId,raceId:classId===3?2:1});s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.learned.push(id);if([3,9].includes(classId)){summonClassPet(s,s,spellInfo(s,classId===3?883:688));s.pet.hp=10;}return s;}
test('Mend Pet channels on the actual pet and stops all future healing when interrupted',()=>{
 let s=state(3,136);const mana=s.mana;s=act(s,{type:'cast',id:136},0);
 assert.equal(s.activity.type,'classChannel');assert.equal(s.cast.target,s.pet.id);assert.equal(s.pet.hp,10);assert.equal(s.mana,mana-spellInfo(s,136).mana);
 s=advance(s,1000).state;assert.ok(s.pet.hp>10);const hp=s.pet.hp;
 s=act(s,{type:'stop'},1000);assert.equal(s.cast,null);s=advance(s,5000).state;assert.equal(s.pet.hp,hp);
});
test('Health Funnel spends health at start and each tick, and cannot funnel into another actor',()=>{
 let s=state(9,755);const hp=s.hp,mana=s.mana;assert.equal(classUtilityUse(s,755,s.id).canUse,false);
 s=act(s,{type:'cast',id:755},0);assert.equal(s.hp,hp-spellInfo(s,755).mana);assert.equal(s.mana,mana);
 const start=s.hp;s=advance(s,1000).state;assert.equal(s.hp,start-spellInfo(s,755).ManaPerSecond);assert.ok(s.pet.hp>10);
 s.hp=1;const pet=s.pet.hp;s=advance(s,2000).state;assert.equal(s.cast,null);assert.equal(s.activity.type,'idle');assert.equal(s.pet.hp,pet);
});
test('channel final ticks survive serialization and segmented advance exactly once',()=>{
 const initial=act(state(3,136),{type:'cast',id:136},0),whole=advance(initial,5000).state;
 let stepped=JSON.parse(JSON.stringify(advance(initial,2000).state));stepped=advance(stepped,5000).state;
 assert.equal(whole.pet.hp,110);assert.equal(whole.activity.type,'idle');assert.equal(whole.cast,null);assert.equal(stepped.pet.hp,whole.pet.hp);
});
test('Evocation is a usable channel and missing or dead pets block pet channels',()=>{
 let s=state(8,12051);s.mana=0;assert.equal(classUtilityUse(s,12051).canUse,true);s=act(s,{type:'cast',id:12051},0);assert.equal(s.activity.type,'classChannel');s=advance(s,2000).state;assert.ok(s.mana>=stats(s).maxMana*.15);
 const hunter=state(3,136);hunter.pet.hp=0;assert.equal(classUtilityUse(hunter,136).canUse,false);delete hunter.pet;assert.equal(classUtilityUse(hunter,136).canUse,false);
});
test('target-specific skill views include the pet and reject self for pet channels',()=>{const s=state(3,136),view=classUtilityView(s);assert.equal(view.skillUsesByTarget[s.pet.id][136].canUse,true);assert.equal(view.skillUsesByTarget[s.id][136].canUse,false);});
