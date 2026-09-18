import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {finishCombat} from '../../../packages/game-domain/src/rules/combat-metrics.js';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
import {mergeGameResponse,readGameResponse} from '../lib/game-response.js';

function fixture(){
 let s=createGame('同步',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);
 startCombat(s,[636,636,1729],true);return s;
}
test('compact combat response retains authoritative units and is less than a quarter of the full snapshot',async()=>{
 const s=advance(fixture(),500,{}).state,full=buildGameResponse(s,1),compact=buildGameResponse(s,1,{scope:'combat'});
 assert.equal(compact.scope,'combat');
 assert.deepEqual(compact.snapshot.player,full.snapshot.player);
 assert.deepEqual(compact.snapshot.view.battleView,full.snapshot.view.battleView);
 for(const skill of compact.snapshot.view.combatSkills)assert.deepEqual(skill,full.snapshot.view.combatSkills.find(row=>row.spellId===skill.spellId));
 assert.equal(compact.snapshot.view.skills,undefined);
 assert.equal(compact.snapshot.view.strategyMembers,undefined);
 assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length/4);
 assert.equal((await readGameResponse(Response.json(compact))).scope,'combat');
 assert.equal(JSON.stringify(compact).includes('rngState'),false);
});
test('compact updates preserve world data by reference but replace live data, and never cross actors or content versions',()=>{
 const s=fixture(),full=buildGameResponse(s,1),next=buildGameResponse(advance(s,200,{}).state,2,{scope:'combat'});
 const merged=mergeGameResponse(full,next);
 assert.equal(merged.snapshot.view.strategyMembers,full.snapshot.view.strategyMembers);
 assert.equal(merged.snapshot.view.battleView,next.snapshot.view.battleView);
 assert.equal(merged.snapshot.player.clock,200);
 assert.equal(full.snapshot.player.clock,0);
 assert.equal(mergeGameResponse(null,next),null);
 assert.equal(mergeGameResponse({...full,contentVersion:'another'},next),null);
 assert.equal(mergeGameResponse({...full,snapshot:{...full.snapshot,player:{id:'another'}}},next),null);
});
test('a completed fight always returns a full refresh including recovery and world actions',()=>{
 const s=fixture();finishCombat(s);
 const response=buildGameResponse(s,2,{scope:'combat'});
 assert.equal(response.scope,'full');assert.ok(response.snapshot.view.skills);
 assert.ok(response.snapshot.player.lastCombat);assert.equal(response.snapshot.player.combat,null);
 assert.equal(mergeGameResponse(null,response),response);
});
