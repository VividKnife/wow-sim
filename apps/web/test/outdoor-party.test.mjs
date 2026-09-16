import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,advance,stats,killXp} from '../lib/game/engine.js';
import {startCombat,combatTick,hurtPlayer} from '../lib/game/combat.js';

function group(){let s=createGame('野外小队',29,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);return s;}

test('outdoor companions fight, earn outdoor group XP, and appear in the final meter',()=>{
 const s=group();startCombat(s,[636]);const e=s.combat.enemies[0];
 const expected=Math.floor(killXp(18,e.level,!!e.rank,false)*1.4/5);
 assert.equal(s.combat.dungeon,false);assert.equal(s.combat.participantIds?.length,5);
 e.hp=1;e.nextAttack=100000;e.rootUntil=100000;
 for(let i=0;s.combat&&i<100;i++){s.clock+=100;combatTick(s);}
 assert.equal(s.combat,null);
 for(const c of [s,...s.party])assert.equal(c.xp,expected);
 assert.equal(Object.keys(s.lastCombat.metrics.actors).length,5);
 assert.equal(s.lastCombat.actorsSnapshot.length,5);
});

test('a fallen outdoor leader does not end a battle while companions are still alive',()=>{
 const s=group();startCombat(s,[636]);s.hp=0;const e=s.combat.enemies[0];e.hp=e.maxHp=100000;e.nextAttack=100000;
 combatTick(s);assert.ok(s.combat);assert.throws(()=>act(s,{type:'revive'},0),/战斗/);
});

test('leader death is counted once even if the outdoor party wins afterwards',()=>{
 const s=group();startCombat(s,[636]);const e=s.combat.enemies[0];s.hp=1;
 hurtPlayer(s,e,s,10);assert.equal(s.totals.deaths,1);
 e.hp=0;combatTick(s);assert.equal(s.combat,null);assert.equal(s.totals.deaths,1);
});

test('a later party wipe does not count a leader death twice',()=>{
 const s=group();startCombat(s,[636]);const e=s.combat.enemies[0];s.hp=1;
 hurtPlayer(s,e,s,10);for(const c of s.party)c.hp=0;
 combatTick(s);assert.equal(s.combat,null);assert.equal(s.totals.deaths,1);
});

test('outdoor rest regenerates companions and automatic hunting stops for a fallen member',()=>{
 let s=group();const priest=s.party.find(c=>c.classId===5);priest.mana=0;priest.hp=20;
 s=advance(s,6000).state;const restored=s.party.find(c=>c.classId===5);assert.ok(restored.mana>0);assert.ok(restored.hp>20);
 s.party[0].hp=0;s=act(s,{type:'hunt',id:299},s.wallAt);s=advance(s,s.wallAt+100).state;
 assert.equal(s.combat,null);assert.equal(s.activity.type,'idle');assert.match(s.activity.reason,/倒下/);
});

test('legacy solo combat does not acquire companions halfway through an encounter',()=>{
 const s=group();startCombat(s,[636]);delete s.combat.participantIds;delete s.combat.metrics;
 s.hp=0;combatTick(s);assert.equal(s.combat,null);assert.equal(s.lastCombat.actorsSnapshot.length,1);
});
