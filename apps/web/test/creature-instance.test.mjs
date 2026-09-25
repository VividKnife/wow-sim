import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AnimationMixer,Bone,Group,MeshStandardMaterial,SkinnedMesh,Skeleton,BufferGeometry,Texture,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {geometryOnlyGLB} from './helpers/glb.mjs';
import {createCreatureInstance} from '../lib/creature-instance.js';

test('classic body shares one palette across geosets while preserving independent actors and animated vertices',async()=>{
 const asset=await new GLTFLoader().parseAsync(geometryOnlyGLB(readFileSync(new URL('../public/characters/classic/body-1-0.glb',import.meta.url))),'');
 const first=createCreatureInstance(asset,{}),second=createCreatureInstance(asset,{}),baseline=clone(asset.scene),mixer=new AnimationMixer(baseline);
 const meshes=root=>{const result=[];root.traverse(node=>{if(node.isSkinnedMesh)result.push(node);});return result;};
 const a=meshes(first.object),b=meshes(second.object),original=meshes(baseline);
 assert.ok(a.length>40,'exercise a body with dozens of geosets');
 assert.equal(new Set(a.map(m=>m.skeleton)).size,1);
 assert.notEqual(a[0].skeleton,b[0].skeleton);assert.notEqual(a[0].skeleton.bones[0],b[0].skeleton.bones[0]);
 assert.equal(first.mixer.stats.actions.total,0,'do not bind unused clips at spawn');
 for(const clip of asset.animations.filter(c=>['anim_0','anim_4','anim_17','anim_53','anim_1'].includes(c.name))){
  first.mixer.stopAllAction();mixer.stopAllAction();
  const action=first.action(clip.name).play(),reference=mixer.clipAction(clip).play();
  assert.equal(first.action(clip.name),action,'reuse the actor action on repeated attacks');
  for(const fraction of [0,.4,.8]){
   action.time=reference.time=clip.duration*fraction;first.mixer.update(0);mixer.update(0);
   first.object.updateMatrixWorld(true);baseline.updateMatrixWorld(true);
   a[0].skeleton.update();original.forEach(m=>m.skeleton.update());
   for(let i=0;i<a.length;i++)for(let vertex=0;vertex<a[i].geometry.attributes.position.count;vertex+=29){
    const actual=a[i].getVertexPosition(vertex,new Vector3()),expected=original[i].getVertexPosition(vertex,new Vector3());
    assert.ok(actual.distanceTo(expected)<1e-7,`${clip.name}: geoset ${i} vertex ${vertex}`);
   }
  }
 }
 assert.ok(first.mixer.stats.actions.total<asset.animations.length);
 assert.equal(second.mixer.stats.actions.total,0);
 first.dispose();second.dispose();mixer.stopAllAction();mixer.uncacheRoot(baseline);
 // Strict Mode reconnect must keep the cached actions usable.
 first.action('anim_0').play();first.mixer.update(.1);assert.equal(first.mixer.stats.actions.inUse,1);first.dispose();
});

test('shared appearance uploads its skin once and disposes each owned skeleton once',()=>{
 const scene=new Group(),bone=new Bone();scene.add(bone);
 const material=new MeshStandardMaterial();material.userData={classicGeoset:0,classicTextureType:1};
 const skeleton=new Skeleton([bone]);
 for(let i=0;i<3;i++){const mesh=new SkinnedMesh(new BufferGeometry(),material);mesh.bind(skeleton);scene.add(mesh);}
 const texture=new Texture(),asset={scene,animations:[]},model={textures:{1:'skin.webp'},geosets:[0]};
 const first=createCreatureInstance(asset,model,[],[texture]),version=texture.version;
 const second=createCreatureInstance(asset,model,[],[texture]);
 assert.equal(texture.version,version,'another actor must not upload the same texture again');
 const owned=first.object.children.filter(c=>c.isSkinnedMesh);assert.equal(owned[0].material,owned[1].material);
 assert.notEqual(owned[0].material,material);assert.equal(material.map,null,'cached source material remains unchanged');
 let disposals=0;owned[0].skeleton.dispose=()=>{disposals++;};first.dispose();assert.equal(disposals,1);second.dispose();
});

test('different source skins are never merged even when they use the same bones',()=>{
 const scene=new Group(),bone=new Bone();scene.add(bone);
 for(let i=0;i<2;i++){const mesh=new SkinnedMesh(new BufferGeometry(),new MeshStandardMaterial());mesh.bind(new Skeleton([bone]));scene.add(mesh);}
 const instance=createCreatureInstance({scene,animations:[]},{}),meshes=instance.object.children.filter(c=>c.isSkinnedMesh);
 assert.notEqual(meshes[0].skeleton,meshes[1].skeleton);instance.dispose();
});
