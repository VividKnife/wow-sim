import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick,commandCombatCast,hurtPlayer} from '../src/rules/combat.js';
import {prepareActorCasts,shortenCombatChannel,simulationEventRuntime} from '../src/rules/simulation-events.js';

function fixture(){
 const s=createGame('引导事件法师',281,0,{classId:8,raceId:1});s.id='mage';s.level=60;s.hp=stats(s).maxHp;s.mana=10000;s.learned=[5143];s.rules=[];
 startCombat(s,[299]);s.nextSwing=1e9;const e=s.combat.enemies[0];
 Object.assign(e,{hp:100000,maxHp:100000,level:1,position:20,positionY:0,nextAttack:1e9,nextSpell:1e9,rootUntil:1e9,ai:{nextCheck:1e9}});
 commandCombatCast(s,s,5143,e.id);assert.ok(s.cast?.channel);return {s,e};
}
const launches=s=>s.logs.filter(l=>l.kind==='launch'&&l.actorId===s.id&&l.spellId===7268);
function run(s,end){while(s.clock<end){s.clock+=100;combatTick(s);}}

test('Arcane Missiles schedules one periodic wake and includes exactly one final pulse',()=>{
 const {s}=fixture(),mana=s.mana,end=s.cast.until;
 assert.equal(s.simulationEvents.queue.events[0].kind,'ChannelTick');assert.equal(end,3000);
 run(s,900);assert.equal(launches(s).length,0);run(s,1000);assert.equal(launches(s).length,1);
 const timer=s.simulationEvents.casts[s.cast.eventId];assert.equal(timer.nextAt,2000);
 assert.equal(s.simulationEvents.queue.events.filter(e=>e.kind==='ChannelTick').length,1);
 run(s,end);assert.equal(s.cast,null);assert.deepEqual(launches(s).map(l=>l.at),[1000,2000,3000]);assert.equal(s.mana,mana);
 run(s,4000);assert.equal(launches(s).length,3);assert.ok(s.combat.enemies[0].hp<100000);
});

test('same-time control cancels a ready periodic effect and its later pulses',()=>{
 const {s}=fixture();s.clock=1000;prepareActorCasts(s);s.stunUntil=5000;combatTick(s);assert.equal(s.cast,null);run(s,4000);
 assert.equal(launches(s).length,0);assert.deepEqual(s.simulationEvents.casts,{});
});

test('moving the target out of range cancels between periodic deadlines',()=>{
 const {s,e}=fixture();run(s,100);e.position=100;run(s,200);assert.equal(s.cast,null);
 run(s,3200);assert.equal(launches(s).length,0);assert.deepEqual(s.simulationEvents.casts,{});
});

test('shortening to before the first pulse wakes at the original 100ms boundary',()=>{
 const {s}=fixture(),mana=s.mana;s.clock=400;shortenCombatChannel(s,s,450);
 const event=s.simulationEvents.queue.events[0];assert.equal(event.atMs,500);
 const restored=JSON.parse(JSON.stringify(s));run(s,500);run(restored,500);
 assert.equal(s.cast,null);assert.equal(launches(s).length,0);assert.equal(s.mana,mana);assert.deepEqual(s,restored);
});

test('repeated shortening replaces the indexed event without tombstone growth',()=>{
 const {s}=fixture();s.clock=100;const sequence=s.simulationEvents.queue.events[0].sequence;
 for(let i=1;i<=200;i++){shortenCombatChannel(s,s,3000-i*12);assert.equal(s.simulationEvents.queue.events.length,1);}
 assert.ok(s.simulationEvents.queue.events[0].sequence>sequence,'earlier wakes must replace their indexed event');
 const restored=JSON.parse(JSON.stringify(s));run(s,3000);run(restored,3000);assert.deepEqual(s,restored);
 assert.equal(launches(s).length,0);assert.equal(s.cast,null);
});

test('shortening after the actor phase can mark immediate completion and restore that position',()=>{
 const {s}=fixture();s.clock=400;prepareActorCasts(s);shortenCombatChannel(s,s,300);
 assert.equal(s.simulationEvents.queue.events.length,0);const restored=JSON.parse(JSON.stringify(s));
 combatTick(s);combatTick(restored);assert.equal(s.cast,null);assert.deepEqual(s,restored);assert.equal(launches(s).length,0);
});

test('an already-due final pulse precedes end even when same-time damage shortens the channel',()=>{
 const {s}=fixture();run(s,2900);s.clock=3000;prepareActorCasts(s);shortenCombatChannel(s,s,2500);
 const restored=JSON.parse(JSON.stringify(s));combatTick(s);combatTick(restored);
 assert.equal(launches(s).length,3);assert.equal(s.cast,null);assert.deepEqual(s,restored);
});

test('actual damage can adopt a restored channel and shorten its deadline',()=>{
 const {s}=fixture(),restored=JSON.parse(JSON.stringify(s));restored.clock=100;
 const sequence=restored.simulationEvents.queue.events[0].sequence;
 hurtPlayer(restored,restored.combat.enemies[0],restored,10);assert.equal(restored.cast.until,2250);
 assert.equal(restored.simulationEvents.queue.events[0].sequence,sequence,'the unchanged first pulse keeps its event ordering');
 run(restored,2300);assert.equal(restored.cast,null);assert.equal(launches(restored).length,2);
});

test('a foreign instance cannot mutate another instance channel after restoration',()=>{
 const {s}=fixture(),restored=JSON.parse(JSON.stringify(s));simulationEventRuntime(restored);
 const foreign={clock:400,nextTick:500,combat:{enemies:[],projectiles:[],participantIds:[]},party:[]};
 const before=JSON.stringify(restored);assert.throws(()=>shortenCombatChannel(foreign,restored,450),/owning event runtime/);assert.equal(foreign.simulationEvents,undefined);assert.equal(JSON.stringify(restored),before);
 restored.clock=400;shortenCombatChannel(restored,restored,450);assert.equal(restored.simulationEvents.queue.events[0].atMs,500);run(restored,500);assert.equal(restored.cast,null);
});

test('channel restoration rejects changed identity, deadline, periodic position and event kind',()=>{
 const {s}=fixture();
 for(const alter of [x=>x.cast.until--,x=>x.cast.next++,x=>x.cast.eventId++,x=>x.simulationEvents.queue.events[0].kind='CastComplete']){
  const invalid=JSON.parse(JSON.stringify(s));alter(invalid);assert.throws(()=>simulationEventRuntime(invalid),/cast|Cast/);
 }
});
