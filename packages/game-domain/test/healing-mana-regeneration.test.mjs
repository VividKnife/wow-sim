import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {stats,spellInfo} from '../src/rules/character.js';
import {beginSpellTiming,finishSpellTiming} from '../src/rules/spell-timing.js';
import {recoveryTick} from '../src/rules/recovery.js';

test('healing mana is committed once at completion; cancellation and free casts do not reset five seconds',()=>{
 const c=createGame('牧师',1,0,{classId:5,raceId:1});c.level=60;c.time=10000;c.mana=3000;c.lastManaUse=0;
 const sp=spellInfo(c,25314),cancelled=beginSpellTiming(c,sp,10000);
 assert.equal(c.mana,3000);assert.equal(c.lastManaUse,0);assert.equal(cancelled.committed,false);
 const completed=beginSpellTiming(c,sp,14000);assert.ok(finishSpellTiming(c,completed,17000));assert.equal(c.mana,2290);assert.equal(c.lastManaUse,17000);
 finishSpellTiming(c,completed,18000);assert.equal(c.mana,2290);assert.equal(c.lastManaUse,17000);
 const free=beginSpellTiming(c,{...sp,mana:0},19000);finishSpellTiming(c,free,22000);assert.equal(c.lastManaUse,17000);
});

test('five-second spirit suppression ends in combat; mp5 continues during suppression',()=>{
 const c=createGame('牧师',1,0,{classId:5,raceId:1});c.level=60;c.equipment={};c.talents={};c.hp=stats(c).maxHp;c.mana=0;c.lastManaUse=0;c.combat={participantIds:[c.id],enemies:[]};
 c.clock=4000;recoveryTick(c,true);assert.equal(c.mana,0);
 c.clock=6000;recoveryTick(c,true);assert.equal(c.mana,Math.floor(stats(c).spi/4+12.5));
 c.equipment={13:{id:18371}}; // Mindtap Talisman: real +11 mana/5 sec.
 assert.equal(stats(c).manaRegen,11);c.mana=0;c.lastManaUse=6000;
 c.clock=8000;recoveryTick(c,true);c.clock=10000;recoveryTick(c,true);assert.equal(c.mana,8);
 c.clock=12000;recoveryTick(c,true);assert.equal(c.mana,13+Math.floor(stats(c).spi/4+12.5));
});
