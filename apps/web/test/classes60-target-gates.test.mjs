import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../lib/game/engine.js';
import {spellInfo,effectRange} from '../lib/game/character.js';
import {startCombat} from '../lib/game/combat.js';
import {prepareClassAbility} from '../lib/game/class-spell-effects.js';

test('Mind Control respects its source creature mask and maximum target level before casting',()=>{
 const s=createGame('精神控制',775,0,{classId:5,raceId:1});s.level=60;startCombat(s,[299,6]);
 const sp=spellInfo(s,10912),[beast,human]=s.combat.enemies;
 assert.equal(prepareClassAbility(s,s,beast,sp,[s]),null);
 human.level=effectRange(s,sp)[0]+1;assert.equal(prepareClassAbility(s,s,human,sp,[s]),null);
 human.level=20;assert.equal(prepareClassAbility(s,s,human,sp,[s]).target,human);
});
