import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {build} from 'esbuild';
import React,{Suspense,useLayoutEffect} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Vector3} from 'three';
import {create,act} from '@react-three/test-renderer';
import {sceneLayout} from '../lib/battle-scene.js';
import {unitPoint} from '../lib/battle-hd2d.js';
import {projectBattleLabel} from '../lib/battle-labels.js';

let components,directory;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
before(async()=>{
 const web=fileURLToPath(new URL('../',import.meta.url));directory=await mkdtemp(join(web,'.hd2d-frame-test-'));
 const outfile=join(directory,'frame.mjs');
 await build({absWorkingDir:web,stdin:{contents:"export * from './app/battle-hd2d/frame';export {BattleUnit} from './app/battle-hd2d/unit';export {useLocalCombat,publishLocalCombat} from './lib/local-combat-store';export {useCombatPlayback} from './lib/use-combat-playback';",resolveDir:web,loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',plugins:[{
  name:'headless-assets',setup(builder){
   builder.onResolve({filter:/^@react-three\/drei$/},()=>({path:'drei-probe',namespace:'probe'}));
   builder.onLoad({filter:/.*/,namespace:'probe'},()=>({resolveDir:web,loader:'js',contents:`import {useMemo} from 'react';import {Texture} from 'three';
    export const useTexture=()=>useMemo(()=>new Texture(),[]);
    export const useGLTF=()=>{throw globalThis.pendingBattleModel||new Error('This camera/label probe does not load models');};
    export const OrbitControls=()=>null;` }));
  }
 }]});components=await import(pathToFileURL(outfile).href);
});
after(async()=>{if(directory){await unlink(join(directory,'frame.mjs')).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}});
function scene(x=0){const unit={id:'a',name:'测试角色',hp:100,maxHp:100,classId:8,position:x,positionY:0};return{encounterId:'one',live:true,clock:0,sampledAt:0,layout:sceneLayout([unit],[],1,{minX:0,maxX:40,minY:-10,maxY:10}),units:[unit],effects:[],projectiles:[],groundEffects:[],selectedId:'a',range:5,lowEffects:true,reducedMotion:false};}
function tree(s,extra=null,manual=false){return React.createElement(components.BattleFrames,{scene:s},React.createElement(components.CameraRig,{manual,onManual:()=>{}}),extra);}

test('HUD-only updates preserve the local combat projection until the next simulation packet',async()=>{
 const state={id:'a',clock:0},data={battleView:{actors:[],units:{}}};let result;
 function Probe(){result=components.useLocalCombat(state,data,true);return null;}
 const packet=clock=>({player:{id:'a',clock},view:{battleView:{actors:[{id:'a',hp:100}],units:{a:{}}}}});
 components.publishLocalCombat(packet(100));const renderer=await create(React.createElement(Probe,{hud:0}));
 try{
  const first=result;assert.equal(first.state.clock,100);
  await renderer.update(React.createElement(Probe,{hud:1}));assert.equal(result,first,'a second HUD commit must not restart scene interpolation');
  await act(async()=>components.publishLocalCombat(packet(200)));assert.notEqual(result,first);assert.equal(result.state.clock,200);
 }finally{await renderer.unmount();components.publishLocalCombat(null);}
});

