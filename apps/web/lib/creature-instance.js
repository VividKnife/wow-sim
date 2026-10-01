import {AnimationMixer,Mesh,SRGBColorSpace} from 'three';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';

// SkeletonUtils clones a skeleton for every mesh primitive. A classic body has
// dozens of geosets, all using the same skin. Keep one palette per source skin
// per actor, so Three updates/uploads it once per frame, not once per geoset.
export function createCreatureInstance(asset,model,attachments=[],skins=[],extraAnimations=[]){
 const object=clone(asset.scene),skeletons=new Map(),materials=new Map();
 const skinKeys=Object.keys(model.textures||{});
 function share(source,target){
  if(source.isSkinnedMesh){
   const shared=skeletons.get(source.skeleton);
   if(shared){target.skeleton.dispose();target.skeleton=shared;}
   else skeletons.set(source.skeleton,target.skeleton);
  }
  source.children.forEach((child,index)=>share(child,target.children[index]));
 }
 share(asset.scene,object);
 object.traverse(child=>{
  if(!(child instanceof Mesh)||!model.geosets)return;
  const original=child.material;
  child.visible=model.geosets.includes(original.userData.classicGeoset);
  const slot=skinKeys.indexOf(String(original.userData.classicTextureType));
  if(slot<0||!child.visible)return;
  let material=materials.get(original);
  if(!material){
   material=original.clone();const texture=skins[slot];
   // The texture is shared by every actor using this appearance. Re-upload only
   // when its configuration actually changes (including first use).
   if(texture.flipY||texture.colorSpace!==SRGBColorSpace){texture.flipY=false;texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;}
   material.map=texture;materials.set(original,material);
  }
  child.material=material;
 });
 const weaponMeshes=[];
 model.attachments?.forEach((attachment,index)=>{
  const mesh=clone(attachments[index].scene);
  object.getObjectByName(`attachment_${attachment.point}`)?.add(mesh);
  if(attachment.mode){weaponMeshes.push({mesh,mode:attachment.mode});mesh.visible=attachment.mode==='melee';}
 });
 object.traverse(child=>{if(child instanceof Mesh){child.castShadow=true;child.receiveShadow=true;child.frustumCulled=false;}});
 const mixer=new AnimationMixer(object),clips=new Map([...asset.animations,...extraAnimations].map(clip=>{
  if(clip.userData?.nativeDurationMs>0){const owned=clip.clone();owned.duration=clip.userData.nativeDurationMs/1000;return [clip.name,owned];}
  return [clip.name,clip];
 })),actions=new Map();
 return {object,mixer,setRanged(value){for(const {mesh,mode}of weaponMeshes)mesh.visible=(mode==='ranged')===value;},action(name){
  const clip=clips.get(name);if(!clip)return undefined;
  let action=actions.get(name);if(!action){action=mixer.clipAction(clip);actions.set(name,action);}return action;
 },dispose(){
  // React Strict Mode reconnects effects on the same instance. Keep its bindings
  // valid; stopped actions and disposed GPU resources can be used again.
  mixer.stopAllAction();
  const owned=new Set();object.traverse(child=>{if(child.isSkinnedMesh)owned.add(child.skeleton);});
  for(const skeleton of owned)skeleton.dispose();
  for(const material of materials.values())material.dispose();
 }};
}
