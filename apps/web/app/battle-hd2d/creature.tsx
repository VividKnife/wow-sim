import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {useGLTF,useTexture} from '@react-three/drei';
import {Group,LoopOnce,LoopRepeat,type AnimationAction} from 'three';
import {createCreatureInstance} from '@/lib/creature-instance.js';
import {battleTarget} from '@/lib/combat-view.js';
import {unitPoint} from '@/lib/battle-hd2d.js';
import {creatureAction,creatureClip,creatureOneShot} from '@/lib/creature-animation.js';
import type {BattleUnitData,CreatureModelData} from '@/lib/battle-hd2d-types';
import {useBattleFrame} from './frame';

export function Creature({unit,height,model}:{unit:BattleUnitData;height:number;model:CreatureModelData}){
 const asset=useGLTF(model.src),attachments=useGLTF((model.attachments||[]).map(a=>a.src)),frame=useBattleFrame(),root=useRef<Group>(null);
 const skins=useTexture(Object.values(model.textures||{}));
 // Each actor owns its skeleton and mixer. Geometry and textures stay cached.
 const instance=useMemo(()=>createCreatureInstance(asset,model,attachments,skins),
 // The appearance key identifies immutable, manifest-backed texture/geometry choices.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [asset,model.appearanceKey]);
 const state=useRef<{name:string;key:unknown;action:AnimationAction|null;clock:number;until:number;previous:[number,number];lastMove:number}>
  ({name:'',key:null,action:null,clock:NaN,until:0,previous:[NaN,NaN],lastMove:-Infinity});
 useEffect(()=>{
  state.current={name:'',key:null,action:null,clock:NaN,until:0,previous:[NaN,NaN],lastMove:-Infinity};
  return()=>instance.dispose();
 },[instance]);
 useFrame(()=>{
  const f=frame.current,s=state.current;
  const p=unitPoint(f.layout,unit.id),target=battleTarget(unit,f.scene.units,f.clock),q=target?unitPoint(f.layout,target.id):null;
  const moved=Math.hypot(p[0]-s.previous[0],p[2]-s.previous[1]);
  if(Number.isFinite(moved)&&moved>.001)s.lastMove=f.clock;
  s.previous=[p[0],p[2]];
  let desired=creatureAction(unit,f.scene.effects,f.clock,f.wall,f.clock-s.lastMove<150);
  // Let one-shot attacks finish when the short combat event expires.
  if(desired.action==='idle'&&f.clock<s.until&&['attack','cast'].includes(s.name))desired={action:s.name,key:s.key};
  const clip=desired.action==='attack'&&model.twoHanded&&model.animations.includes(19)?'anim_19':creatureClip(model.animations,desired.action),next=instance.action(clip);
  if(next&&(desired.action!==s.name||desired.key!==s.key)){
   const previous=s.action;
   next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
   next.setLoop(creatureOneShot(desired.action)?LoopOnce:LoopRepeat,Infinity);
   next.clampWhenFinished=creatureOneShot(desired.action);
   next.play();
   if(previous&&previous!==next)next.crossFadeFrom(previous,.12,false);
   s.name=desired.action;s.key=desired.key;s.action=next;
   s.until=f.clock+Math.min(1200,next.getClip().duration*1000);
   if(!f.scene.live&&['dead','surrender'].includes(s.name))next.time=next.getClip().duration;
  }
  const dt=Number.isFinite(s.clock)?Math.max(0,Math.min(.2,(f.clock-s.clock)/1000)):0;
  if(f.scene.reducedMotion){if(s.action)s.action.time=['dead','surrender','submerge'].includes(s.name)?s.action.getClip().duration:0;instance.mixer.update(0);}
  else instance.mixer.update(dt);
  s.clock=f.clock;
  if(root.current){
   if(q&&unit.hp>0&&s.name!=='submerge')root.current.rotation.y=Math.atan2(-(q[2]-p[2]),q[0]-p[0]);
   // Submerge holds below the floor after the native dive clip finishes.
   root.current.visible=!(s.name==='submerge'&&s.action&&s.action.time>=s.action.getClip().duration-.02);
  }
 });
 return <group ref={root} scale={height/model.height} rotation={[0,unit.foe?Math.PI:0,0]}>
  <primitive object={instance.object} position={[0,-model.minY,0]} dispose={null}/>
 </group>;
}
