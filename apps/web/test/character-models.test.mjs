import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AnimationMixer,SkinnedMesh,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {geometryOnlyGLB} from './helpers/glb.mjs';
import manifest from '../../../packages/game-data/data/classic-characters-manifest.json' with {type:'json'};
import {battleModel} from '../../../packages/game-data/battle-models.js';
const legal={1:[1,2,3,4,5,6,7,8],2:[1,3],3:[2,3,4,6,8],4:[1,2,3,4,5,7,8],5:[1,3,4,5,8],7:[2,6,8],8:[1,5,7,8],9:[1,2,5,7],11:[4,6]};
const local=url=>new URL('../public'+url,import.meta.url);
function document(asset){const raw=readFileSync(local(asset.path));assert.equal(createHash('sha256').update(raw).digest('hex'),asset.sha256);return JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));}
test('all 80 legal race/sex/class combinations switch to T1 at level 60 and share sixteen bodies',()=>{
 const bodies=new Set();let count=0;
 for(const [classId,races] of Object.entries(legal))for(const raceId of races)for(const gender of ['male','female']){
  const starter=battleModel({classId:+classId,raceId,gender,level:59}),t1=battleModel({classId:+classId,raceId,gender,level:60});
  assert.ok(starter&&t1);assert.match(starter.appearanceKey,/-starter$/);assert.match(t1.appearanceKey,/-t1$/);
  assert.equal(starter.src,t1.src);bodies.add(t1.src);count++;
  const preset=manifest.appearances[t1.appearanceKey];assert.equal(preset.items.length,8);assert.equal(new Set(preset.items).size,8);
  assert.deepEqual(t1.attachments.map(a=>a.point),[1,11,6,5]);
 }
 assert.equal(count,80);assert.equal(bodies.size,16);assert.equal(Object.keys(manifest.appearances).length,160);
 assert.equal(battleModel({classId:2,raceId:6,level:60}),null);
});
test('every appearance has local skins, visible body sections and native equipment attachment bones',()=>{
 const bodies=Object.fromEntries(Object.entries(manifest.bodies).map(([key,asset])=>[key,document(asset)]));
 const gearPaths=new Set(Object.values(manifest.gear).map(a=>a.path));
 for(const asset of Object.values(manifest.gear))document(asset);
 for(const [key,a] of Object.entries(manifest.appearances)){
  const body=bodies[a.body],sections=new Set(body.materials.map(m=>m.extras.classicGeoset));
  assert.ok(a.geosets.some(g=>sections.has(g)),key);assert.ok(a.geosets.includes(0),key);
  for(const attachment of a.attachments){assert.ok(body.nodes.some(n=>n.name===`attachment_${attachment.point}`),key);assert.ok(gearPaths.has(attachment.src));}
  for(const src of Object.values(a.textures)){const raw=readFileSync(local(src));assert.equal(raw.toString('ascii',8,12),'WEBP');assert.ok(raw.length>0);}
  for(const item of a.items)assert.ok(manifest.items[item].source.startsWith('https://www.wowhead.com/classic/item='));
 }
 const paths=new Set([...Object.values(manifest.bodies),...Object.values(manifest.gear)].map(a=>a.path));
 for(const a of Object.values(manifest.appearances))for(const src of Object.values(a.textures))paths.add(src);
 assert.ok([...paths].reduce((sum,path)=>sum+statSync(local(path)).size,0)<70*1024*1024,'shared starter + T1 assets stay below 70 MiB');
});
test('form and polymorph override T1 and recover the same appearance when removed',()=>{
 const unit={classId:11,raceId:6,gender:'female',level:60};
 assert.equal(battleModel({...unit,form:'bear'}).displayId,2289);
 assert.equal(battleModel({...unit,form:'cat'}).displayId,8571);
 assert.equal(battleModel({...unit,polyUntil:2000},1000).displayId,856);
 assert.equal(battleModel({...unit,polyUntil:2000},2000).appearanceKey,'6-1-11-t1');
});

for(const [key,asset] of Object.entries(manifest.bodies))test(`shared body ${key}: original clips deform independently with finite vertices`,async()=>{
 const model=await new GLTFLoader().parseAsync(geometryOnlyGLB(readFileSync(local(asset.path))),'');
 const actor=clone(model.scene),other=clone(model.scene),mixer=new AnimationMixer(actor),meshes=[];
 actor.traverse(node=>{if(node instanceof SkinnedMesh)meshes.push(node);});
 assert.ok(meshes.length);let moved=false;
 for(const clip of model.animations){
  mixer.stopAllAction();const action=mixer.clipAction(clip).play(),poses=[];
  for(const fraction of [0,.4,.8]){
   action.time=clip.duration*fraction;mixer.update(0);actor.updateMatrixWorld(true);
   for(const mesh of meshes){mesh.skeleton.update();const vertex=new Vector3();
    for(let i=0;i<mesh.geometry.attributes.position.count;i+=23){mesh.getVertexPosition(i,vertex);assert.ok(vertex.toArray().every(Number.isFinite));assert.ok(vertex.length()<asset.height*8);}
   }
   poses.push(meshes[0].skeleton.boneMatrices.slice());
  }
  if(!poses[0].every((value,i)=>Math.abs(value-poses[1][i])<1e-5))moved=true;
 }
 assert.ok(moved);let otherMesh;other.traverse(node=>{if(node instanceof SkinnedMesh)otherMesh=node;});
 assert.notEqual(meshes[0].skeleton.bones[0],otherMesh.skeleton.bones[0]);assert.equal(otherMesh.skeleton.bones[0].quaternion.w,1);
 mixer.stopAllAction();mixer.uncacheRoot(actor);
});
