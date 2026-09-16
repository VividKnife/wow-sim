import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,advance} from '../lib/game/engine.js';
import {startCombat,hurtPlayer,combatTick} from '../lib/game/combat.js';
import * as smite from '../lib/game/smite.js';
import {hasSpellAura,hasAura} from '../lib/game/combat-auras.js';
import {castEnemySpell} from '../lib/game/enemy-spells.js';
import {triggerMeleeProcs} from '../lib/game/enemy-procs.js';
import {enemyMeleeTick} from '../lib/game/enemy-melee.js';

function setup(entry=646){const s=createGame('机制测试',283,0);s.level=20;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];startCombat(s,[entry]);s.nextAction=s.nextSwing=1e9;const e=s.combat.enemies[0];e.position=4;e.target=s.id;e.nextAttack=1e9;return{s,e};}
test('Smite chest movement obeys two-dimensional speed, slow and root',()=>{
 const {s,e}=setup();smite.initializeSmite(s,e,[s],hurtPlayer);
 Object.assign(e,{position:4,positionY:8,moveSpeed:8,slow:.5,slowUntil:5000});
 e.smite.stage='running';const before={x:e.position,y:e.positionY};
 s.clock=1000;smite.smiteTick(s,e,[s],hurtPlayer);
 assert.ok(Math.abs(Math.hypot(e.position-before.x,e.positionY-before.y)-4)<.001);
 assert.ok(e.positionY<before.y);
 e.rootUntil=3000;const stopped=[e.position,e.positionY];
 s.clock=2000;smite.smiteTick(s,e,[s],hurtPlayer);
 assert.deepEqual([e.position,e.positionY],stopped);
});
test('Smite uses strict thresholds and completes timed chest/weapon transitions without attacking',()=>{
 const {s,e}=setup();smite.smiteTick(s,e,[s],hurtPlayer);
 assert.equal(e.smite.phase,1);assert.equal(hasSpellAura(e,6433,0),true);
 e.hp=e.maxHp*.66;s.clock=100;assert.equal(smite.smiteTick(s,e,[s],hurtPlayer),false);
 e.hp=e.maxHp*.65;s.clock=200;assert.equal(smite.smiteTick(s,e,[s],hurtPlayer),true);
 assert.equal(e.smite.stage,'waiting');assert.equal(e.smite.until,2700);assert.equal(hasSpellAura(e,6433,200),false);
 s.clock=2700;smite.smiteTick(s,e,[s],hurtPlayer);assert.equal(e.smite.stage,'running');
 const restored=JSON.parse(JSON.stringify(s)),mob=restored.combat.enemies[0];
 for(restored.clock+=100;mob.smite.stage!=='kneeling'&&restored.clock<20000;restored.clock+=100)smite.smiteTick(restored,mob,[restored],hurtPlayer);
 assert.equal(mob.smite.stage,'kneeling');const end=mob.smite.until;
 restored.clock=end;smite.smiteTick(restored,mob,[restored],hurtPlayer);assert.deepEqual(mob.weapons,[2183,2183]);assert.equal(mob.smite.stage,'standing');
 restored.clock=end+1000;smite.smiteTick(restored,mob,[restored],hurtPlayer);assert.equal(mob.smite.phase,2);assert.equal(mob.dualWield,true);assert.equal(hasSpellAura(mob,12787,restored.clock),true);
});
test('a large health drop equips the hammer directly and its Slam timer starts in phase three',()=>{
 const {s,e}=setup();smite.smiteTick(s,e,[s],hurtPlayer);e.hp=e.maxHp*.2;
 for(s.clock=100;s.clock<20000&&e.smite.phase!==3;s.clock+=100)smite.smiteTick(s,e,[s],hurtPlayer);
 assert.equal(e.smite.phase,3);assert.deepEqual(e.weapons,[10756]);assert.equal(e.dualWield,false);
 assert.equal(hasSpellAura(e,12787,s.clock),false);assert.equal(hasSpellAura(e,6436,s.clock),true);
 const began=e.smite.phaseStartedAt;e.position=4;s.position=0;s.auras=[];
 s.clock=began+8900;smite.smiteTick(s,e,[s],hurtPlayer);assert.equal(s.logs.some(l=>l.spellId===6435),false);
 s.clock=began+9000;smite.smiteTick(s,e,[s],hurtPlayer);assert.equal(s.logs.filter(l=>l.spellId===6435&&l.kind==='cast').length,1);
});
test('Thrash grants two extra attacks but cannot recursively proc itself from them',()=>{
 const {s,e}=setup(639);castEnemySpell(s,e,e,12787,[s],hurtPlayer,2);s.rngState=1;
 triggerMeleeProcs(s,e,s,4,[s],hurtPlayer,false);assert.equal(e.extraAttacks,2);
 s.rngState=1;triggerMeleeProcs(s,e,s,4,[s],hurtPlayer,true);assert.equal(e.extraAttacks,2);
});
test('Frost Armor chills melee attackers for five seconds; Nimble Reflexes grants temporary dodge',()=>{
 const {s,e}=setup(1729);castEnemySpell(s,e,e,12544,[s],hurtPlayer,2);s.rngState=283; // Proc and subsequent spell hit both succeed.
 triggerMeleeProcs(s,e,s,8,[s],hurtPlayer);assert.equal(hasSpellAura(s,6136,0),true);assert.equal(hasSpellAura(s,6136,5000),false);
 const other=setup();castEnemySpell(other.s,other.e,other.e,6433,[other.s],hurtPlayer,2);other.s.rngState=1;
 triggerMeleeProcs(other.s,other.e,other.s,8,[other.s],hurtPlayer);assert.equal(hasAura(other.e,47,0),true);assert.equal(hasAura(other.e,47,8000),false);
});
test('dual-wield attacks have independent hand timers and half-damage offhand',()=>{
 const {s,e}=setup(639);e.dualWield=true;e.low=e.high=40;e.nextAttack=e.nextOffhand=s.clock;s.rngState=123456789; // Both hands hit; misses are covered separately.
 enemyMeleeTick(s,e,s,[s],hurtPlayer);
 const hits=s.logs.filter(l=>l.kind==='incoming');assert.equal(hits.length,2);
 assert.equal(hits[0].hand,'main');assert.equal(hits[1].hand,'off');assert.ok(Math.abs(hits[0].amount-hits[1].amount*2)<=1);
 assert.equal(e.nextAttack,e.swing);assert.equal(e.nextOffhand,e.swing);
});

test('a resisted Frost Armor proc applies no chill and a missed offhand still resets its timer',()=>{
 const {s,e}=setup(1729);castEnemySpell(s,e,e,12544,[s],hurtPlayer,2);s.rngState=1;
 triggerMeleeProcs(s,e,s,8,[s],hurtPlayer);
 assert.equal(hasSpellAura(s,6136,0),false);
 assert.ok(s.logs.some(l=>l.kind==='miss'&&l.spellId===6136));
 const other=setup(639);other.e.dualWield=true;other.e.low=other.e.high=40;
 // Isolate the offhand miss instead of depending on how many random draws
 // the main hand consumes for dodge, critical hits and reactive effects.
 other.e.nextAttack=10000;other.e.nextOffhand=0;other.s.rngState=1;
 enemyMeleeTick(other.s,other.e,other.s,[other.s],hurtPlayer);
 assert.equal(other.e.nextAttack,10000);
 assert.ok(other.s.logs.some(l=>l.kind==='miss'&&l.hand==='off'));
 assert.equal(other.e.nextOffhand,other.e.swing);
});
