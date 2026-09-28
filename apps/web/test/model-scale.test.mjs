import test from 'node:test';
import assert from 'node:assert/strict';
import scales from '../../../packages/game-data/data/model-scales.json' with {type:'json'};
import creatures from '../../../packages/game-data/data/classic-battle-models-manifest.json' with {type:'json'};
import raid from '../../../packages/game-data/data/molten-core-models-manifest.json' with {type:'json'};
import characters from '../../../packages/game-data/data/classic-characters-manifest.json' with {type:'json'};
import {modelYards} from '../../../packages/game-data/model-scale.js';
import {battleModel} from '../../../packages/game-data/battle-models.js';
import {actorHeight,worldRadius} from '../lib/battle-hd2d.js';
import {sceneLayout} from '../lib/battle-scene.js';

test('every shipped creature and player body has a positive sourced scale',()=>{
 for(const id of Object.keys({...creatures.models,...raid.models}))assert.ok(scales.displays[id]>0,`display ${id}`);
 for(const key of Object.keys(characters.bodies))assert.ok(scales.characters[key]>0,`body ${key}`);
});
test('template scale overrides display scale instead of multiplying it',()=>{
 const [entry,scale]=Object.entries(scales.entries)[0];
 const asset={height:2,displayId:13031};
 assert.equal(modelYards(asset,entry),2*scale);
 assert.equal(modelYards(asset),2*scales.displays[13031]);
});
test('bosses use original model size and display scale without rank-based normalization',()=>{
 for(const entry of [12118,11982,12057,12098,11502,10184,639]){
  const boss=battleModel({entry,rank:3});assert.ok(boss);
  assert.equal(boss.yards,boss.height*(scales.entries[entry]??scales.displays[boss.displayId]));
  assert.equal(boss.yards,battleModel({entry,rank:0}).yards);
 }
 const rag=battleModel({entry:11502}),human=battleModel({classId:1,raceId:1,gender:'male'});
 assert.ok(rag.yards/human.yards>5,'Ragnaros must retain his enormous native silhouette');
});
test('player race and sex retain their original body proportions',()=>{
 assert.equal(scales.characters['6-0'],1.35);
 assert.equal(scales.characters['7-0'],1.15);
 for(const raceId of [1,2,3,4,5,6,7,8])for(const gender of ['male','female']){
  const key=`${raceId}-${gender==='female'?1:0}`,model=battleModel({classId:1,raceId,gender});
  assert.equal(model.yards,characters.bodies[key].height*scales.characters[key]);
 }
 assert.notEqual(battleModel({classId:1,raceId:1,gender:'male'}).yards,battleModel({classId:1,raceId:1,gender:'female'}).yards);
});
test('boss/player proportions survive room size and manual camera zoom',()=>{
 const units=[{id:'player',position:0,positionY:0,visual:{model:battleModel({classId:1,raceId:1})}},
  {id:'boss',position:20,positionY:0,visual:{model:battleModel({entry:11502})}}];
 for(const zoom of [.5,1,3])for(const span of [40,90,180]){
  const layout=sceneLayout([units[0]],[units[1]],zoom,{minX:0,maxX:span,minY:-30,maxY:30});
  const heights=units.map(unit=>actorHeight(layout,unit));
  assert.ok(Math.abs(heights[1]/heights[0]-units[1].visual.model.yards/units[0].visual.model.yards)<1e-9);
  assert.ok(Math.abs(heights[0]/worldRadius(layout,1)-units[0].visual.model.yards)<1e-9);
 }
});
