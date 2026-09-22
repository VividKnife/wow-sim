import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AnimationMixer,SkinnedMesh,Vector3,Box3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import manifest from '../../../packages/game-data/data/molten-core-models-manifest.json' with {type:'json'};
import {moltenCoreModel} from '../../../packages/game-data/molten-core-models.js';
import {moltenCoreBosses,moltenCoreTrash} from '../../../packages/game-domain/src/rules/molten-core-content.js';
import {creatureAction,creatureClip} from '../lib/creature-animation.js';
import {creatureVisual} from '../../../packages/game-data/creature-visuals.js';

test('all MC bosses, trash, guards and summoned creatures resolve to original local models',()=>{
 const entries=[...moltenCoreBosses,...Object.values(moltenCoreTrash)].map(c=>c.entry).concat([12119,12099,11672,11663,11664,12143]);
 assert.equal(new Set(entries).size,27);
 for(const entry of entries){
  const model=moltenCoreModel(entry);assert.ok(model,`missing ${entry}`);
  assert.equal(creatureVisual({entry}).model.src,model.src);
  for(const action of ['idle','attack','cast','hurt','dead'])assert.ok(model.animations.includes(Number(creatureClip(model.animations,action).slice(5))));
  assert.ok(model.yards>0&&model.height>0);
 }
 assert.notEqual(moltenCoreModel(11663).displayId,moltenCoreModel(11664).displayId);
 assert.equal(creatureClip(moltenCoreModel(11502).animations,'submerge'),'anim_201');
 assert.equal(creatureClip(moltenCoreModel(11502).animations,'emerge'),'anim_127');
 assert.equal(moltenCoreModel(999999),null);
});

function geometryOnlyGLB(raw){
 const jsonSize=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonSize));
 // CPU validation exercises original mesh, skin, inverse binds and clips. Image
 // decoding and appearance are separately verified in the browser gallery.
 delete doc.images;delete doc.textures;delete doc.samplers;delete doc.extensionsUsed;
 doc.materials=[{}];for(const mesh of doc.meshes)for(const primitive of mesh.primitives)primitive.material=0;
 const binary=raw.subarray(28+jsonSize),json=Buffer.from(JSON.stringify(doc));
 const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);
 header.writeUInt32LE(padded.length,12);header.write('JSON',16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.write('BIN\0',4);
 const result=Buffer.concat([header,padded,binHeader,binary]);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength);
}
for(const asset of Object.values(manifest.models))test(`Classic display ${asset.displayId}: hashes, deforming bones, independent clones, all clips finite`,async()=>{
 const raw=readFileSync(new URL('../public'+asset.path,import.meta.url));
 assert.equal(createHash('sha256').update(raw).digest('hex'),asset.sha256);
 const portrait=readFileSync(new URL('../public'+asset.portrait,import.meta.url));
 assert.equal(createHash('sha256').update(portrait).digest('hex'),asset.portraitSha256);
 const model=await new GLTFLoader().parseAsync(geometryOnlyGLB(raw),'');
 assert.equal(model.animations.length,asset.animations.length);
 const a=clone(model.scene),b=clone(model.scene),mixer=new AnimationMixer(a),meshes=[];
 a.traverse(child=>{if(child instanceof SkinnedMesh)meshes.push(child);});
 const other=[];b.traverse(child=>{if(child instanceof SkinnedMesh)other.push(child);});
 assert.ok(meshes.length);assert.notEqual(meshes[0].skeleton.bones[0],other[0].skeleton.bones[0]);
 let moved=false;
 const vertex=new Vector3();
 for(const clip of model.animations){
  mixer.stopAllAction();const action=mixer.clipAction(clip).play();
  const samples=[];
  for(const fraction of [0,.35,.75]){
   action.time=clip.duration*fraction;mixer.update(0);a.updateMatrixWorld(true);
   const bounds=new Box3();
   for(const mesh of meshes){
    mesh.skeleton.update();const n=mesh.geometry.attributes.position.count;
    for(let i=0;i<n;i+=Math.max(1,Math.floor(n/80))){mesh.getVertexPosition(i,vertex);assert.ok(vertex.toArray().every(Number.isFinite));bounds.expandByPoint(vertex);}
   }
   const size=bounds.getSize(new Vector3());assert.ok(size.length()<asset.height*8,`${clip.name} exploded`);
   samples.push(meshes[0].skeleton.boneMatrices.slice());
  }
  if(!samples[0].every((x,i)=>Math.abs(x-samples[1][i])<1e-5))moved=true;
 }
 assert.ok(moved,'skeletal tracks must actually deform the model');
 b.updateMatrixWorld(true);assert.equal(other[0].skeleton.bones[0].quaternion.w,1,'another actor must remain unanimated');
 mixer.stopAllAction();mixer.uncacheRoot(a);
});

test('animation state respects authoritative cues, death, control and received damage',()=>{
 const unit={id:'boss',hp:100},hit={id:1,actorId:'boss',kind:'incoming',shownAt:1000};
 assert.equal(creatureAction(unit,[hit],2000,1200,false).action,'attack');
 assert.equal(creatureAction({...unit,stunUntil:2500},[hit],2000,1200,false).action,'stun');
 assert.equal(creatureAction({...unit,hp:0},[hit],2000,1200,false).action,'dead');
 assert.equal(creatureAction(unit,[{id:2,targetId:'boss',kind:'incoming',amount:10,shownAt:1000}],2000,1100,false).action,'hurt');
 assert.equal(creatureAction({...unit,modelAnimation:{action:'submerge',startedAt:1500,until:45000}},[hit],2000,1200,false).action,'submerge');
 assert.equal(creatureAction({...unit,hp:0,modelAnimation:{action:'surrender',startedAt:1500,until:45000}},[],2000,1200,false).action,'surrender');
 assert.equal(creatureAction({...unit,rootUntil:2500},[],2000,1200,true).action,'idle');
 assert.equal(creatureAction(unit,[{...hit,shownAt:5000}],2000,1200,false).action,'idle');
});
