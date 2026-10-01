import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {creatureAction,creatureClip,creatureOneShot} from '../lib/creature-animation.js';
import {battleModel} from '../lib/battle-models.js';
import manifest from '../../../packages/game-data/visuals/classic-ranged-manifest.json' with {type:'json'};
const hunter={id:'hunter',hp:100,classId:3,raceId:4};
const launch={id:1,kind:'launch',actorId:'hunter',targetId:'wolf',spellId:75,visual:'hunter-shot',shownAt:1000};
test('hunter launch uses weapon pose; impact, miss and periodic damage never restart the shot',()=>{
 for(const [id,style,pose]of [[2504,'bow','shootBow'],[2508,'rifle','shootRifle'],[15807,'crossbow','shootRifle']]){
  const model=battleModel({...hunter,equipment:{18:{id}}});assert.equal(model.rangedStyle,style);
  const actor={...hunter,visual:{model}};
  assert.deepEqual(creatureAction(actor,[launch],2000,1100,false),{action:pose,key:1});
  assert.ok(creatureOneShot(pose));assert.equal(creatureClip(model.animations,pose),style==='bow'?'anim_46':'anim_49');
  for(const kind of ['damage','miss'])assert.equal(creatureAction(actor,[launch,{...launch,id:2,kind,shownAt:1200,projectileVisual:'hunter-shot'}],2200,1300,false).key,1);
  assert.equal(creatureAction(actor,[{...launch,kind:'damage',periodic:true}],2000,1100,false).action,'idle');
  assert.equal(creatureAction(actor,[{...launch,kind:'damage',spellId:6603,visual:undefined}],2000,1100,false).action,'attack');
  assert.equal(creatureAction({...actor,hp:0},[launch],2000,1100,false).action,'dead');
 }
});
test('all hunter race and gender bodies ship the native bow and rifle clips and matching attachment sockets',()=>{
 for(const raceId of [2,3,4,6,8])for(const gender of ['male','female']){
  const model=battleModel({...hunter,raceId,gender});
  for(const id of [29,46,48,49])assert.ok(model.animations.includes(id),`${raceId}/${gender}: ${id}`);
  const raw=readFileSync(new URL('../public'+model.animationSrc,import.meta.url)),doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
  for(const id of [46,49])assert.ok(doc.animations.some(a=>a.name===`anim_${id}`));
  for(const attachment of Object.values(manifest.models))assert.ok(doc.nodes.some(n=>n.name===`attachment_${attachment.point}`));
 }
});

test('additive shooting clips bind to the shared body, deform it and keep native shot durations',async()=>{
 const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
 const {Vector3}=await import('three');
 const {createHash}=await import('node:crypto');
 const {geometryOnlyGLB}=await import('./helpers/glb.mjs');
 const {createCreatureInstance}=await import('../lib/creature-instance.js');
 for(const [key,pack]of Object.entries(manifest.bodies)){
  const raw=readFileSync(new URL('../public'+pack.path,import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),pack.sha256);assert.equal(raw.length,pack.bytes);
  const parsed=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
  const body=await new GLTFLoader().parseAsync(geometryOnlyGLB(readFileSync(new URL(`../public/characters/classic/body-${key}.glb`,import.meta.url))),'');
  const instance=createCreatureInstance(body,{},[],[],parsed.animations),mesh=instance.object.getObjectByProperty('isSkinnedMesh',true);
  assert.equal(instance.object.getObjectByName('Body').children.length,body.scene.getObjectByName('Body').children.length,'animation pack does not add a second body');
  for(const id of [46,49]){
   instance.mixer.stopAllAction();const action=instance.action(`anim_${id}`);assert.ok(action);
   assert.equal(action.getClip().duration,parsed.animations.find(a=>a.name===`anim_${id}`).userData.nativeDurationMs/1000);
   action.play();const poses=[];
   for(const fraction of [.05,.45]){
    action.time=action.getClip().duration*fraction;instance.mixer.update(0);instance.object.updateMatrixWorld(true);mesh.skeleton.update();
    poses.push(mesh.skeleton.boneMatrices.slice());
    const v=new Vector3();for(let i=0;i<mesh.geometry.attributes.position.count;i+=29){mesh.getVertexPosition(i,v);assert.ok(v.toArray().every(Number.isFinite));}
   }
   assert.ok(poses[0].some((v,i)=>Math.abs(v-poses[1][i])>1e-5),`${key}: moving shot ${id}`);
  }
  instance.dispose();
 }
 assert.ok(Object.values(manifest.bodies).reduce((n,b)=>n+b.bytes,0)<2*1024*1024,'all ten animation packs stay below 2 MiB');
});

test('ranged weapon meshes retain source hashes and remain lightweight',async()=>{
 const {createHash}=await import('node:crypto');
 for(const [style,asset]of Object.entries(manifest.gear)){
  const raw=readFileSync(new URL('../public'+asset.path,import.meta.url));
  assert.equal(createHash('sha256').update(raw).digest('hex'),asset.sha256);assert.equal(raw.length,asset.bytes);
  assert.ok(asset.sources.every(s=>s.url.startsWith('https://wow.zamimg.com/modelviewer/classic/')));
  assert.equal(manifest.models[style].src,asset.path);assert.ok(raw.length<200000);
 }
});
