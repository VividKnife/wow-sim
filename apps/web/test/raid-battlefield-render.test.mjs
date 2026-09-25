import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import {create} from '@react-three/test-renderer';
import {sceneLayout} from '../lib/battle-scene.js';
import {worldPoint} from '../lib/battle-hd2d.js';
import {spiralField,rectangleField} from '../../../packages/sim-core/src/encounter-geometry.js';
let components,directory;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.raid-field-test-'));
 const outfile=join(directory,'fields.mjs');
 await build({absWorkingDir:web,stdin:{contents:"export {BattleFrames} from './app/battle-hd2d/frame';export {GroundArea,visibleGroundEffects} from './app/battle-hd2d/effects';",resolveDir:web,loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{name:'headless-labels',setup(builder){builder.onResolve({filter:/^@react-three\/drei$/},()=>({path:'drei',namespace:'probe'}));builder.onLoad({filter:/.*/,namespace:'probe'},()=>({contents:'export const Html=()=>null;export const OrbitControls=()=>null;'}));}}]});
 components=await import(pathToFileURL(outfile).href);
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
function scene(fields=[],clock=0){return {encounterId:'raid',live:false,clock,layout:sceneLayout([],[],1,{minX:-20,maxX:58,minY:-28,maxY:28}),units:[],effects:[],projectiles:[],groundEffects:fields,selectedId:'',range:5,lowEffects:true,reducedMotion:true};}
test('low effects mode retains every raid danger area beyond the cosmetic budget',()=>{
 const fields=Array.from({length:20},(_,id)=>({id,center:{x:0,y:0},radius:5,until:5000,mechanic:true}));
 const decorative=Array.from({length:10},(_,id)=>({id:`cosmetic-${id}`,center:{x:0,y:0},radius:5,until:5000}));
 assert.equal(components.visibleGroundEffects(scene([...decorative,...fields])).filter(f=>f.mechanic).length,20);
 assert.equal(components.visibleGroundEffects(scene([...decorative,...fields])).length,25);
 assert.equal(components.visibleGroundEffects(scene(fields,5000)).length,0);
});
test('spiral mesh covers the authoritative polygon and warning becomes active without rotating it',async()=>{
 const f={id:'spiral',...spiralField({x:30,y:0}),terrain:true,mechanic:true,armedAt:1000,until:5000,school:2},s=scene([f]);
 const tree=current=>React.createElement(components.BattleFrames,{scene:current},React.createElement(components.GroundArea,{area:f,scene:current}));
 const renderer=await create(tree(s));
 try{
  await renderer.advanceFrames(1,.1);
  const mesh=renderer.scene.findByType('Mesh').instance;mesh.geometry.computeBoundingBox();
  const center=worldPoint(s.layout,f.center),xs=f.points.map(p=>worldPoint(s.layout,p)[0]-center[0]);
  assert.ok(Math.abs(mesh.geometry.boundingBox.min.x-Math.min(...xs))<1e-5);
  assert.ok(Math.abs(mesh.geometry.boundingBox.max.x-Math.max(...xs))<1e-5);
  assert.equal(mesh.material.opacity,.12);
  await renderer.update(tree({...s,clock:1000}));await renderer.advanceFrames(1,.1);assert.equal(mesh.material.opacity,.72);
  const group=renderer.scene.findByProps({name:'encounter-field-spiral'}).instance;assert.equal(group.rotation.y,0);
  await renderer.update(tree({...s,clock:5000}));await renderer.advanceFrames(1,.1);assert.equal(group.visible,false);
 }finally{await renderer.unmount();}
});
test('breath corridor render reaches both arena edges',async()=>{
 const f={id:'breath',...rectangleField(-20,58,-5,5),armedAt:5000,until:6000,school:2},s=scene([f]);
 const renderer=await create(React.createElement(components.BattleFrames,{scene:s},React.createElement(components.GroundArea,{area:f,scene:s})));
 try{const mesh=renderer.scene.findByType('Mesh').instance;mesh.geometry.computeBoundingBox();const width=mesh.geometry.boundingBox.max.x-mesh.geometry.boundingBox.min.x;assert.ok(Math.abs(width-(worldPoint(s.layout,{x:58,y:0})[0]-worldPoint(s.layout,{x:-20,y:0})[0]))<1e-5);}finally{await renderer.unmount();}
});
