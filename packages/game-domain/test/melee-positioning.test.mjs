import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats} from '../src/rules/engine.js';
import {startCombat,combatTick,executeCombatIntent} from '../src/rules/combat.js';
import {meleePositionDestination,positionMelee,hasTailSweep} from '../src/rules/combat-positioning.js';
import {behindTarget} from '../src/rules/combat-space.js';
import {selectCombatPolicy} from '../src/rules/bot-strategies.js';
import {petTick} from '../src/rules/class-mechanics.js';
import {distance} from '../../sim-core/src/geometry.js';
import {fieldContains,sectorField} from '../../sim-core/src/encounter-geometry.js';

function fixture(classId=1,entry=299){
 const s=createGame('站位',143,0,{classId,raceId:classId===7?2:classId===11?4:classId===3?3:1});
 s.level=60;s.hp=stats(s).maxHp;s.rules=[];s.learned=[];
 s.strategyPolicy={role:'melee',waitForTank:false};
 startCombat(s,[entry]);s.clock=1000;
 const e=s.combat.enemies[0];Object.assign(e,{hp:1e7,maxHp:1e7,position:30,positionY:0,combatFacing:0,target:'tank',threat:{tank:1e9},rootUntil:1e9});
 s.position=34;s.positionY=0;s.target=e.id;
 return {s,e};
}
function settle(s,c,e){for(let i=0;i<150&&meleePositionDestination(s,c,e);i++){positionMelee(s,c,e);s.clock+=100;}assert.equal(meleePositionDestination(s,c,e),null);}

for(const [classId,form] of [[1,null],[2,null],[4,null],[7,null],[11,'cat'],[11,'bear']])test(`melee class ${classId} ${form||''} moves directly to the rear and holds close range`,()=>{
 const {s,e}=fixture(classId);s.form=form;
 const intent=selectCombatPolicy(s,s);assert.equal(intent?.mode,'melee');
 assert.equal(executeCombatIntent(s,s,intent).accepted,true);
 settle(s,s,e);assert.ok(behindTarget(s,e));assert.ok(Math.abs(distance(s,e)-2)<=.2);
 const before=[s.position,s.positionY];assert.equal(positionMelee(s,s,e),false);assert.deepEqual([s.position,s.positionY],before);
 e.combatFacing=Math.PI/2;settle(s,s,e);assert.ok(behindTarget(s,e));
 e.target=s.id;assert.equal(meleePositionDestination(s,s,e),null);
});

for(const y of [-2,2])test(`tail sweep targets are approached on the nearest safe flank (${y})`,()=>{
 const {s,e}=fixture(4,10184);s.positionY=y;assert.ok(hasTailSweep(e));settle(s,s,e);
 assert.equal(Math.sign(s.positionY),Math.sign(y));assert.ok(Math.abs(distance(s,e)-2)<=.2);
 assert.equal(fieldContains(sectorField({x:e.position,y:e.positionY},15,Math.PI,Math.PI),s),false);
 assert.equal(fieldContains(sectorField({x:e.position,y:e.positionY},40,0,Math.atan(.55)*2),s),false);
});

test('pets use the same rear/flank movement through their combat tick',()=>{
 for(const entry of [299,10184]){
  const {s,e}=fixture(3,entry),pet={id:'pet',ownerId:s.id,petUnit:true,kind:'wolf',mode:'defensive',hp:100,level:60,position:34,positionY:2,target:e.id,auras:[],talents:{},cooldowns:{},learned:[],nextSwing:1e9};
  for(let i=0;i<100&&meleePositionDestination(s,pet,e);i++){petTick(s,pet,[s,pet],()=>{});s.clock+=100;}
  assert.equal(meleePositionDestination(s,pet,e),null);assert.ok(Math.abs(distance(pet,e)-2)<=.2);
  assert.equal(behindTarget(pet,e),entry!==10184);
 }
});

test('live combat integrates melee positioning even without positional abilities',()=>{
 const {s,e}=fixture();const tank={...structuredClone(s),id:'tank',position:34,positionY:0,pet:null,party:[],strategyPolicy:{role:'tank',waitForTank:false}};
 delete tank.combat;s.party=[tank];s.combat.participantIds.push(tank.id);
 for(let i=0;i<70;i++){s.clock+=100;combatTick(s);}
 assert.equal(e.target,tank.id);assert.ok(behindTarget(s,e));assert.ok(Math.abs(distance(s,e)-2)<=.2);
 assert.ok(s.logs.some(l=>l.actorId===s.id&&l.kind==='damage'));
});

test('ranged, tanked, airborne, unengaged, PvP and controlled movement retain their behavior',()=>{
 const {s,e}=fixture();
 for(const patch of [{strategyPolicy:{role:'ranged'}},{strategyPolicy:{role:'healer'}},{cast:{spell:1}},{stealthed:true},{petUnit:true,kind:'imp'},{petUnit:true,kind:'wolf',mode:'stay'}])assert.equal(meleePositionDestination(s,{...s,...patch},e),null);
 for(const patch of [{target:s.id},{target:null},{airborne:true},{hp:0},{controlledBy:s.id}])assert.equal(meleePositionDestination(s,s,{...e,...patch}),null);
 s.combat.pvp=true;assert.equal(meleePositionDestination(s,s,e),null);s.combat.pvp=false;
 s.rootUntil=s.clock+1000;assert.equal(positionMelee(s,s,e),false);s.rootUntil=0;
 s.combat.command={movementTasks:[{memberId:s.id}]};assert.equal(positionMelee(s,s,e),false);
});

test('tail-safe rotation skips rear-only attacks instead of circling back into the tail',()=>{
 const {s,e}=fixture(4,10184);s.learned=[53,1752];s.equipment[16]={id:2092};s.energy=100;
 s.rules=s.learned.map(spell=>({spell,condition:'always',value:0,enabled:true}));
 settle(s,s,e);const intent=selectCombatPolicy(s,s);
 assert.equal(intent?.kind,'cast');assert.equal(intent?.spellId,1752);
});

test('direct positioning continues identically after serializing mid-movement',()=>{
 const {s,e}=fixture();
 for(let i=0;i<4;i++){positionMelee(s,s,e);s.clock+=100;}
 const copy=JSON.parse(JSON.stringify(s)),target=copy.combat.enemies[0];
 settle(s,s,e);settle(copy,copy,target);
 assert.deepEqual([s.position,s.positionY,s.clock],[copy.position,copy.positionY,copy.clock]);
});

test('rear positioning crosses the monster directly instead of circling its perimeter',()=>{
 const {s,e}=fixture();let crossed=false;
 for(let i=0;i<30&&meleePositionDestination(s,s,e);i++){
  positionMelee(s,s,e);s.clock+=100;
  assert.ok(Math.abs(s.positionY-e.positionY)<1e-8);
  crossed ||= distance(s,e)<.5;
 }
 assert.ok(crossed);assert.ok(behindTarget(s,e));
 assert.ok(Math.abs(distance(s,e)-2)<=.2);
});
