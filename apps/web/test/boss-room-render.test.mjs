import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {create} from '@react-three/test-renderer';
import {AlwaysStencilFunc,EqualStencilFunc,ReplaceStencilOp,Texture} from 'three';
import rooms from '../../../packages/game-data/data/boss-rooms.json' with {type:'json'};
import {sceneLayout} from '../lib/battle-scene.js';
import {worldPoint,worldRadius} from '../lib/battle-hd2d.js';
let components,directory;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.boss-room-test-'));
 const outfile=join(directory,'room.mjs');
 await build({absWorkingDir:web,stdin:{contents:"export {BossRoom} from './app/battle-hd2d/room';export {BattleFrames} from './app/battle-hd2d/frame';export {GroundArea} from './app/battle-hd2d/effects';",resolveDir:web,loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{name:'headless-labels',setup(builder){builder.onResolve({filter:/^@react-three\/drei$/},()=>({path:'drei',namespace:'probe'}));builder.onLoad({filter:/.*/,namespace:'probe'},()=>({contents:'export const Html=()=>null;export const OrbitControls=()=>null;export {useMask} from "@react-three/drei/core/Mask.js";',resolveDir:web}));}}]});
 components=await import(pathToFileURL(outfile).href);
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
for(const [bossId,area]of Object.entries(rooms))test(`${bossId}: floor triangles, boundary walls and colors match the authoritative room`,async()=>{
 const layout=sceneLayout([],[],1,area),texture=new Texture();
 const renderer=await create(React.createElement(components.BossRoom,{layout,texture}));
 try{
  const floor=renderer.scene.findByProps({name:'boss-room-floor'}).instance;
  assert.deepEqual(Array.from(floor.geometry.index.array),area.navigation.triangles.flatMap(([a,b,c])=>[a,c,b]));
  for(const [i,p]of area.boundary.entries()){
   const expected=worldPoint(layout,p),actual=Array.from(floor.geometry.attributes.position.array.slice(i*3,i*3+3));
   assert.ok(Math.abs(expected[0]-actual[0])<1e-5&&Math.abs(expected[2]-actual[2])<1e-5);
   const wall=renderer.scene.findByProps({name:`boss-room-wall:${i}`}).instance;
   const q=worldPoint(layout,area.boundary[(i+1)%area.boundary.length]);
   assert.ok(Math.abs(wall.children[0].geometry.parameters.width-Math.hypot(expected[0]-q[0],expected[2]-q[2]))<1e-5);
   assert.equal(wall.children[0].material.color.getHexString(),area.appearance.wall.slice(1));
  }
  assert.equal(floor.material.color.getHexString(),area.appearance.floor.slice(1));
  assert.equal(floor.material.stencilFunc,AlwaysStencilFunc);assert.equal(floor.material.stencilZPass,ReplaceStencilOp);assert.equal(floor.material.stencilRef,1);
  assert.equal(renderer.scene.findAll(node=>node.instance.name==='whelpNorth').length,bossId==='onyxia'?1:0);
 }finally{await renderer.unmount();texture.dispose();}
});
test('room floor survives snapshot object replacement and releases geometry on room change and unmount',async()=>{
 const area=Object.values(rooms)[0],texture=new Texture(),layout=sceneLayout([],[],1,area);
 const tree=value=>React.createElement(components.BossRoom,{layout:value,texture});
 const renderer=await create(tree(layout)),original=renderer.scene.findByProps({name:'boss-room-floor'}).instance.geometry;let disposed=0;
 original.addEventListener('dispose',()=>disposed++);
 await renderer.update(tree(sceneLayout([],[],1,structuredClone(area))));
 assert.equal(renderer.scene.findByProps({name:'boss-room-floor'}).instance.geometry,original);assert.equal(disposed,0);
 await renderer.update(tree(sceneLayout([],[],1,{...area,geometryHash:'replacement'})));
 assert.equal(disposed,1);
 const replacement=renderer.scene.findByProps({name:'boss-room-floor'}).instance.geometry;replacement.addEventListener('dispose',()=>disposed++);
 await renderer.unmount();assert.equal(disposed,2);texture.dispose();
});
test('camera-facing wall cutaway follows translated room bounds',async()=>{
 const original=Object.values(rooms)[0],offset=100;
 const area={...original,minY:original.minY+offset,maxY:original.maxY+offset,boundary:original.boundary.map(p=>({...p,y:p.y+offset})),geometryHash:'translated'};
 const layout=sceneLayout([],[],1,area),texture=new Texture(),renderer=await create(React.createElement(components.BossRoom,{layout,texture}));
 try{
  const heights=area.boundary.map((_,i)=>renderer.scene.findByProps({name:`boss-room-wall:${i}`}).instance.children[0].geometry.parameters.height);
  assert.ok(heights.includes(worldRadius(layout,1)));assert.ok(heights.includes(worldRadius(layout,6)));
 }finally{await renderer.unmount();texture.dispose();}
});
for(const lowEffects of [false,true])test(`raid danger fill and outline use the floor stencil with lowEffects=${lowEffects}`,async()=>{
 const area=Object.values(rooms)[0],field={id:'room-edge',center:area.boundary[0],radius:12,school:2,mechanic:true,until:10000};
 const scene={layout:sceneLayout([],[],1,area),clock:0,units:[],effects:[],projectiles:[],groundEffects:[field],selectedId:'',range:0,lowEffects,reducedMotion:true};
 const renderer=await create(React.createElement(components.BattleFrames,{scene},React.createElement(components.GroundArea,{area:field,scene})));
 try{
  const group=renderer.scene.findByProps({name:'encounter-field-room-edge'}).instance;
  const surfaces=group.children.filter(child=>child.isMesh&&child.geometry.type==='ShapeGeometry'||child.isLine);
  assert.equal(surfaces.length,2);
  for(const object of surfaces){
   assert.equal(object.material.stencilWrite,true);assert.equal(object.material.stencilRef,1);assert.equal(object.material.stencilFunc,EqualStencilFunc);
  }
 }finally{await renderer.unmount();}
});
