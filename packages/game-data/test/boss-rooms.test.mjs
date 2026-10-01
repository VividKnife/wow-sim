import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../source/boss-rooms.json' with {type:'json'};
import compiled from '../data/boss-rooms.json' with {type:'json'};
import {compileBossRooms,REQUIRED_BOSS_ROOMS} from '../../../scripts/compile-boss-rooms.mjs';
import {scenePath,clearSceneSegment,sceneSight} from '../../sim-core/src/scene-space.js';
import {roomPointInside} from '../../sim-core/src/room-geometry.js';
import {spiralField,fieldContains} from '../../sim-core/src/encounter-geometry.js';

const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2);
const invalid=mutate=>{const rooms=structuredClone(source);mutate(rooms);return()=>compileBossRooms(rooms);};

test('all eleven raid floors compile reproducibly without changing source data',()=>{
 const before=structuredClone(source);
 assert.deepEqual(Object.keys(compiled).sort(),[...REQUIRED_BOSS_ROOMS].sort());
 assert.deepEqual(compileBossRooms(source),compiled);
 assert.deepEqual(compileBossRooms(source),compileBossRooms(source));
 assert.deepEqual(source,before);
 assert.equal(new Set(Object.values(compiled).map(room=>JSON.stringify(room.boundary))).size,11);
 for(const room of Object.values(compiled)){
  assert.equal(room.navigation.triangles.length,room.boundary.length-2,room.id);
  assert.equal(room.navigation.portals.length,room.navigation.triangles.length-1,room.id);
  assert.ok(Math.abs(room.navigation.triangles.reduce((sum,t)=>sum+area(t.map(i=>room.boundary[i])),0)-area(room.boundary))<1e-7,room.id);
 }
});

test('every semantic anchor is reachable with collision-safe deterministic paths',()=>{
 let detours=0;
 for(const room of Object.values(compiled)){
  const restored=JSON.parse(JSON.stringify(room));
  for(const [fromName,from]of Object.entries(room.anchors))for(const [toName,to]of Object.entries(room.anchors)){
   const label=`${room.id}: ${fromName} -> ${toName}`;
   const path=scenePath(room,from,to);
   assert.ok(path.length,label);
   assert.deepEqual(path.at(-1),to,label);
   assert.deepEqual(scenePath(restored,from,to),path,label);
   let previous=from;
   for(const waypoint of path){assert.equal(clearSceneSegment(room,previous,waypoint,.45),true,label);previous=waypoint;}
   if(!sceneSight(room,from,to)){assert.ok(path.length>1,label);detours++;}
  }
 }
 assert.ok(detours>0,'concave floors must exercise navigation around walls');
});

test('Ragnaros lava spiral is inside the floor and sons appear outside it',()=>{
 const room=compiled.ragnaros,field=spiralField(room.anchors.boss);
 for(const p of field.points)assert.equal(roomPointInside(room.boundary,p,1),true);
 for(let i=0;i<8;i++)assert.equal(fieldContains(field,room.anchors[`son${i}`],1.5),false,`son${i}`);
 const geddon=compiled['baron-geddon'];
 for(const key of ['bombEscapeNorth','bombEscapeSouth']){
  assert.ok(Math.hypot(geddon.anchors[key].x-geddon.anchors.ranged.x,geddon.anchors[key].y-geddon.anchors.ranged.y)>25);
 }
});

test('compiler rejects incomplete schemas and malformed authored polygons',()=>{
 assert.throws(invalid(rooms=>delete rooms.garr),/Missing boss room: garr/);
 assert.throws(invalid(rooms=>rooms.garr.id=rooms.lucifron.id),/unique/);
 assert.throws(invalid(rooms=>delete rooms.garr.anchors.adds),/missing anchor adds/);
 assert.throws(invalid(rooms=>rooms.garr.anchors.adds={x:999,y:0}),/anchor adds/);
 assert.throws(invalid(rooms=>rooms.garr.anchors.adds.x=NaN),/anchor adds/);
 assert.throws(invalid(rooms=>rooms.garr.appearance.floor='lava'),/hex colors/);
 assert.throws(invalid(rooms=>rooms.garr.version=0),/positive integer/);
 assert.throws(invalid(rooms=>rooms.garr.navigation={}),/generated/);
 assert.throws(invalid(rooms=>rooms.garr.boundary.reverse()),/counter-clockwise/);
 assert.throws(invalid(rooms=>rooms.garr.boundary=[{x:0,y:0},{x:3,y:3},{x:0,y:3},{x:3,y:0}]),/intersects/);
});

test('compiler rejects cramped preparation areas and floors that clip the lava spiral',()=>{
 assert.throws(invalid(rooms=>rooms.garr.anchors.assembly=rooms.garr.anchors.entrance),/assembly cannot hold 40 players/);
 assert.throws(invalid(rooms=>{
  const room=rooms.ragnaros;
  room.boundary=[{x:-25,y:-22},{x:60,y:-22},{x:60,y:22},{x:-25,y:22}];
  for(const key of Object.keys(room.anchors))room.anchors[key]={x:30,y:0};
  room.anchors.assembly={x:0,y:0};
 }),/entire lava spiral/);
});