test('recorded playback also keeps the scene projection stable between display samples',async t=>{
 const globals=['window','document','requestAnimationFrame','cancelAnimationFrame'],saved=Object.fromEntries(globals.map(k=>[k,globalThis[k]]));
 let nextFrame,result,now=1000;
 globalThis.window={location:{origin:'http://fixture',search:''}};globalThis.document={hidden:false};
 globalThis.requestAnimationFrame=callback=>{nextFrame=callback;return 1;};globalThis.cancelAnimationFrame=()=>{};
 t.after(()=>{for(const key of globals){if(saved[key]===undefined)delete globalThis[key];else globalThis[key]=saved[key];}});
 t.mock.method(performance,'now',()=>now);
 const state={id:'a',clock:0},data={battleView:{actors:[],units:{}}},manifest={id:'stable-replay',endClock:1000};
 const recording={id:manifest.id,contentVersion:'fixture',startsAt:1000,endsAt:2000,startClock:0,endClock:1000,serverNow:1000,
  initial:{player:{id:'a',clock:0},view:{battleView:{actors:[{id:'a',hp:100}],units:{a:{}}}}},
  frames:[{clock:200,operations:[{op:'set',path:['player','clock'],value:200}]}]};
 t.mock.method(globalThis,'fetch',async()=>Response.json(recording));
 function Probe(){result=components.useCombatPlayback(state,data,manifest,'fixture',true);return null;}
 const renderer=await create(React.createElement(Probe,{hud:0}));
 try{
  await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
  const first=result;assert.equal(first.replaying,true);
  await renderer.update(React.createElement(Probe,{hud:1}));assert.equal(result,first);
  now=1300;await act(async()=>nextFrame(now));assert.notEqual(result,first);assert.equal(result.state.clock,200);
 }finally{await renderer.unmount();}
});

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

test('shared label projection reads the same interpolated position as the rendered unit',async(t)=>{
 let now=0;t.mock.method(performance,'now',()=>now);
 let projected,expectedScreen;
 function Probe(){const frame=components.useBattleFrame();useFrame(({camera,size})=>{camera.updateMatrixWorld();projected=projectBattleLabel(new Vector3(),frame.current.layout,'a',2,camera,size);const p=unitPoint(frame.current.layout,'a');expectedScreen=new Vector3(p[0],2,p[2]).project(camera);expectedScreen.x=(expectedScreen.x+1)*size.width/2;expectedScreen.y=(1-expectedScreen.y)*size.height/2;},-1);return null;}
 const onSelect=()=>{},skills=[];
 const a=scene(0),b=scene(10),unit=s=>React.createElement(React.Fragment,null,React.createElement(components.BattleUnit,{unit:s.units[0],scene:s,skills,onSelect}),React.createElement(Probe));
 const renderer=await create(tree(a,unit(a)),{camera:{fov:42},width:1200,height:600});
 try{
  await renderer.advanceFrames(1,1/60);now=100;await renderer.update(tree(b,unit(b)));now=210;
  await renderer.advanceFrames(1,1/60);
  const actor=renderer.scene.findByProps({name:'battle-unit:a'}).instance;
  const expected=(unitPoint(a.layout,'a')[0]+unitPoint(b.layout,'a')[0])/2;
  assert.ok(Math.abs(actor.position.x-expected)<1e-9);
  assert.ok(projected.distanceTo(expectedScreen)<1e-9,'DOM projection follows the interpolated model and camera');
 }finally{await renderer.unmount();}
});

test('a loading summoned model does not suspend the battlefield or existing actors',async()=>{
 globalThis.pendingBattleModel=new Promise(()=>{});
 const a=scene(),summon={...a.units[0],id:'summon',visual:{model:{src:'/pending.glb',animations:[0],height:2,minY:0,yards:2}}};
 const render=s=>tree(s,React.createElement(Suspense,{fallback:React.createElement('group',{name:'whole-field-loading'})},
  s.units.map(unit=>React.createElement(components.BattleUnit,{key:unit.id,unit,scene:s,skills:[],onSelect:()=>{}}))));
 const renderer=await create(render(a));
 try{
  const existing=renderer.scene.findByProps({name:'battle-unit:a'}).instance;
  await renderer.update(render({...a,units:[...a.units,summon]}));
  await renderer.advanceFrames(2,1/60);
  assert.equal(renderer.scene.findAllByProps({name:'whole-field-loading'}).length,0);
  assert.equal(renderer.scene.findAllByProps({name:'battle-unit:summon'}).length,1,'the summon stays present while its body loads');
  assert.equal(existing.visible,true,'existing actor stays visible');
 }finally{await renderer.unmount();delete globalThis.pendingBattleModel;}
});
