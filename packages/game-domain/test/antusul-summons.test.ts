import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/rules/engine.js';
import {enemy} from '../src/rules/character.js';
import {castEnemySpell} from '../src/rules/enemy-spells.js';

test('dungeon summons with missing imported creature rows remain targetable',()=>{
 const s:any=createGame('祖尔法拉克探针',19,0);
 const boss=enemy(s,8127,'boss');
 s.combat={enemies:[boss],summonSequence:0};
 assert.equal(castEnemySpell(s,boss,s,8376,[s],()=>{},2),true);
 assert.equal(castEnemySpell(s,boss,s,11894,[s],()=>{},2),true);
 assert.equal(castEnemySpell(s,boss,s,11904,[s],()=>{},2),true);
 assert.equal(castEnemySpell(s,boss,s,22714,[s],()=>{},2),true);
 assert.equal(castEnemySpell(s,boss,s,27639,[s],()=>{},2),true);
 const entries=s.combat.enemies.slice(1).map((mob:any)=>mob.entry);
 for(const entry of [2630,8130,5645,5461,417])assert.ok(entries.includes(entry));
});
