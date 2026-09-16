import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,advance} from '../../../packages/game-domain/src/rules/engine.js';import {stats} from '../../../packages/game-domain/src/rules/character.js';
import {spellInfo,effectRange} from '../../../packages/game-domain/src/rules/character.js';import {classEffect} from '../../../packages/game-domain/src/rules/class-mechanics.js';
const make=()=>{const s=createGame('实际光环',735,0);s.level=60;s.hp=stats(s).maxHp;s.mana=0;s.lastManaUse=0;return s;};
test('active stat debuffs and crit auras affect real stats and expire',()=>{const s=make(),base=stats(s);s.auras=[{spell:1,effect:1,type:29,misc:0,amount:-10,until:10000},{spell:2,effect:1,type:52,amount:10,until:10000}];assert.equal(stats(s).str,base.str-10);assert.equal(stats(s).crit,base.crit+.1);s.time=10000;assert.equal(stats(s).str,base.str);});
test('exclusive resistance buffs use strongest bonus and stack with sourced resistance debuffs',()=>{const s=make();s.auras=[{type:143,misc:4,amount:20,until:10000},{type:143,misc:4,amount:30,until:10000},{type:22,misc:4,amount:-10,until:10000}];assert.equal(stats(s).resistances[2],20);});
test('Mage Armor regeneration works inside the five-second rule through public advance',()=>{const s=make();s.auras=[{spell:6117,type:134,amount:30,until:10000}];assert.equal(stats(s).regenCasting,.3);const done=advance(s,2000).state;assert.ok(done.mana>0);assert.equal(advance({...s,auras:[]},2000).state.mana,0);});

test('casting Inner Fire adds its source armor only once',()=>{const s=make(),base=stats(s).armor,sp=spellInfo(s,588);classEffect(s,s,s,sp,[s],{});assert.equal(stats(s).armor-base,effectRange(s,sp)[0]);});

test('casting Mage Armor adds its magical resistance as well as casting regeneration',()=>{const s=make(),sp=spellInfo(s,6117);classEffect(s,s,s,sp,[s],{});assert.equal(stats(s).resistances[2],effectRange(s,sp)[0]);assert.equal(stats(s).regenCasting,.3);});

test('active agility changes contribute two armor per agility and expire',()=>{const s=make(),base=stats(s).armor;s.auras=[{type:29,misc:1,amount:10,until:10000}];assert.equal(stats(s).armor,base+20);s.time=10000;assert.equal(stats(s).armor,base);});

test('base resistance percentages do not multiply flat resistance buffs',()=>{const s=make();s.equipment={17:{id:2565}};s.auras=[{type:83,misc:4,amount:4,until:10000},{type:142,misc:4,amount:100,until:10000},{type:22,misc:4,amount:10,until:10000},{type:143,misc:4,amount:30,until:10000},{type:101,misc:4,amount:50,until:10000}];assert.equal(stats(s).resistances[2],90);});

test('Innervate restores five times class spirit regeneration once inside and outside the five-second rule',()=>{for(const lastManaUse of [0,-5000]){const s=createGame('激活',735,0,{classId:9,raceId:1});s.level=60;s.hp=stats(s).maxHp;s.mana=0;s.lastManaUse=lastManaUse;classEffect(s,s,s,spellInfo(s,29166),[s],{});const expected=Math.floor((stats(s).spi/5+15)*5);assert.equal(advance(s,2000).state.mana,expected);}});

test('Innervate and Improved Drain Soul multiply their distinct regeneration bonuses',()=>{const s=make();s.innervateUntil=10000;s.talentProcs={drainSoul:{until:10000,stats:{manaRegenPct:1,regenCasting:.5}}};assert.equal(advance(s,2000).state.mana,Math.floor((stats(s).spi/4+12.5)*10));});
