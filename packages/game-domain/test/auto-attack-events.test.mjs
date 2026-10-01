import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick} from '../src/rules/combat.js';
import {autoAttackReady,scheduleAutoAttack,simulationEventRuntime,prepareActorCasts,dueEnemyCastIds} from '../src/rules/simulation-events.js';
import {enemyMeleeTick} from '../src/rules/enemy-melee.js';
import {petTick} from '../src/rules/class-mechanics.js';
import {summonClassPet} from '../src/rules/class-spell-effects.js';
import {spellInfo} from '../src/rules/character.js';
import {items} from '../src/rules/catalog.js';
import {ammoCount} from '../src/rules/ammunition.js';

function fixture(classId=1){
 const s=createGame('攻击事件',283,0,{classId,raceId:classId===3?3:1});s.id='actor';s.level=60;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;s.rules=[];s.learned=[];
 startCombat(s,[299]);s.nextAction=1e9;s.nextSwing=1000;s.rootUntil=1e9;
 Object.assign(s.combat.enemies[0],{hp:1e7,maxHp:1e7,level:60,position:s.position+3,positionY:s.positionY,nextAttack:1e9,nextSpell:1e9,rootUntil:1e9,ai:{nextCheck:1e9}});
 return s;
}
const attacks=s=>s.simulationEvents.queue.events.filter(e=>e.kind==='AutoAttackReady');
function run(s,until){while(s.clock<until){s.clock+=100;combatTick(s);}}

test('enemy hands have independent deadlines and preserve RNG, effects and order through restoration',()=>{
 const s=fixture(),e=s.combat.enemies[0];e.nextAttack=1000;e.nextOffhand=1500;e.dualWield=true;e.swing=2000;s.rngState=123456789;
 const hit=(x,source,target,amount,label,detail)=>{target.hp-=amount;x.observed??=[];x.observed.push({at:x.clock,amount,label,hand:detail.hand});};
 enemyMeleeTick(s,e,s,[s],hit);assert.equal(attacks(s).length,2);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored])for(const at of [900,1000,1400,1500,2900,3000,3500]){x.clock=at;enemyMeleeTick(x,x.combat.enemies[0],x,[x],hit);}
 assert.deepEqual(s,restored);assert.equal(e.nextAttack,5000);assert.equal(e.nextOffhand,5500);
 assert.equal(s.observed[0].hand,'main');assert.equal(s.observed[0].at,1000);assert.equal(s.observed[1].hand,'off');assert.equal(s.observed[1].at,1500);
});

test('a ready swing waits through control and range without adding repeated polling events',()=>{
 const s=fixture();combatTick(s);const id=s.attackEventIds.main;s.stunUntil=2200;run(s,2100);
 assert.equal(s.nextSwing,1000);assert.equal(s.simulationEvents.attacks[id].ready,true);
 assert.equal(attacks(s).some(e=>e.subjectId===id),false);
 const enemy=s.combat.enemies[0];enemy.position=s.position+20;run(s,2600);
 assert.equal(s.nextSwing,1000);assert.equal(s.attackEventIds.main,id);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){x.combat.enemies[0].position=x.position+3;run(x,2700);assert.equal(x.nextSwing,2700+(items[x.equipment[16].id].delay||2000));const next=x.nextSwing;combatTick(x);assert.equal(x.nextSwing,next);}
 assert.deepEqual(s,restored);
});

test('a lethal main hand prevents same-time offhand and extra damage while preserving hand clock advancement',()=>{
 const s=fixture(),e=s.combat.enemies[0];e.nextAttack=e.nextOffhand=0;e.dualWield=true;e.extraAttacks=3;e.swing=2000;s.rngState=123456789;
 const hits=[];enemyMeleeTick(s,e,s,[s],(x,source,target,amount,label,detail)=>{hits.push(detail.hand);target.hp=0;});
 assert.deepEqual(hits,['main']);assert.equal(e.extraAttacks,0);assert.equal(e.nextAttack,2000);assert.equal(e.nextOffhand,2000);
 e.hp=0;s.clock=2000;dueEnemyCastIds(s);assert.deepEqual(s.simulationEvents.attacks,{});
});

