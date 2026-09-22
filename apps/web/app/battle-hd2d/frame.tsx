/* eslint-disable react-hooks/immutability -- Three.js scene objects are external mutable state owned by the render loop. */
import {createContext,useContext,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {OrthographicCamera,Vector3} from 'three';
import {createSceneMotion} from '@/lib/battle-scene.js';
import {renderClock,CAMERA_TILT,cameraFit} from '@/lib/battle-hd2d.js';
import type {BattleScene,BattleLayout} from '@/lib/battle-hd2d-types';

export type Frame={scene:BattleScene;layout:BattleLayout;clock:number;wall:number;seconds:number};
const FrameContext=createContext<{current:Frame}|null>(null);
export function useBattleFrame(){const frame=useContext(FrameContext);if(!frame)throw new Error('Battle frame missing');return frame;}

export function BattleFrames({scene,children}:{scene:BattleScene;children:React.ReactNode}){
 const motion=useMemo(()=>createSceneMotion(160),[]);
 const latest=useRef(scene);
 const frame=useRef<Frame>({scene,layout:scene.layout,clock:scene.clock,wall:0,seconds:0});
 const encounter=useRef(scene.encounterId);
 useLayoutEffect(()=>{latest.current=scene;},[scene]);
 useLayoutEffect(()=>{motion.update(scene.layout,scene.encounterId,performance.now(),scene.reducedMotion||!scene.live);},[motion,scene.layout,scene.encounterId,scene.reducedMotion,scene.live]);
 useFrame(()=>{
  const next=latest.current,now=performance.now();
  const sampled=renderClock(next,now),clock=next.live&&encounter.current===next.encounterId?Math.min(next.endClock??Infinity,Math.max(frame.current.clock,sampled)):sampled;
  frame.current={scene:next,layout:motion.read(next.layout,now),clock,wall:Date.now(),seconds:next.reducedMotion?0:clock/1000};
  encounter.current=next.encounterId;
 },-10);
 return <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>;
}

export function CameraRig(){
 const {camera,size}=useThree();
 const frame=useBattleFrame(),target=useMemo(()=>new Vector3(),[]),encounter=useRef<string|undefined|null>(null);
 const desired=useMemo(()=>new Vector3(),[]);
 const cached=useRef<{layout:BattleLayout;units:BattleScene['units'];width:number;height:number;fit:ReturnType<typeof cameraFit>}|null>(null);
 // R3F size includes canvas top/left, which change while scrolling. Only this
 // frame loop owns the camera; a ResizeObserver update must never reset it.
 useFrame((_,delta)=>{
  const f=frame.current;
  // Fit the camera once per simulation sample/resize. Its interpolation below
  // still runs every display frame without allocating vectors or actor arrays.
  let entry=cached.current;
  if(!entry||entry.layout!==f.scene.layout||entry.units!==f.scene.units||entry.width!==size.width||entry.height!==size.height){
   entry={layout:f.scene.layout,units:f.scene.units,width:size.width,height:size.height,fit:cameraFit(f.scene.layout,f.scene.units,size)};cached.current=entry;
  }
  const fit=entry.fit;
  const blend=f.scene.reducedMotion||encounter.current!==f.scene.encounterId?1:1-Math.exp(-delta*3);
  target.lerp(desired.set(fit.x,.7,fit.z),blend);
  camera.position.set(target.x,target.y+40*CAMERA_TILT,target.z+40*Math.sqrt(1-CAMERA_TILT**2));camera.lookAt(target);
  const c=camera as OrthographicCamera;c.zoom+=(fit.zoom-c.zoom)*blend;c.updateProjectionMatrix();
  encounter.current=f.scene.encounterId;
 },-5);
 return null;
}
