import {recruitForTest} from './support/party-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {enterDungeon,prepareEncounter,recordDungeonProgress} from '../../../packages/game-domain/src/rules/dungeon.js';

function group(){let s=createGame('放弃战斗',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);s.location='deadmines';enterDungeon(s);prepareEncounter(s);s.nextTick=s.clock+100;s.nextRegen=s.clock+2000;return s;}

test('abandon kills the entire encounter roster and summons, stops effects and preserves earned rewards',()=>{
 let s=group();const id=s.combat.id;s.party[0].hp=0;
 s.pet={id:'pet',ownerId:s.id,petUnit:true,hp:10,level:20,equipment:{},learned:[],talents:{}};s.combat.participantIds.push('pet');
 s.totems={fire:{id:'totem',ownerId:s.id,totemUnit:true,petUnit:true,hp:5,level:20,equipment:{},learned:[],talents:{}}};s.combat.participantIds.push('totem');
 s.cast={spell:7322,until:s.clock+1000};s.party[1].talentProcs={spiritOfRedemption:{until:s.clock+15000}};
 s.combat.projectiles=[{impactAt:s.clock+1000}];s.combat.pendingSpawns=[{at:s.clock+1000}];s.groundEffects=[{side:'enemy'}];
 const before={money:s.money,xp:s.totals.xp,kills:s.totals.kills,deaths:s.totals.deaths,bag:structuredClone(s.bag)};
 s=act(s,{type:'abandonCombat',encounterId:id},s.wallAt);
 assert.equal(s.combat,null);assert.equal(s.lastCombat.abandoned,true);assert.equal(s.activity.type,'dead');
 for(const c of [s,...s.party,s.pet,s.totems.fire]){assert.equal(c.hp,0);assert.equal(c.cast,null);}
 assert.equal(s.lastCombat.actorsSnapshot.every(c=>c.hp===0),true);assert.equal(s.party[1].talentProcs.spiritOfRedemption,undefined);
 assert.deepEqual(s.groundEffects,[]);assert.deepEqual(s.lastCombat.projectiles,[]);assert.deepEqual(s.lastCombat.pendingSpawns,[]);
 assert.equal(s.totals.deaths,before.deaths+1);assert.equal(s.totals.kills,before.kills);assert.equal(s.totals.xp,before.xp);assert.equal(s.money,before.money);assert.deepEqual(s.bag,before.bag);
 assert.equal(s.logs.filter(l=>l.kind==='death'&&l.actorId===s.party[0].id).length,0);
 s=advance(s,s.wallAt+20000).state;assert.ok([s,...s.party].every(c=>c.hp===0));assert.equal(s.combat,null);
});

test('revive is required and the unfinished dungeon encounter can be retried at full enemy health',()=>{
 let s=group();const [dead,remaining]=s.combat.enemies;dead.hp=0;dead.rewarded=true;recordDungeonProgress(s);remaining.hp=1;
 const route=s.dungeon.cursor,run=s.dungeon.runId,source=remaining.sourceGuid,full=s.dungeon.spawns[source].hp;
 s=act(s,{type:'abandonCombat',encounterId:s.combat.id},s.wallAt);
 assert.throws(()=>act(s,{type:'dungeonNext'},s.wallAt));
 s=act(s,{type:'revive'},s.wallAt);s=advance(s,s.wallAt+10000).state;
 assert.ok([s,...s.party].every(c=>c.hp>0));assert.equal(s.dungeon.cursor,route);assert.equal(s.dungeon.runId,run);
 prepareEncounter(s);
 assert.equal(s.combat.enemies.length,1);assert.equal(s.combat.enemies[0].sourceGuid,source);assert.equal(s.combat.enemies[0].hp,full);
 assert.equal(s.dungeon.defeated[dead.sourceGuid],true);assert.equal(s.dungeon.defeated[source],undefined);
});

test('no combat and stale encounter commands are rejected, including a delayed command after a new pull',()=>{
 const idle=createGame('空闲',123,0);assert.throws(()=>act(idle,{type:'abandonCombat'},0),/没有/);
 let s=group();const old=s.combat.id;assert.throws(()=>act(s,{type:'abandonCombat',encounterId:'old'},s.wallAt),/变化/);
 s=act(s,{type:'abandonCombat',encounterId:old},s.wallAt);const deaths=s.totals.deaths;
 assert.throws(()=>act(s,{type:'abandonCombat',encounterId:old},s.wallAt),/没有/);assert.equal(s.totals.deaths,deaths);
 s=act(s,{type:'revive'},s.wallAt);s=advance(s,s.wallAt+10000).state;startCombat(s,[299],true);
 assert.notEqual(s.combat.id,old);assert.throws(()=>act(s,{type:'abandonCombat',encounterId:old},s.wallAt),/变化/);assert.ok(s.hp>0);
});

test('outdoor abandonment stops automatic hunting and does not double-count an already dead leader',()=>{
 let s=createGame('野外',123,0);s.activity={type:'hunt',target:299};startCombat(s,[299]);s.hp=0;s.combat.leaderDeathCounted=true;s.totals.deaths=1;
 s=act(s,{type:'abandonCombat',encounterId:s.combat.id},s.wallAt);assert.equal(s.totals.deaths,1);assert.equal(s.activity.type,'dead');
 s=act(s,{type:'revive'},s.wallAt);s=advance(s,11000).state;assert.equal(s.combat,null);assert.equal(s.activity.type,'idle');assert.ok(s.hp>0);
});
