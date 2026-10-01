import test from 'node:test';
import assert from 'node:assert/strict';
import {scenePath,sceneWaypoint,sceneSight,clearSceneSegment,clipSceneMove} from '../../sim-core/src/scene-space.js';
import {point,distance} from '../../sim-core/src/geometry.js';
import {createGame} from '../src/rules/engine.js';
import {startCombat} from '../src/rules/combat.js';
import {validateCombatArea} from '../src/rules/combat-area.js';
import {moveToward,inSpellRange,combatSight} from '../src/rules/combat-space.js';
import {combatInputReadyReason} from '../src/rules/combat-input.js';
import {projectCombatObservation} from '../src/rules/combat-observation.js';
import {enemyMeleeTick} from '../src/rules/enemy-melee.js';
import {castEnemySpell,tickEnemySpell} from '../src/rules/enemy-spells.js';
import {spellInfo} from '../src/rules/character.js';

const room=()=>({id:'test-room',shape:'rectangle',minX:-25,maxX:25,minY:-15,maxY:15,navigationRevision:0,obstacles:[{x:0,y:0,radius:3}]});
function fixture(){
 const s=createGame('场景法师',281,0,{classId:8,raceId:1});s.id='mage';
 startCombat(s,[636],true,null,room());delete s.combat.pull;
 Object.assign(s,{position:-10,positionY:0,mana:10000});
 const enemy=s.combat.enemies[0];Object.assign(enemy,{position:10,positionY:0,mana:10000});
 return {s,enemy};
}

test('movement barriers and sight occluders are independent; neither is a damage hazard',()=>{
 const a=room(),from={x:-10,y:0},to={x:10,y:0};
 a.obstacles[0].blocksSight=false;
 assert.equal(sceneSight(a,from,to),true);assert.equal(clearSceneSegment(a,from,to),false);
 assert.ok(scenePath(a,from,to).length>1);assert.ok(clipSceneMove(a,from,to).x<0);
 a.obstacles[0].blocksSight=true;a.obstacles[0].blocksMovement=false;a.navigationRevision++;
 assert.equal(sceneSight(a,from,to),false);assert.equal(clearSceneSegment(a,from,to),true);
 assert.deepEqual(scenePath(a,from,to),[to]);assert.deepEqual(clipSceneMove(a,from,to),to);
});

test('PvE actors follow collision-free paths and resume identically after serialization',()=>{
 const {s,enemy}=fixture();
 for(let n=0;n<10;n++){s.clock+=100;moveToward(s,s,enemy,5,s.clock);}
 const restored=JSON.parse(JSON.stringify(s));
 for(let n=0;n<100;n++){
  const before=point(s);s.clock+=100;restored.clock=s.clock;
  moveToward(s,s,enemy,5,s.clock);moveToward(restored,restored,restored.combat.enemies[0],5,restored.clock);
  assert.equal(clearSceneSegment(s.combat.area,before,s,.45),true);
  assert.ok(distance(before,s)<=.7000001);assert.deepEqual(point(s),point(restored));
  assert.deepEqual(s.scenePath,restored.scenePath);
 }
 assert.ok(distance(s,enemy)<=5+1e-8);assert.equal(combatSight(s,s,enemy),true);
});

test('scene revision invalidates both cached routes and obstacle graph without waiting for timeout',()=>{
 const area=room(),unit={position:-10,positionY:0},target={x:10,y:0};
 sceneWaypoint(area,unit,target,0);assert.ok(unit.scenePath.points.length>1);
 area.obstacles[0].blocksMovement=false;area.navigationRevision++;
 assert.deepEqual(sceneWaypoint(area,unit,target,1),target);
 area.obstacles[0].blocksMovement=true;area.obstacles[0].radius=5;area.navigationRevision++;
 sceneWaypoint(area,unit,target,2);assert.ok(unit.scenePath.points.length>1);
 let previous=point(unit);
 for(const p of unit.scenePath.points){assert.equal(clearSceneSegment(area,previous,p,.45),true);previous=p;}
 const unreachable={x:0,y:0};assert.deepEqual(scenePath(area,unit,unreachable),[]);
});

test('spell inputs and bot observations use the same PvE sight checks for damage and healing',()=>{
 const {s,enemy}=fixture(),fireball=spellInfo(s,133);
 assert.equal(inSpellRange(s,s,enemy,fireball),false);
 assert.equal(combatInputReadyReason(s,s,fireball,enemy),'目标不在视线内');
 const observed=projectCombatObservation(s);
 assert.equal(inSpellRange(observed,observed,observed.combat.enemies[0],fireball),false);
 assert.equal(observed.arenaArea,undefined);
 const ally={...s,id:'ally',position:10,positionY:0};delete ally.combat;s.party=[ally];s.combat.participantIds.push(ally.id);
 s.learned.push(2050);const heal=spellInfo(s,2050);
 assert.equal(combatInputReadyReason(s,s,heal,ally),'目标不在视线内');
 s.combat.area.obstacles[0].blocksSight=false;
 assert.equal(combatInputReadyReason(s,s,heal,ally),'');
});

test('enemy attacks and cast completion cannot bypass a newly closed sight barrier',()=>{
 const {s,enemy}=fixture();s.combat.area.obstacles[0].radius=.5;
 s.position=-1;enemy.position=1;
 let hits=0;const hurt=()=>hits++;
 const rng=s.rngState;
 enemyMeleeTick(s,enemy,s,[s],hurt);assert.equal(hits,0);assert.equal(s.rngState,rng);
 assert.equal(castEnemySpell(s,enemy,s,133,[s],hurt),false);
 s.combat.area.obstacles[0].blocksSight=false;
 assert.equal(castEnemySpell(s,enemy,s,133,[s],hurt),true);assert.ok(enemy.cast);
 s.combat.area.obstacles[0].blocksSight=true;s.clock=enemy.cast.until;
 tickEnemySpell(s,enemy,[s],hurt);
 assert.equal(enemy.cast,null);assert.equal(hits,0);assert.equal(s.combat.projectiles.length,0);
});

test('scene boundaries reject malformed or unbounded obstacle content',()=>{
 for(const obstacles of [[{x:0,y:0,radius:-1}],[{x:NaN,y:0,radius:1}],[{x:0,y:0,radius:1,blocksSight:'yes'}],Array.from({length:33},()=>({x:0,y:0,radius:1}))]){
  assert.throws(()=>validateCombatArea({...room(),obstacles}),/障碍/);
 }
 assert.throws(()=>validateCombatArea({...room(),navigationRevision:-1}),/导航版本/);
});
