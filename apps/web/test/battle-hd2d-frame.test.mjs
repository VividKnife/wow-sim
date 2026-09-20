import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React,{useLayoutEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {create,act} from '@react-three/test-renderer';
import {sceneLayout} from '../lib/battle-scene.js';
import {unitPoint} from '../lib/battle-hd2d.js';

let components,directory;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.hd2d-frame-test-'));
 const outfile=join(directory,'frame.mjs');
 await build({absWorkingDir:web,stdin:{contents:"export * from './app/battle-hd2d/frame';export {BattleUnit} from './app/battle-hd2d/unit';",resolveDir:web,loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{
  name:'headless-label-probe',setup(builder){
   builder.onResolve({filter:/^@react-three\/drei$/},()=>({path:'drei-probe',namespace:'probe'}));
   // Match Drei Html's default-priority frame projection, without needing a DOM/GPU.
   builder.onLoad({filter:/.*/,namespace:'probe'},()=>({resolveDir:web,loader:'js',contents:`import React,{useMemo,useRef} from 'react';import {useFrame} from '@react-three/fiber';import {Texture} from 'three';
    export const useTexture=()=>useMemo(()=>new Texture(),[]);
    export function Html({position}){const ref=useRef();useFrame(()=>{ref.current.userData.projectedParentX=ref.current.parent.position.x;});return React.createElement('group',{ref,position,name:'label-probe'});}` }));
  }
 }]});components=await import(pathToFileURL(outfile).href);
});
after(async()=>{if(directory){await unlink(join(directory,'frame.mjs'));await rmdir(directory);}});
function scene(x=0){const unit={id:'a',name:'测试角色',hp:100,maxHp:100,classId:8,position:x,positionY:0};return{encounterId:'one',live:true,clock:0,sampledAt:0,layout:sceneLayout([unit],[],1,{minX:0,maxX:40,minY:-10,maxY:10}),units:[unit],effects:[],projectiles:[],groundEffects:[],selectedId:'a',range:5,lowEffects:true,reducedMotion:false};}
function tree(s,extra=null){return React.createElement(components.BattleFrames,{scene:s},React.createElement(components.CameraRig),extra);}

test('scrolling the canvas does not reset a settled camera zoom',async()=>{
 let store;function Probe(){const state=useThree();useLayoutEffect(()=>{store=state;});return null;}
 const renderer=await create(tree(scene(),React.createElement(Probe)),{orthographic:true,width:1200,height:600});
 try{
  await renderer.advanceFrames(1,1/60);const zoom=store.camera.zoom,position=store.camera.position.clone();
  await act(async()=>store.setSize(1200,600,200,0));
  await renderer.advanceFrames(1,1/60);
  assert.ok(Math.abs(store.camera.zoom-zoom)<1e-9,`scroll reset zoom from ${zoom} to ${store.camera.zoom}`);
  assert.ok(store.camera.position.distanceTo(position)<1e-9);
 }finally{await renderer.unmount();}
});

test('label projection reads the same interpolated position as the rendered unit',async(t)=>{
 let now=0;t.mock.method(performance,'now',()=>now);
 const a=scene(0),b=scene(10),unit=s=>React.createElement(components.BattleUnit,{unit:s.units[0],scene:s,skills:[],onSelect:()=>{}});
 const renderer=await create(tree(a,unit(a)),{orthographic:true,width:1200,height:600});
 try{
  await renderer.advanceFrames(1,1/60);now=100;await renderer.update(tree(b,unit(b)));now=210;
  await renderer.advanceFrames(1,1/60);
  const label=renderer.scene.findByProps({name:'label-probe'}).instance;
  const expected=(unitPoint(a.layout,'a')[0]+unitPoint(b.layout,'a')[0])/2;
  assert.ok(Math.abs(label.parent.position.x-expected)<1e-9);
  assert.ok(Math.abs(label.userData.projectedParentX-expected)<1e-9,`label saw ${label.userData.projectedParentX}, model saw ${expected}`);
 }finally{await renderer.unmount();}
});
