import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React,{Suspense,useLayoutEffect} from 'react';
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
    export const useGLTF=()=>{throw globalThis.pendingBattleModel||new Error('This camera/label probe does not load models');};
    export const OrbitControls=()=>null;
    export function Html({position}){const ref=useRef();useFrame(()=>{ref.current.userData.projectedParentX=ref.current.parent.position.x;});return React.createElement('group',{ref,position,name:'label-probe'});}` }));
  }
 }]});components=await import(pathToFileURL(outfile).href);
});
after(async()=>{if(directory){await unlink(join(directory,'frame.mjs')).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}});
function scene(x=0){const unit={id:'a',name:'测试角色',hp:100,maxHp:100,classId:8,position:x,positionY:0};return{encounterId:'one',live:true,clock:0,sampledAt:0,layout:sceneLayout([unit],[],1,{minX:0,maxX:40,minY:-10,maxY:10}),units:[unit],effects:[],projectiles:[],groundEffects:[],selectedId:'a',range:5,lowEffects:true,reducedMotion:false};}
function tree(s,extra=null,manual=false){return React.createElement(components.BattleFrames,{scene:s},React.createElement(components.CameraRig,{manual,onManual:()=>{}}),extra);}

test('scrolling the canvas does not reset the perspective camera; manual control pauses automatic framing',async()=>{
 let store;function Probe(){const state=useThree();useLayoutEffect(()=>{store=state;});return null;}
 const renderer=await create(tree(scene(),React.createElement(Probe)),{camera:{fov:42},width:1200,height:600});
 try{
  await renderer.advanceFrames(1,1/60);const zoom=store.camera.zoom,position=store.camera.position.clone();
  await act(async()=>store.setSize(1200,600,200,0));
  await renderer.advanceFrames(1,1/60);
  assert.ok(Math.abs(store.camera.zoom-zoom)<1e-9,`scroll reset zoom from ${zoom} to ${store.camera.zoom}`);
  assert.ok(store.camera.position.distanceTo(position)<1e-9);
  assert.ok(Number.isFinite(position.length()));assert.ok(position.length()>0);
  await renderer.update(tree(scene(20),React.createElement(Probe),true));
  await renderer.advanceFrames(10,1/60);assert.ok(store.camera.position.distanceTo(position)<1e-9);
  await renderer.update(tree(scene(20),React.createElement(Probe),false));
  await renderer.advanceFrames(10,1/60);assert.ok(store.camera.position.distanceTo(position)>.01);
 }finally{await renderer.unmount();}
});

test('label projection reads the same interpolated position as the rendered unit',async(t)=>{
 let now=0;t.mock.method(performance,'now',()=>now);
 const a=scene(0),b=scene(10),unit=s=>React.createElement(components.BattleUnit,{unit:s.units[0],scene:s,skills:[],onSelect:()=>{}});
 const renderer=await create(tree(a,unit(a)),{camera:{fov:42},width:1200,height:600});
 try{
  await renderer.advanceFrames(1,1/60);now=100;await renderer.update(tree(b,unit(b)));now=210;
  await renderer.advanceFrames(1,1/60);
  const label=renderer.scene.findByProps({name:'label-probe'}).instance;
  const expected=(unitPoint(a.layout,'a')[0]+unitPoint(b.layout,'a')[0])/2;
  assert.ok(Math.abs(label.parent.position.x-expected)<1e-9);
  assert.ok(Math.abs(label.userData.projectedParentX-expected)<1e-9,`label saw ${label.userData.projectedParentX}, model saw ${expected}`);
 }finally{await renderer.unmount();}
});

test('a loading summoned model does not suspend the battlefield or existing actors',async()=>{
 globalThis.pendingBattleModel=new Promise(()=>{});
 const a=scene(),summon={...a.units[0],id:'summon',visual:{model:{src:'/pending.glb',animations:[0],height:2,minY:0,yards:2}}};
 const render=s=>tree(s,React.createElement(Suspense,{fallback:React.createElement('group',{name:'whole-field-loading'})},
  s.units.map(unit=>React.createElement(components.BattleUnit,{key:unit.id,unit,scene:s,skills:[],onSelect:()=>{}}))));
 const renderer=await create(render(a));
 try{
  const existing=renderer.scene.findByProps({name:'label-probe'}).instance;
  await renderer.update(render({...a,units:[...a.units,summon]}));
  await renderer.advanceFrames(2,1/60);
  assert.equal(renderer.scene.findAllByProps({name:'whole-field-loading'}).length,0);
  assert.equal(renderer.scene.findAllByProps({name:'label-probe'}).length,2,'the summon label remains usable while its body loads');
  assert.equal(existing.parent.visible,true,'existing actor stays visible');
 }finally{await renderer.unmount();delete globalThis.pendingBattleModel;}
});
