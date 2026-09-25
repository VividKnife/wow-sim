import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,view,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {recruitForTest} from './support/party-fixture.mjs';
import {enterDungeon,leaveDungeon,resetDungeon,prepareEncounter,recordDungeonProgress} from '../../../packages/game-domain/src/rules/dungeon.js';

function group(seed=812){let s=createGame('监狱小队',seed,0);s.level=30;for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);for(const c of [s,...s.party]){c.level=30;c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;}s.location='stockades';return s;}

test('Deadmines rare Johnson rolls once and preserves absence or presence on resume',()=>{
 const outcomes=new Set();
 for(const seed of [1,812,9999,123456,987654321]){
  const s=group(seed);s.location='deadmines';enterDungeon(s,'deadmines');
  const present=Object.values(s.dungeon.spawns).some(e=>e?.entry===3586);outcomes.add(present);
  const spawns=JSON.stringify(s.dungeon.spawns);leaveDungeon(s);enterDungeon(s,'deadmines');
  assert.equal(JSON.stringify(s.dungeon.spawns),spawns);
 }
 assert.deepEqual(outcomes,new Set([true,false]));
});

test('Stockades entry uses its own entrance, level and route',()=>{
 const s=group();assert.ok(view(s).dungeons?.stockades,'Stockades is registered');
 s.level=14;assert.throws(()=>enterDungeon(s,'stockades'),/15/);s.level=30;
 s.location='deadmines';assert.throws(()=>enterDungeon(s,'stockades'),/入口/);s.location='stockades';
 enterDungeon(s,'stockades');assert.equal(s.dungeon.id,'stockades');
 assert.ok(Object.values(s.dungeon.spawns).some(e=>e?.entry===1716));
 assert.ok(!Object.values(s.dungeon.spawns).some(e=>e?.entry===639));
 prepareEncounter(s);assert.equal(s.combat.runId,s.dungeon.runId);assert.ok(s.combat.enemies.length);
});

test('saved routes for two dungeons resume independently and reset only the selected dungeon',()=>{
 const s=group();s.location='deadmines';enterDungeon(s,'deadmines');s.dungeon.cursor=2;const dm=s.dungeon.runId;leaveDungeon(s);
 s.location='stockades';enterDungeon(s,'stockades');s.dungeon.cursor=1;const stock=s.dungeon.runId;leaveDungeon(s);
 const saved=JSON.parse(JSON.stringify(s)),seed=saved.rngState;enterDungeon(saved,'stockades');assert.equal(saved.dungeon.runId,stock);assert.equal(saved.dungeon.cursor,1);assert.equal(saved.rngState,seed);leaveDungeon(saved);
 saved.location='deadmines';enterDungeon(saved,'deadmines');assert.equal(saved.dungeon.runId,dm);assert.equal(saved.dungeon.cursor,2);leaveDungeon(saved);
 resetDungeon(saved,'stockades');assert.equal(saved.dungeonSaves.stockades,undefined);assert.equal(saved.dungeonSaves.deadmines.runId,dm);assert.equal(saved.dungeonEntries.length,2);
});

test('Stockades death credit survives retry and route cannot advance twice',()=>{
 const s=group();enterDungeon(s,'stockades');prepareEncounter(s);const first=s.combat.enemies[0];first.hp=0;recordDungeonProgress(s);assert.equal(s.dungeon.defeated[first.sourceGuid],true);
 for(const e of s.combat.enemies)e.hp=0;s.lastCombat=s.combat;s.combat=null;recordDungeonProgress(s);const cursor=s.dungeon.cursor;recordDungeonProgress(s);assert.equal(s.dungeon.cursor,cursor);assert.ok(cursor>0);
});

test('engine commands cannot select a non-playable or unknown dungeon',()=>{
 const s=group();assert.throws(()=>act(s,{type:'enterDungeon',contentId:'unknown'},0),/副本/);
 const entered=act(s,{type:'enterDungeon',contentId:'stockades'},0);assert.equal(entered.dungeon.id,'stockades');assert.equal(view(entered).dungeon.name,'暴风城监狱');
});