test('resetting a scheduled weapon deadline cancels its old event and restores the new boundary',()=>{
 const s=fixture(),e=s.combat.enemies[0];e.nextAttack=5000;assert.equal(autoAttackReady(s,e,'main','enemy'),false);const old=e.attackEventIds.main;
 s.clock=100;e.nextAttack=250;assert.equal(autoAttackReady(s,e,'main','enemy'),false);
 assert.equal(s.simulationEvents.attacks[old],undefined);assert.equal(attacks(s).length,1);assert.equal(attacks(s)[0].atMs,300);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){x.clock=300;const unit=x.combat.enemies[0];assert.equal(autoAttackReady(x,unit,'main','enemy'),true);scheduleAutoAttack(x,unit,'main',2300,'enemy');assert.equal(autoAttackReady(x,unit,'main','enemy'),false);}
 assert.deepEqual(s,restored);
});

test('a script can postpone an existing deadline before checkpointing without executing its stale wake',()=>{
 const s=fixture(),e=s.combat.enemies[0];e.nextAttack=1000;autoAttackReady(s,e,'main','enemy');e.nextAttack=2500;
 const restored=JSON.parse(JSON.stringify(s));simulationEventRuntime(restored);
 for(const x of [s,restored]){x.clock=1000;dueEnemyCastIds(x);assert.equal(autoAttackReady(x,x.combat.enemies[0],'main','enemy'),false);x.clock=2500;assert.equal(autoAttackReady(x,x.combat.enemies[0],'main','enemy'),true);}
 assert.deepEqual(s,restored);
});

test('reusing an enemy slot and public ID cannot transfer its previous incarnation swing',()=>{
 const s=fixture(),old=s.combat.enemies[0];old.nextAttack=1000;autoAttackReady(s,old,'main','enemy');const id=old.attackEventIds.main;
 const next=structuredClone(old);delete next.attackEventIds;next.nextAttack=2000;s.combat.enemies[0]=next;
 autoAttackReady(s,next,'main','enemy');assert.notEqual(next.attackEventIds.main,id);
 s.clock=1000;dueEnemyCastIds(s);assert.equal(s.simulationEvents.attacks[id],undefined);assert.equal(autoAttackReady(s,next,'main','enemy'),false);
 const restored=JSON.parse(JSON.stringify(s));for(const x of [s,restored]){x.clock=2000;assert.equal(autoAttackReady(x,x.combat.enemies[0],'main','enemy'),true);}
 assert.deepEqual(s,restored);
});

test('pet replacement keeps its own attack timer, and the new pet attacks once after restoration',()=>{
 const s=fixture(9);summonClassPet(s,s,spellInfo(s,697));let pet=s.pet;pet.mode='attack';pet.learned=[];pet.autocast=[];pet.target=s.combat.enemies[0].id;pet.position=s.combat.enemies[0].position-3;pet.positionY=s.positionY;pet.nextSwing=1000;
 const damage=(x,source,target,amount)=>{target.hp-=amount;};petTick(s,pet,[s,pet],damage);const old=pet.attackEventIds.main;
 s.clock=100;summonClassPet(s,s,spellInfo(s,697));pet=s.pet;pet.mode='attack';pet.learned=[];pet.autocast=[];pet.target=s.combat.enemies[0].id;pet.position=s.combat.enemies[0].position-3;pet.positionY=s.positionY;pet.nextSwing=2100;
 petTick(s,pet,[s,pet],damage);assert.notEqual(pet.attackEventIds.main,old);s.clock=1000;prepareActorCasts(s);assert.equal(s.simulationEvents.attacks[old],undefined);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){x.clock=2100;prepareActorCasts(x);const hp=x.combat.enemies[0].hp;petTick(x,x.pet,[x,x.pet],damage);assert.ok(x.combat.enemies[0].hp<hp);const after=x.combat.enemies[0].hp;petTick(x,x.pet,[x,x.pet],damage);assert.equal(x.combat.enemies[0].hp,after);}
 assert.deepEqual(s,restored);
});

