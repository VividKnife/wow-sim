import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat,combatTick} from '../../../packages/game-domain/src/rules/combat.js';
import {distance} from '../../../packages/sim-core/src/geometry.js';
import {effectiveSpeed,moveToward} from '../../../packages/game-domain/src/rules/combat-space.js';

function fight(spell=1449){
 const s=createGame('空间',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.learned=[spell];s.rules=[{spell,condition:'always',value:0,enabled:true}];startCombat(s,[299,299]);
 for(const e of s.combat.enemies){e.hp=e.maxHp=10000;e.level=1;e.nextAttack=1e9;e.rootUntil=1e9;}
 return s;
}
test('self AOE cannot damage enemies outside its two dimensional radius',()=>{
 const s=fight();const [near,far]=s.combat.enemies;near.position=3;near.positionY=4;far.position=3;far.positionY=30;
 combatTick(s);assert.ok(near.hp<10000);assert.equal(far.hp,10000);
});
test('melee cannot hit a target close on x but distant on y',()=>{
 const s=fight();s.rules=[];const e=s.combat.enemies[0];e.position=1;e.positionY=20;
 combatTick(s);assert.equal(e.hp,10000);assert.ok(s.positionY>0);
});

test('diagonal approach crosses the melee boundary despite floating point rounding',()=>{
 const s=fight();s.rules=[];s.mana=0;
 const e=s.combat.enemies[0];s.combat.enemies=[e];
 s.position=46.557679095592846;s.positionY=2.8546582754033856;
 e.position=41.58004881875549;e.positionY=2.3822211609509676;
 assert.ok(distance(s,e)>5);
 for(let i=0;i<5;i++){combatTick(s);s.clock+=100;}
 assert.ok(distance(s,e)<=5,'approach must reach an attackable position');
 assert.ok(e.hp<e.maxHp,'an in-range auto attack must occur instead of stalling forever');
});
test('monster movement uses template speed rather than the same hardcoded step',()=>{
 const s=fight();s.rules=[];s.nextSwing=1e9;s.rootUntil=1e9;const [a,b]=s.combat.enemies;
 a.rootUntil=b.rootUntil=0;a.moveSpeed=3;b.moveSpeed=9;a.position=b.position=30;a.positionY=b.positionY=0;
 combatTick(s);assert.ok(Math.abs(a.position-29.7)<1e-9);assert.ok(Math.abs(b.position-29.1)<1e-9);
});
test('root stops movement but permits attacks already in range',()=>{
 const s=fight();s.rules=[];s.rootUntil=10000;s.combat.enemies[0].position=3;s.nextSwing=0;
 combatTick(s);assert.equal(s.position,0);assert.ok(s.combat.enemies[0].hp<10000);
});
test('AOE count checks actual radius, not total encounter population',()=>{
 const s=fight();s.rules=[{spell:1449,condition:'enemyCountAtLeast',value:2,enabled:true}];
 s.combat.enemies[0].position=4;s.combat.enemies[1].position=40;
 combatTick(s);assert.equal(s.logs.filter(e=>e.kind==='cast'&&e.spellId===1449).length,0);
 s.combat.enemies[1].position=5;s.clock=2000;combatTick(s);
 assert.equal(s.logs.filter(e=>e.kind==='cast'&&e.spellId===1449).length,1);
});
test('a mage uses a rooted enemy to leave melee instead of standing in its reach',()=>{
 const s=fight(116);s.rules=[{spell:116,condition:'always',value:0,enabled:true}];s.combat.enemies[0].position=5;
 combatTick(s);assert.ok(s.position<0);assert.equal(s.cast,null);
});
test('movement clamps at reach and uses the strongest slow, then restores speed',()=>{
 const u={position:0,positionY:0,moveSpeed:10,slow:.5,slowUntil:1000,auras:[{type:33,amount:-30,until:1000}]};
 assert.equal(effectiveSpeed(u,0),5);moveToward(u,{position:3,positionY:4},4.8,0);assert.ok(Math.abs(distance(u,{position:3,positionY:4})-4.8)<1e-9);
 assert.equal(effectiveSpeed(u,1000),10);u.rootUntil=2000;assert.equal(effectiveSpeed(u,1500),0);
});
test('a ground cast is cancelled if its fixed area would break newly applied crowd control',()=>{
 const s=fight(2120);combatTick(s);const finish=s.cast.until;s.combat.enemies[1].polyUntil=100000;s.clock=finish;combatTick(s);
 assert.equal(s.combat.enemies[1].hp,10000);assert.equal(s.groundEffects.length,0);assert.ok(s.logs.some(l=>l.kind==='cancel'));
});
test('ground damage stays at the cast point and hits units entering it',()=>{
 const s=fight(2120);s.combat.enemies[1].position=50;combatTick(s);s.clock=s.cast.until;combatTick(s);s.rules=[];
 const area=s.groundEffects.find(a=>a.side==='friendly');assert.ok(area);const [original,entrant]=s.combat.enemies;
 const before=original.hp;original.position=60;entrant.position=area.position;entrant.positionY=area.positionY;s.clock=area.next;combatTick(s);
 assert.equal(original.hp,before);assert.ok(entrant.hp<10000);
});
