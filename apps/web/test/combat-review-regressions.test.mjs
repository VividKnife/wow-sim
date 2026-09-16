import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../lib/game/engine.js';
import {newCharacter} from '../lib/game/character.js';
import {startCombat,combatTick} from '../lib/game/combat.js';
import {effectiveSpeed} from '../lib/game/combat-space.js';
import {talents,xpTable,creatures} from '../lib/game/catalog.js';

test('a weaker later Frostbolt does not replace a stronger slow and survives its expiry',()=>{
 const s=createGame('冰霜专精',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=10000;s.learned=[116];s.rules=[];
 s.talents[Object.values(talents).find(t=>t.name==='Permafrost').id]=3;
 const other={...newCharacter('普通法师',8,20),id:'other-mage',learned:[116],rules:[],hp:10000,mana:10000};s.party=[other];
 startCombat(s,[299],true);const e=s.combat.enemies[0];e.hp=e.maxHp=10000;e.level=1;e.nextAttack=1e9;e.position=5;e.positionY=0;e.moveSpeed=10;
 other.position=0;other.positionY=0;s.nextSwing=other.nextSwing=1e9;
 const land=actor=>{s.combat.projectiles.push({actorId:actor.id,targetId:e.id,spellId:116,side:'friendly',landsAt:s.clock});combatTick(s);};
 land(s);assert.equal(effectiveSpeed(e,0),5);
 s.clock=4000;land(other);assert.equal(effectiveSpeed(e,4000),5);
 const restored=JSON.parse(JSON.stringify(e));assert.equal(effectiveSpeed(restored,8000),6);assert.equal(effectiveSpeed(restored,9000),10);
});

test('Ignite uses its own periodic spell identity alongside a melee hit',()=>{
 const s=createGame('点燃',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=10000;s.learned=[2136];s.rules=[{spell:2136,condition:'always',enabled:true,value:0}];
 s.talents[Object.values(talents).find(t=>t.name==='Ignite').id]=5;
 s.buffs.int={kind:'int',amount:100000,until:100000};
 startCombat(s,[299]);const e=s.combat.enemies[0];e.hp=e.maxHp=10000;e.level=1;e.nextAttack=1e9;e.position=3;
 combatTick(s);const dot=e.dots.find(d=>d.label==='点燃');assert.ok(dot,'the guaranteed fire critical should produce Ignite');
 s.rules=[];s.clock=1500;combatTick(s);s.nextSwing=1e9;
 s.clock=2000;combatTick(s);
 const row=s.combat.metrics.actors[s.id];assert.ok(row.spells['0'].damage>0,'a separate melee hit should exist');
 assert.equal(row.spells['12654']?.damage,dot.amount);assert.equal(row.periodicDamage,dot.amount);assert.equal(row.periodicHits,1);
 const event=s.logs.find(l=>l.kind==='damage'&&l.action==='点燃');assert.equal(event.spellId,12654);assert.equal(event.periodic,true);assert.equal(event.school,2);
});

function missiles(){
 const s=createGame('奥术',283,0);s.level=20;s.hp=10000;s.mana=10000;s.learned=[5143];s.rules=[{spell:5143,condition:'always',enabled:true,value:0}];
 startCombat(s,[299]);const e=s.combat.enemies[0];e.hp=e.maxHp=10000;e.level=1;e.nextAttack=1e9;e.rootUntil=1e9;
 combatTick(s);assert.equal(s.cast?.channel,true);return s;
}
test('targeted channels cancel when their live target leaves range',()=>{
 const s=missiles(),e=s.combat.enemies[0];e.position=100;s.clock=1000;combatTick(s);
 assert.equal(e.hp,10000);assert.equal(s.cast,null);assert.equal(s.combat.projectiles.length,0);assert.ok(s.logs.some(l=>l.kind==='cancel'));
});
test('each Arcane Missiles pulse launches a serialized projectile before causing damage',()=>{
 const s=missiles(),e=s.combat.enemies[0];s.clock=1000;combatTick(s);
 assert.equal(e.hp,10000);assert.equal(s.combat.projectiles.length,1);const p=s.combat.projectiles[0];assert.equal(p.spellId,7268);assert.equal(p.landsAt,2500);
 s.rules=[];s.cast=null;s.nextAction=s.nextSwing=1e9;const restored=JSON.parse(JSON.stringify(s));s.clock=restored.clock=p.landsAt;
 combatTick(s);combatTick(restored);assert.ok(e.hp<10000);assert.deepEqual(restored,s);
});

test('legacy metrics begin on the first observed tick even before any damage',()=>{
 const s=createGame('旧存档',283,0);startCombat(s,[299]);delete s.combat.metrics;s.rules=[];s.nextSwing=1e9;s.rootUntil=1e9;
 s.combat.enemies[0].nextAttack=1e9;s.combat.enemies[0].rootUntil=1e9;s.clock=1000;combatTick(s);
 assert.equal(s.combat.metrics?.startedAt,1000);assert.equal(s.combat.metrics.partial,true);
});
test('a final killing blow level-up snapshots the new maximum health and mana',()=>{
 const s=createGame('升级',283,0);s.xp=xpTable[s.level].xp_for_next_level-1;startCombat(s,[299]);s.combat.enemies[0].hp=0;combatTick(s);
 assert.equal(s.level,2);assert.equal(s.lastCombat.actorsSnapshot[0].maxHp,stats(s).maxHp);assert.equal(s.lastCombat.actorsSnapshot[0].maxMana,stats(s).maxMana);
 assert.equal(s.lastCombat.actorsSnapshot[0].hp,s.lastCombat.actorsSnapshot[0].maxHp);
});

test('legacy enemy speeds restore template rates without overwriting explicit speeds',()=>{
 const s=createGame('旧移速',283,0);startCombat(s,[299,299]);s.rules=[];s.nextSwing=1e9;s.rootUntil=1e9;
 const [legacy,explicit]=s.combat.enemies;delete legacy.moveSpeed;delete legacy.walkSpeed;explicit.moveSpeed=0;explicit.walkSpeed=1.25;
 for(const e of s.combat.enemies){e.position=30;e.positionY=0;e.nextAttack=1e9;}
 combatTick(s);
 assert.equal(legacy.moveSpeed,7*creatures[299].SpeedRun);assert.equal(legacy.walkSpeed,2.5*creatures[299].SpeedWalk);
 assert.ok(Math.abs(legacy.position-(30-legacy.moveSpeed*.1))<1e-9);
 assert.equal(explicit.moveSpeed,0);assert.equal(explicit.walkSpeed,1.25);assert.equal(explicit.position,30);
});