test('hunter readiness consumes one arrow on attack and waits at its existing ranged deadline',()=>{
 const s=fixture(3);s.nextAction=0;s.learned=[75];s.nextRanged=1000;s.combat.enemies[0].position=s.position+25;
 const count=ammoCount(s);assert.ok(count>0);combatTick(s);run(s,900);assert.equal(ammoCount(s),count);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){run(x,1000);assert.equal(ammoCount(x),count-1);const next=x.nextRanged;combatTick(x);assert.equal(ammoCount(x),count-1);assert.equal(x.nextRanged,next);assert.equal(attacks(x).filter(e=>e.subjectId===x.attackEventIds.ranged).length,1);}
 assert.deepEqual(s,restored);
});

test('current haste semantics change the next interval without restarting an in-progress enemy swing',()=>{
 const s=fixture(),e=s.combat.enemies[0];e.nextAttack=1000;e.swing=2000;
 enemyMeleeTick(s,e,s,[s],()=>{});s.clock=500;e.auras=[{type:9,amount:100,until:10000}];enemyMeleeTick(s,e,s,[s],()=>{});assert.equal(e.nextAttack,1000);
 s.clock=1000;enemyMeleeTick(s,e,s,[s],()=>{});assert.equal(e.nextAttack,2000);
});

test('cold adoption rejects missing, duplicate, early and foreign attack timers',()=>{
 const s=fixture();autoAttackReady(s,s);
 for(const mutate of [x=>x.simulationEvents.queue.events.pop(),x=>x.simulationEvents.attacks[x.attackEventIds.main].atMs--,x=>x.simulationEvents.attacks[x.attackEventIds.main].ready=true,x=>x.simulationEvents.attackSequence=0,x=>x.simulationEvents.attacks[x.attackEventIds.main].hand='off',x=>x.simulationEvents.attacks[x.attackEventIds.main].actorId='foreign',x=>{const q=x.simulationEvents.queue;q.events.push({...q.events[0],sequence:q.nextSequence++});}]){
  const invalid=JSON.parse(JSON.stringify(s));mutate(invalid);assert.throws(()=>simulationEventRuntime(invalid),/attack|Attack|heap|Heap/);
 }
});

test('player offhand waits through disarm and remains independent from the main-hand clock',()=>{
 const s=fixture(4);s.equipment[17]={...s.equipment[16]};s.learned=[674];s.nextSwing=5000;s.nextOffhand=1000;
 combatTick(s);const id=s.attackEventIds.off;s.auras=[{type:67,amount:1,until:2000}];run(s,1500);
 assert.equal(s.nextOffhand,1000);assert.equal(s.nextSwing,5000);assert.equal(s.simulationEvents.attacks[id].ready,true);
 const restored=JSON.parse(JSON.stringify(s));
 for(const x of [s,restored]){run(x,2000);assert.equal(x.nextSwing,5000);assert.equal(x.nextOffhand,2000+(items[x.equipment[17].id].delay||2000));assert.equal(x.attackEventIds.off,id);}
 assert.deepEqual(s,restored);
});

test('repeated script resets keep one pending attack, and a new encounter removes its old binding',()=>{
 const s=fixture();autoAttackReady(s,s);
 for(let i=0;i<2000;i++){s.nextSwing=2000+i;assert.equal(autoAttackReady(s,s),false);}
 assert.equal(attacks(s).length,1);assert.equal(Object.keys(s.simulationEvents.attacks).length,1);
 startCombat(s,[299]);assert.equal(s.attackEventIds,undefined);assert.equal(s.simulationEvents.queue.events.length,0);
 assert.equal(autoAttackReady(s,s),true);scheduleAutoAttack(s,s,'main',2000);assert.equal(attacks(s).length,1);
});
