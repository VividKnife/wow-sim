import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick,commandCombatCast,hurtPlayer} from '../src/rules/combat.js';
import {beginActorCast,prepareActorCasts,takeActorCastReady,simulationEventRuntime} from '../src/rules/simulation-events.js';
import {summonClassPet,executePetSpell,petSpellTick} from '../src/rules/class-spell-effects.js';
import {spellInfo,rng} from '../src/rules/character.js';

function fixture(classId=8){
 const s=createGame('事件施法者',281,0,{classId,raceId:1});s.id='caster';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];
 s.learned=[133,2050,688];startCombat(s,[299]);s.nextSwing=1e9;
 const e=s.combat.enemies[0];Object.assign(e,{hp:100000,maxHp:100000,position:20,positionY:0,nextAttack:1e9,nextSpell:1e9,rootUntil:1e9,ai:{nextCheck:1e9}});
 return {s,e};
}
const start=({s,e},id=133)=>{commandCombatCast(s,s,id,id===2050?s.id:e.id);assert.ok(s.cast);return s.cast.until;};

test('ordinary player cast uses phase 40 and pays/launches exactly once at completion',()=>{
 const f=fixture(),{s}=f,before=s.mana,until=start(f);const event=s.simulationEvents.queue.events[0];
 assert.equal(event.kind,'CastComplete');assert.equal(event.phase,40);assert.equal(s.mana,before);
 s.clock=until-100;combatTick(s);assert.ok(s.cast);assert.equal(s.combat.projectiles.length,0);
 s.clock=until;combatTick(s);assert.equal(s.cast,null);assert.equal(s.combat.projectiles.length,1);assert.ok(s.mana<before);
 const mana=s.mana;combatTick(s);assert.equal(s.combat.projectiles.length,1);assert.equal(s.mana,mana);
});

test('damage pushback rearms one deadline and restores identically before the early wake',()=>{
 const f=fixture(),{s,e}=f,oldEnd=start(f);s.clock=100;hurtPlayer(s,e,s,10);assert.ok(s.cast.until>oldEnd);
 const end=s.cast.until,restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){
  x.clock=oldEnd;combatTick(x);assert.ok(x.cast);assert.equal(x.combat.projectiles.length,0);
  assert.equal(x.simulationEvents.queue.events.filter(e=>e.kind==='CastComplete').length,1);
  x.clock=end;combatTick(x);assert.equal(x.cast,null);assert.equal(x.combat.projectiles.length,1);
 }
 assert.deepEqual(s,restored);
});

test('pushback after deadline dispatch cannot consume a ready cast early',()=>{
 const {s}=fixture();beginActorCast(s,s,{spell:133,target:'enemy-0',until:1000});s.clock=1000;prepareActorCasts(s);
 s.cast.until=1800;assert.equal(takeActorCastReady(s,s),false);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){x.clock=1800;prepareActorCasts(x);assert.equal(takeActorCastReady(x,x),true);x.cast=null;}
 assert.deepEqual(s,restored);
});

test('damage from another arena context postpones the victim without scheduling on the attacker heap',()=>{
 const f=fixture(),{s}=f,until=start(f),attacker=fixture().s;attacker.id='opponent';
 s.pvp=attacker.pvp=true;s.auras=[];attacker.auras=[];s.combat.pvp=attacker.combat.pvp=true;attacker.combat.enemies=[s];attacker.clock=100;
 s.teamId=0;attacker.teamId=1;attacker.arenaAllActors=[attacker,s];
 const queued=structuredClone(s.simulationEvents.queue);
 hurtPlayer(attacker,attacker,s,10);assert.ok(s.cast.until>until);
 assert.deepEqual(s.simulationEvents.queue,queued);assert.equal(attacker.simulationEvents,undefined);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){
  x.clock=until;prepareActorCasts(x);assert.equal(takeActorCastReady(x,x),false);
  x.clock=x.cast.until;prepareActorCasts(x);assert.equal(takeActorCastReady(x,x),true);x.cast=null;
 }
 assert.deepEqual(s,restored);
});

