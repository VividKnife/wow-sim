import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {startCombat,summonInfernal} from '../src/rules/combat.js';
import {bossCombatArea,placeCombatUnit} from '../src/rules/combat-area.js';
import {summonClassPet,createClassTotem} from '../src/rules/class-spell-effects.js';
import {classEffect} from '../src/rules/class-mechanics.js';
import {spellInfo} from '../src/rules/character.js';
import {scenePointAllowed,sceneSight} from '../../sim-core/src/scene-space.js';

function fixture(classId){
 const s=createGame('房间召唤测试',281,0,{classId,raceId:[3,7].includes(classId)?2:1});
 s.level=60;startCombat(s,[636],true,null,bossCombatArea('onyxia'));
 return s;
}

test('class pets and totems summoned beside a concave wall are placed on the actual floor',()=>{
 const s=fixture(9),area=s.combat.area;
 placeCombatUnit(s,s,{x:-17,y:5});
 assert.equal(scenePointAllowed(area,{x:-17,y:7}),false);
 const copy=JSON.parse(JSON.stringify(s));
 for(const state of [s,copy])summonClassPet(state,state,spellInfo(state,688));
 assert.equal(scenePointAllowed(area,s.pet),true);
 assert.ok(Math.hypot(s.pet.position-s.position,s.pet.positionY-s.positionY)<3);
 assert.deepEqual(s.pet,copy.pet);
 const shaman=fixture(7);placeCombatUnit(shaman,shaman,{x:-17,y:5});
 createClassTotem(shaman,shaman,spellInfo(shaman,3599));
 assert.equal(scenePointAllowed(shaman.combat.area,shaman.totems.fire),true);
});

test('an infernal is created at its impact destination across room corners',()=>{
 const s=fixture(9),area=s.combat.area,target={position:-8,positionY:14};
 placeCombatUnit(s,s,area.anchors.entrance);
 assert.equal(sceneSight(area,s,target),false);
 const demon=summonInfernal(s,s,target);
 assert.deepEqual({x:demon.position,y:demon.positionY},{x:-8,y:14});
 assert.equal(scenePointAllowed(area,demon),true);
});

test('reviving a pet relocates it to its owner instead of clipping against the intervening wall',()=>{
 const s=fixture(3),area=s.combat.area;
 placeCombatUnit(s,s,area.anchors.entrance);summonClassPet(s,s,spellInfo(s,883));
 placeCombatUnit(s,s.pet,{x:-8,y:14});s.pet.hp=0;
 assert.equal(sceneSight(area,s,s.pet),false);
 classEffect(s,s,s,spellInfo(s,982),[s,s.pet],{});
 assert.ok(s.pet.hp>0);
 assert.deepEqual({x:s.pet.position,y:s.pet.positionY},area.anchors.entrance);
});
