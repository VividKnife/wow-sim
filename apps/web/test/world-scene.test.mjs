import test from 'node:test';
import assert from 'node:assert/strict';
import {worldSceneState,worldMountDisplays,worldScenery,worldFlightMount} from '../lib/world-scene.js';
import {assetUrl} from '../lib/wowhead-model-assets.js';
import {worldCamera} from '../public/model-viewer/world-camera.js';
const player={hp:100,location:'goldshire',activity:{type:'idle'}};
const data={map:[{id:'logging',name:'东谷伐木场'}]};
test('travel animates only genuine movement, with destination and mount independent of equipment',()=>{
 assert.equal(worldSceneState(player,data).animation,'Stand');
 for(const type of ['hunt','mount','gather','teleport','hearth'])assert.equal(worldSceneState({...player,activity:{type}},data).animation,'Stand',type);
 const walking=worldSceneState({...player,activity:{type:'travel',to:'logging'}},data);
 assert.equal(walking.animation,'Run');assert.equal(walking.destination,'东谷伐木场');assert.equal(walking.mountDisplayId,0);
 const riding=worldSceneState({...player,mounted:900020,activity:{type:'travel'}},data);
 assert.equal(riding.animation,'Run');assert.equal(riding.mountDisplayId,2404);
 assert.equal(worldSceneState({...player,mounted:900020},data).animation,'Stand');
});
test('combat and death override stale travel and mounted state',()=>{
 const stale={...player,mounted:900020,activity:{type:'travel'}};
 const combat=worldSceneState({...stale,combat:{id:'fight'}},data);
 assert.equal(combat.combat,true);assert.equal(combat.moving,false);assert.equal(combat.mountDisplayId,0);
 const dead=worldSceneState({...stale,hp:0},data);
 assert.equal(dead.animation,'Death');assert.equal(dead.moving,false);assert.equal(dead.mountDisplayId,0);
 assert.equal(worldSceneState({...stale,combat:null,activity:{type:'idle'}},data).animation,'Stand');
});
test('flight never plays a ground-running horse animation',()=>{
 const scene=worldSceneState({...player,mounted:900020,activity:{type:'travel',flight:true}},data);
 assert.equal(scene.flying,true);assert.equal(scene.animation,'Fly');assert.equal(scene.mountDisplayId,1149);
});
test('flight service follows departure point, including cross-faction riders',()=>{
 const map=[{id:'stormwind',faction:'Alliance',map:0},{id:'orgrimmar',faction:'Horde',map:1},{id:'darnassus',faction:'Alliance',map:1}];
 for(const [from,id] of [['stormwind',1149],['orgrimmar',295],['darnassus',3210]]){
  assert.equal(worldFlightMount({...player,raceId:2,activity:{from}}, {map}).displayId,id);
 }
});
test('arrival removes the flying model and progress is clamped to the route',()=>{
 const activity={type:'travel',flight:true,startedAt:1000,endsAt:11000};
 assert.equal(worldSceneState({...player,clock:6000,activity},data).flightProgress,.5);
 assert.equal(worldSceneState({...player,clock:12000,activity},data).flightProgress,1);
 const landed=worldSceneState({...player,clock:11000,activity:{type:'idle'}},data);
 assert.equal(landed.flying,false);assert.equal(landed.mountDisplayId,0);assert.equal(landed.animation,'Stand');
});
test('unsupported mounts are not silently replaced by a different horse',()=>{
 assert.equal(worldSceneState({...player,mounted:999999},data).mountDisplayId,0);
 assert.equal(Object.keys(worldMountDisplays).length,11);
});
test('numeric NPC metadata is allowed without opening arbitrary relay hosts or paths',()=>{
 assert.equal(assetUrl('meta/npc/2404.json'),'https://wow.zamimg.com/modelviewer/classic/meta/npc/2404.json');
 for(const path of ['meta/npc/../2404.json','meta/npc/0.json','meta/npc/2404.json?url=https://example.com','meta/npc/example.json'])assert.equal(assetUrl(path),null);
});
test('backgrounds follow region, with a stable fallback',()=>{
 assert.equal(worldScenery({region:'艾尔文'}),'forest');assert.equal(worldScenery({region:'铁炉堡'}),'snow');assert.equal(worldScenery({region:'奥格瑞玛'}),'arid');assert.equal(worldScenery({region:'暮色森林'}),'dusk');assert.equal(worldScenery(null),'forest');
});
test('45 degree mounted camera fits every bounding-box corner on desktop and mobile',()=>{
 for(const bounds of [[[0,0,0],[2,2,4]],[[-7,-3,-1],[7,5,6]]])for(const aspect of [.8,1.85]){
  const camera=worldCamera(bounds,aspect),a=Math.sin(camera.azimuth),b=Math.cos(camera.azimuth),c=Math.cos(camera.zenith),d=Math.sin(camera.zenith);
  assert.ok(Math.abs(-Math.cos(camera.zenith)-Math.SQRT1_2)<1e-10);
  for(const x of [bounds[0][0],bounds[1][0]])for(const y of [bounds[0][1],bounds[1][1]])for(const z of [bounds[0][2],bounds[1][2]]){
   const p=[x,y,z].map((value,i)=>value-camera.center[i]);
   const depth=camera.distance+d*b*p[0]+d*a*p[1]+c*p[2];
   assert.ok(Math.abs(a*p[0]-b*p[1])<depth*Math.tan(Math.PI/12)*aspect);
   assert.ok(Math.abs(-b*c*p[0]-a*c*p[1]+d*p[2])<depth*Math.tan(Math.PI/12));
  }
 }
});

test('corpse recovery animates the dead leader as an unmounted spirit, then restores life',()=>{
 const fallen={...player,id:'leader',hp:0,mounted:900020};
 const activity={type:'revive',targets:['leader'],flight:true};
 const ghost=worldSceneState({...fallen,activity},data);
 assert.equal(ghost.ghost,true);assert.equal(ghost.animation,'Run');assert.equal(ghost.moving,true);
 assert.equal(ghost.mountDisplayId,0);assert.equal(ghost.flying,false);assert.match(ghost.label,/跑尸/);
 const alive=worldSceneState({...fallen,hp:50,mounted:null,activity:{type:'idle'}},data);
 assert.equal(alive.ghost,false);assert.equal(alive.animation,'Stand');assert.equal(alive.moving,false);
 for(const state of [{...fallen,activity:{type:'dead'}},{...fallen,activity,combat:{}},{...fallen,activity:{type:'revive',targets:['companion']}}]){
  const scene=worldSceneState(state,data);assert.equal(scene.ghost,false);assert.equal(scene.animation,'Death');assert.equal(scene.moving,false);
 }
 const leader=worldSceneState({...player,id:'leader',activity:{type:'revive',targets:['companion']}},data);
 assert.equal(leader.ghost,false);assert.equal(leader.moving,false);assert.equal(leader.animation,'Stand');
});