test('snapshot after readiness preserves payment, launch, RNG and event order',()=>{
 const f=fixture(),{s}=f;s.clock=start(f);prepareActorCasts(s);const restored=JSON.parse(JSON.stringify(s));
 combatTick(s);combatTick(restored);assert.deepEqual(s,restored);
});

test('same-time control cancels ready player cast without paying or launching',()=>{
 const f=fixture(),{s}=f,before=s.mana;s.clock=start(f);s.stunUntil=s.clock+1000;
 combatTick(s);assert.equal(s.cast,null);assert.equal(s.mana,before);assert.equal(s.combat.projectiles.length,0);
 s.clock+=100;combatTick(s);assert.deepEqual(s.simulationEvents.casts,{});
});

test('healing cast resolves through the same deadline and ordinary healing rules',()=>{
 const f=fixture(5),{s}=f;s.hp=Math.floor(s.hp/2);const hp=s.hp,mana=s.mana;
 s.clock=start(f,2050);combatTick(s);assert.equal(s.cast,null);assert.ok(s.hp>hp);assert.ok(s.mana<mana);
 assert.ok(s.logs.some(l=>l.kind==='heal'&&l.spellId===2050));
});

test('pet spell uses the shared cast heap and cancels when its owner replaces the pet',()=>{
 const {s,e}=fixture(9);summonClassPet(s,s,spellInfo(s,688));const pet=s.pet,actors=[s,pet],sp=spellInfo(pet,3110);
 executePetSpell(s,pet,s,e,sp,actors,{});assert.ok(pet.cast?.eventId);
 const end=pet.cast.until;s.clock=end-100;prepareActorCasts(s);assert.equal(petSpellTick(s,pet,s,e,actors,{}),true);assert.ok(pet.cast);
 summonClassPet(s,s,spellInfo(s,688));assert.equal(s.pet.id,pet.id);s.clock=end;prepareActorCasts(s);
 assert.deepEqual(s.simulationEvents.casts,{});assert.equal(s.combat.projectiles.length,0);
});

test('pet cast completes once with the same damage and resources after restoration',()=>{
 const {s,e}=fixture(9);summonClassPet(s,s,spellInfo(s,688));
 const pet=s.pet,sp=spellInfo(pet,3110);pet.nextPowerRegen=1e9;
 executePetSpell(s,pet,s,e,sp,[s,pet],{});const end=pet.cast.until,mana=pet.mana;
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){
  const p=x.pet,target=x.combat.enemies[0],hp=target.hp;
  const api={stats,rng,damage:(state,source,victim,amount)=>{victim.hp-=amount;}};
  x.clock=end;prepareActorCasts(x);assert.equal(petSpellTick(x,p,x,target,[x,p],api),true);
  assert.equal(p.cast,null);assert.ok(target.hp<hp);assert.equal(p.mana,mana-sp.mana);
  const after=target.hp;assert.equal(petSpellTick(x,p,x,target,[x,p],api),false);assert.equal(target.hp,after);
 }
 assert.deepEqual(s,restored);
});

test('cast replacement does not inherit the old completion and malformed restoration is rejected',()=>{
 const {s}=fixture();beginActorCast(s,s,{spell:133,target:'enemy-0',until:1000});const first=s.cast.eventId;
 s.cast=null;s.clock=100;beginActorCast(s,s,{spell:133,target:'enemy-0',until:2000});assert.notEqual(s.cast.eventId,first);
 s.clock=1000;prepareActorCasts(s);assert.equal(takeActorCastReady(s,s),false);assert.equal(s.simulationEvents.casts[first],undefined);
 const bad=JSON.parse(JSON.stringify(s));bad.cast.until=1500;assert.throws(()=>simulationEventRuntime(bad),/Actor cast/);
 const absent=JSON.parse(JSON.stringify(s));delete absent.simulationEvents;assert.throws(()=>takeActorCastReady(absent,absent),/scheduled event/);
});
