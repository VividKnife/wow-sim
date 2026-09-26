import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {scenePresentation,instanceActions} from '../lib/scene-presentation.js';
import {travelMapFrame,playerMapPoint,mapRegions} from '../lib/world-map.js';
import {atlasLabels} from '../lib/world-atlas-layout.js';
import atlas from '../../../packages/game-data/data/world-atlas.json' with {type:'json'};
import backgrounds from '../../../packages/game-data/data/scene-backgrounds.json' with {type:'json'};
import {nodes} from '../../../packages/game-domain/src/rules/catalog.js';
import {dungeonDefinitions} from '../../../packages/game-domain/src/rules/dungeon-registry.js';
import dungeonPresentation from '../../../packages/game-data/data/dungeon-presentation.json' with {type:'json'};
import sources from '../../../docs/research/import/scene-backgrounds-manifest.json' with {type:'json'};

const map=[{id:'goldshire',name:'闪金镇',region:'艾尔文'},{id:'northshire',name:'北郡修道院',region:'北郡'},{id:'stormwind',name:'暴风城',region:'暴风城'}];
const data={map,location:map[0]};
const travel={location:'goldshire',hp:100,clock:0,activity:{type:'travel',from:'goldshire',to:'stormwind',startedAt:0,endsAt:2000,path:[{a:'goldshire',b:'northshire',duration:1000},{a:'northshire',b:'stormwind',duration:1000}]}};
test('title, scenery and minimap follow road segments without mutating authoritative arrival',()=>{
 for(const [clock,name,region] of [[0,'闪金镇','艾尔文'],[600,'北郡修道院','艾尔文'],[1200,'北郡修道院','艾尔文'],[1600,'暴风城','暴风城']]){
  const state={...travel,clock},scene=scenePresentation(state,data),pin=playerMapPoint(travelMapFrame(state).journey,map);
  assert.equal(scene.name,name);assert.equal(scene.region,region);assert.equal(pin.region,region);
  assert.equal(state.location,'goldshire');assert.equal(scene.image,backgrounds.regions[region]);
 }
});
test('arrival, return journeys, rerouting and flight use the same scene selection',()=>{
 const reverse={...travel,activity:{...travel.activity,from:'stormwind',to:'goldshire',path:[{a:'goldshire',b:'stormwind',duration:2000}]}};
 assert.equal(scenePresentation(reverse,data).name,'暴风城');
 assert.equal(scenePresentation({...reverse,clock:1100},data).name,'闪金镇');
 const reroute={...travel,activity:{...travel.activity,endsAt:1000,path:[{a:'goldshire',b:'stormwind',startProgress:.4,duration:1000}]}};
 assert.equal(scenePresentation({...reroute,clock:200},data).name,'暴风城');
 assert.equal(scenePresentation({...travel,clock:1600,activity:{...travel.activity,flight:true}},data).name,'暴风城');
 assert.equal(scenePresentation({...travel,location:'stormwind',activity:{type:'idle'}},data).name,'暴风城');
});
test('instance scenery wins over outdoor location and dungeon actions respect actual locks',()=>{
 const state={...travel,dungeon:{id:'deadmines'},activity:{type:'idle'}},d={...data,dungeon:{id:'deadmines',name:'死亡矿井',locationId:'mine',route:[{id:'mine',name:'矿井通道'}],canNext:true},recovery:{canRest:true,canRevive:false,fallen:[]}};
 assert.equal(scenePresentation(state,d).name,'矿井通道');assert.equal(scenePresentation(state,d).image,backgrounds.dungeons.deadmines);
 assert.equal(instanceActions(state,d).advance.disabled,false);assert.equal(instanceActions(state,d).revive.disabled,true);
 const fight={...state,combat:{id:'encounter'}};
 assert.equal(instanceActions(fight,{...d,recovery:{...d.recovery,canRest:false}}).recover.disabled,true);
 assert.equal(instanceActions({...state,rest:{until:9999}},d).recover.label,'恢复中');
 assert.equal(instanceActions(state,{...d,dungeon:{...d.dungeon,autoAdvance:true}}).advance.disabled,true);
 assert.equal(instanceActions(state,{...d,recovery:{canRest:false,canRevive:true,fallen:[{id:'ally'}]}}).revive.disabled,false);
});
test('raid recovery and navigation use each existing command family',()=>{
 for(const [key,kind,prefix] of [['goldRaid','gold','gold']]){
  const state={...travel,activity:{type:'idle'}},d={...data,[key]:{active:true,phase:'camp',members:[{hp:0}],map:{id:'molten-core',route:[],canFullClear:true}}};
  assert.equal(scenePresentation(state,d).instance.kind,kind);
  assert.equal(instanceActions(state,d).recover.command.type,prefix+'Recover');
  assert.equal(instanceActions(state,d).revive.disabled,false);
  assert.equal(instanceActions(state,d).advance.command.type,prefix+'Navigate');
  assert.equal(instanceActions(state,{...d,[key]:{...d[key],recovering:true}}).recover.disabled,true);
 }
});
test('every supported region has a real local background and a world-map destination',()=>{
 const regions=atlas.continents.flatMap(c=>c.regions.map(r=>r.id));
 for(const region of Object.keys(mapRegions)){
  assert.ok(regions.includes(region),region);
  assert.ok(backgrounds.regions[region],region+' background');
  assert.ok(existsSync(new URL('../public'+backgrounds.regions[region],import.meta.url)),region);
 }
 for(const [id,image] of Object.entries(backgrounds.dungeons)){assert.ok(image,id);assert.ok(existsSync(new URL('../public'+image,import.meta.url)),id);}
});
test('every playable location, dungeon and raid resolves a credited, nonempty WebP',()=>{
 const map=Object.values(nodes),state={hp:100,clock:0,activity:{type:'idle'}};
 const verify=scene=>{
  assert.ok(scene.image,scene.name);
  const bytes=readFileSync(new URL('../public'+scene.image,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.ok(bytes.length>1000,scene.image);
  const source=Object.values(sources.assets).find(a=>a.image===scene.image);
  assert.ok(source?.source&&source?.filePage&&source?.sha256,scene.image+' attribution');
 };
 for(const location of map)verify(scenePresentation({...state,location:location.id},{map,location}));
 const ids=new Set([...Object.keys(dungeonDefinitions),...Object.keys(dungeonPresentation.dungeons)]);
 assert.deepEqual(Object.keys(backgrounds.dungeons).sort(),[...ids].sort());
 for(const id of ids){
  const location=map[0],dungeon={id,name:id,route:[]};
  verify(scenePresentation({...state,dungeon:{id}},{map,location,dungeon}));
 }
 for(const key of ['goldRaid'])verify(scenePresentation(state,{[key]:{active:true,map:{id:'molten-core',route:[]}}}));
});
test('each dungeon wing has its own scene instead of a shared entrance photograph',()=>{
 const images=Object.values(backgrounds.dungeons);
 assert.equal(new Set(images).size,images.length);
});
test('continent labels have separate hit areas and retain their geographic anchors',()=>{
 for(const continent of atlas.continents){
  const labels=atlasLabels(continent.regions);
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j];
   assert.ok(Math.abs(a.x-b.x)>=(a.labelWidth+b.labelWidth)/2||Math.abs(a.y-b.y)>=6.9,`${a.id} overlaps ${b.id}`);
  }
 }
});
