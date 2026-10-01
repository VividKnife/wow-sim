import test from 'node:test';
import assert from 'node:assert/strict';
import {launchProjectile,takeImpacts,PROJECTILE_CAPACITY} from '../src/rules/combat-projectiles.js';
import {clearCombatEvents} from '../src/rules/simulation-events.js';
import {createGame,advanceOwned} from '../src/rules/engine.js';
import {startCombat} from '../src/rules/combat.js';
import {newCharacter,spellInfo,stats} from '../src/rules/character.js';

function fixture(){return {clock:0,nextTick:100,logs:[],logSequence:0,combat:{id:'test',projectiles:[]}};}
const caster={id:'caster',position:0,positionY:0,hp:100};
const target={id:'target',position:10,positionY:0,hp:100};
const spell=(Id,Speed)=>({Id,Speed,SpellName:'Test Bolt',School:2});

test('impact events retain quantized phase and launch order even with different exact flight times',()=>{
 const s=fixture();launchProjectile(s,caster,target,spell(1,110));launchProjectile(s,caster,target,spell(2,190));
 launchProjectile(s,caster,target,spell(3,130),'enemy');
 s.clock=99;assert.deepEqual(takeImpacts(s,'friendly'),[]);assert.deepEqual(takeImpacts(s,'enemy'),[]);
 assert.equal(s.combat.projectiles.length,3);
 s.clock=100;assert.deepEqual(takeImpacts(s,'friendly').map(p=>p.spellId),[1,2]);
 assert.equal(s.combat.projectiles.length,1);
 assert.deepEqual(takeImpacts(s,'enemy').map(p=>p.spellId),[3]);
 assert.deepEqual(takeImpacts(s,'friendly'),[],'reading a completed phase is harmless');
 assert.equal(s.simulationEvents.queue.events.length,0);
});

test('state cloned between side phases preserves pending impacts and later stable IDs',()=>{
 const s=fixture();launchProjectile(s,caster,target,spell(1,100),'enemy');launchProjectile(s,caster,target,spell(2,100));
 s.clock=100;assert.equal(takeImpacts(s,'friendly').length,1);
 const restored=JSON.parse(JSON.stringify(s));
 assert.deepEqual(takeImpacts(s,'enemy'),takeImpacts(restored,'enemy'));
 for(const state of [s,restored]){state.clock=110;launchProjectile(state,caster,target,spell(3,100));state.clock=300;takeImpacts(state,'friendly');takeImpacts(state,'enemy');}
 assert.deepEqual(s,restored);
 assert.equal(s.combat.projectileSequence,3);
});

test('render-only flights are retired without damage and encounter completion clears the schedule',()=>{
 const s=fixture();launchProjectile(s,caster,target,spell(1,100),'friendly',{presentationOnly:true});
 s.clock=100;assert.deepEqual(takeImpacts(s,'friendly'),[]);assert.equal(s.combat.projectiles.length,0);
 launchProjectile(s,caster,target,spell(2,100));clearCombatEvents(s);
 assert.equal(s.simulationEvents.queue.events.length,0);assert.deepEqual(s.combat.projectiles,[]);
});

test('queue adoption rejects missing schedules and malformed identities; capacity cannot grow indefinitely',()=>{
 const invalid=fixture();invalid.combat.projectiles.push({id:'orphan'});
 assert.throws(()=>takeImpacts(invalid,'friendly'),/require their event queue/);
 const s=fixture();launchProjectile(s,caster,target,spell(1,1));
 const bad=JSON.parse(JSON.stringify(s));bad.combat.projectiles[0].sequence=NaN;
 assert.throws(()=>takeImpacts(bad,'friendly'),/identity/);
 const missing=JSON.parse(JSON.stringify(s));missing.simulationEvents.queue.events=[];
 assert.throws(()=>takeImpacts(missing,'friendly'),/does not match/);
 const wrongPhase=JSON.parse(JSON.stringify(s));wrongPhase.simulationEvents.queue.events[0].phase=30;
 assert.throws(()=>takeImpacts(wrongPhase,'friendly'),/does not match/);
 for(let i=1;i<PROJECTILE_CAPACITY;i++)launchProjectile(s,caster,target,spell(1,1));
 const before=s.combat.projectileSequence;
 assert.throws(()=>launchProjectile(s,caster,target,spell(1,1)),/capacity/);
 assert.equal(s.combat.projectileSequence,before);
});

test('a dead caster still damages through an already launched projectile while allies keep the encounter active',()=>{
 const s=createGame('投射物法师',281,0,{classId:8,raceId:1});s.id='caster';
 const ally=newCharacter('存活队友',1,1,1);ally.id='ally';ally.hp=stats(ally).maxHp;s.party=[ally];
 startCombat(s,[636],true);delete s.combat.pull;
 const e=s.combat.enemies[0];e.hp=e.maxHp=50000;e.level=s.level;e.stunUntil=999999;e.nextAttack=999999;e.nextSpell=999999;
 s.rules=[];ally.rules=[];ally.position=-19;ally.moveSpeed=0;
 launchProjectile(s,s,e,spellInfo(s,133));s.hp=0;
 advanceOwned(s,2000);
 assert.ok(s.logs.some(l=>l.kind==='damage'&&l.actorId===s.id&&l.targetId===e.id));
 assert.equal(s.combat.projectiles.length,0);assert.equal(s.hp,0);
});
