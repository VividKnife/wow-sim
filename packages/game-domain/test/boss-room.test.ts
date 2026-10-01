import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeRoomNavigation,roomPointInside,roomSegmentInside} from '../../sim-core/src/room-geometry.js';
import {scenePath,scenePointAllowed,sceneSight,clipSceneMove,clearSceneSegment} from '../../sim-core/src/scene-space.js';
import {bossCombatArea,validateCombatArea} from '../src/rules/combat-area.js';
import {fieldSafePoint,rectangleField,fieldContains} from '../../sim-core/src/encounter-geometry.js';
import {createMoltenCoreDemo} from '../src/molten-core-demo.ts';
import {beginMoltenCoreBattle} from '../src/rules/molten-core-battle.js';
import {enterGoldRaid,goldRaidAction} from '../src/rules/gold-raid.js';
import {defaultRaidTactics,moltenCoreTick} from '../src/rules/molten-core-encounter.js';
import {advanceOwned} from '../src/rules/engine.js';
import {instancePresentation} from '../src/rules/instance-presentation.js';
import {combatMembers} from '../src/rules/combat-members.js';
import type {Rules} from '../src/model.ts';

test('compiled room mesh covers the authored floor and rejects malformed geometry',()=>{
 const a=bossCombatArea('onyxia')!;
 assert.equal(a.navigation.triangles.length,a.boundary.length-2);
 const area=(p:any[])=>Math.abs(p.reduce((n,v,i)=>{const w=p[(i+1)%p.length];return n+v.x*w.y-w.x*v.y;},0)/2);
 assert.equal(a.navigation.triangles.reduce((sum:number,t:number[])=>sum+area(t.map(i=>a.boundary[i])),0),area(a.boundary));
 assert.equal(a.navigation.portals.length,a.navigation.triangles.length-1);
 assert.throws(()=>bakeRoomNavigation([{x:0,y:0},{x:3,y:3},{x:0,y:3},{x:3,y:0}]),/intersect/);
 assert.throws(()=>bakeRoomNavigation([...a.boundary].reverse()),/counter-clockwise/);
 const bad=structuredClone(a);bad.navigation.triangles[0][0]=999;assert.throws(()=>validateCombatArea(bad),/导航/);
 for(const anchor of Object.values(a.anchors))assert.equal(scenePointAllowed(a,anchor),true);
});

test('concave entrance blocks shortcuts and sight, navigation routes inside every wall after restoration',()=>{
 const a=bossCombatArea('onyxia')!,from={x:-17,y:0},to={x:-8,y:14};
 assert.equal(sceneSight(a,from,to),false);
 assert.equal(roomSegmentInside(a.boundary,from,to),false);
 const path=scenePath(a,from,to);assert.ok(path.length>1);
 assert.deepEqual(scenePath(JSON.parse(JSON.stringify(a)),from,to),path);
 let p=from;for(const q of path){assert.equal(clearSceneSegment(a,p,q,.45),true);p=q;}
 assert.deepEqual(p,to);
 const clipped=clipSceneMove(a,from,to);assert.ok(scenePointAllowed(a,clipped));assert.notDeepEqual(clipped,to);
 assert.deepEqual(scenePath(a,from,{x:-17,y:14}),[]);
 assert.equal(roomPointInside(a.boundary,{x:-17,y:5},2),false);
 assert.equal(roomPointInside(a.boundary,{x:-17,y:0},2),true);
});

test('safe destinations stay on the actual floor rather than inside its bounding rectangle',()=>{
 const a=bossCombatArea('onyxia')!,fire=rectangleField(-20,-11,-6,6),safe=fieldSafePoint({x:-17,y:0},[fire],a);
 assert.equal(scenePointAllowed(a,safe,1),true);assert.equal(fieldContains(fire,safe,1.5),false);
});

test('40-player Onyxia uses room anchors and resumes identical movement with spawned adds',()=>{
 const s:Rules=createMoltenCoreDemo().state;s.party=s.party.slice(0,4);s.growthPolicy='player';
 enterGoldRaid(s,'onyxias-lair');for(const type of ['goldPublish','goldRecommend','goldLaunch'])goldRaidAction(s,{type});
 const before=structuredClone(s),preparation=instancePresentation(s)!;assert.deepEqual(s,before);assert.equal(preparation.area.id,'onyxia-lair');
 for(const actor of preparation.units)assert.equal(scenePointAllowed(preparation.area,actor),true);
 beginMoltenCoreBattle(s,'onyxia',{...defaultRaidTactics});assert.equal(s.party.length,39);
 const a=s.combat.area;assert.equal(a.id,'onyxia-lair');assert.equal(a.geometryHash,preparation.area.geometryHash);
 assert.deepEqual({x:s.combat.enemies[0].position,y:s.combat.enemies[0].positionY},a.anchors.boss);
 const tank=s.party.find((c:Rules)=>c.raidMainTank)||s;assert.deepEqual({x:tank.position,y:tank.positionY},a.anchors.mainTank);
 for(const actor of [s,...s.party,...s.combat.enemies])assert.equal(scenePointAllowed(a,actor),true,actor.id);
 s.combat.enemies[0].hp*=.6;moltenCoreTick(s,[s,...s.party],()=>{});
 const adds=s.combat.enemies.filter((e:Rules)=>e.summonedBy);assert.equal(adds.length,2);
 assert.deepEqual(adds.map((e:Rules)=>({x:e.position,y:e.positionY})),[a.anchors.whelpSouth,a.anchors.whelpNorth]);
 const restored=JSON.parse(JSON.stringify(s));
 for(let i=0;i<30;i++)for(const state of [s,restored]){
  advanceOwned(state,state.wallAt+100);
  for(const actor of [...combatMembers(state),...state.combat.enemies])if(actor.hp>0)assert.equal(scenePointAllowed(a,actor),true,actor.id);
 }
 assert.deepEqual(restored,s);
});
