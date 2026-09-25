import {memo,Suspense,useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {useTexture} from '@react-three/drei';
import {DoubleSide,Group,Mesh,MeshStandardMaterial,NearestFilter,SRGBColorSpace} from 'three';
import {spriteAppearance,unitAnimation,unitPoint,actorHeight} from '@/lib/battle-hd2d.js';
import {battleTarget,schoolColor} from '@/lib/combat-view.js';
import type {BattleScene,BattleUnitData,BattleSkill} from '@/lib/battle-hd2d-types';
import {useBattleFrame} from './frame';
import {Creature} from './creature';

const classTint:Record<number,string>={2:'#fff1c4',9:'#c29bff',11:'#ddedb0'};

function Sprite({unit:initialUnit,height,clock,school}:{unit:BattleUnitData;height:number;clock:number;school?:number}){
 const appearance=spriteAppearance(initialUnit,clock),{columns,rows}=appearance;
 const original=useTexture(appearance.src as string),texture=useMemo(()=>{const t=original.clone();t.colorSpace=SRGBColorSpace;t.magFilter=t.minFilter=NearestFilter;t.generateMipmaps=false;t.repeat.set(1/columns,1/rows);t.needsUpdate=true;return t;},[original,columns,rows]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 const body=useRef<Group>(null),material=useRef<MeshStandardMaterial>(null),frame=useBattleFrame();
 const previous=useRef<[number,number]>([Infinity,Infinity]),lastMove=useRef(0);
 useFrame(({camera})=>{
  if(!body.current||!material.current)return;
  const f=frame.current,unit=f.scene.units.find(u=>u.id===initialUnit.id)||initialUnit,p=unitPoint(f.layout,unit.id),target=battleTarget(unit,f.scene.units,f.clock),q=target?unitPoint(f.layout,target.id):null;
  const moved=Math.hypot(p[0]-previous.current[0],p[2]-previous.current[1]);
  if(Number.isFinite(moved)&&moved>.001)lastMove.current=f.wall;
  previous.current=[p[0],p[2]];
  const action=unitAnimation(unit,f.scene.effects,f.clock,f.wall,f.wall-lastMove.current<120),reduced=f.scene.reducedMotion;
  const facing=unit.combatFacing!=null?(Math.cos(unit.combatFacing)<0?-1:1):q?(q[0]<p[0]?-1:1):(unit.foe?-1:1);
  const phase=f.seconds*10,walk=action==='walk',dead=action==='dead';
  body.current.quaternion.copy(camera.quaternion);
  body.current.rotateZ(dead?facing*1.35:reduced?0:action==='attack'?-facing*.16:action==='hurt'?Math.sin(phase*3)*.08:walk?Math.sin(phase)*.025:0);
  body.current.position.y=dead?height*.03:!reduced&&walk?Math.abs(Math.sin(phase))*height*.03:!reduced&&action==='cast'?Math.sin(phase*.4)*height*.015:0;
  body.current.position.x=!reduced&&action==='attack'?facing*height*.06:0;
  body.current.scale.set(facing,dead||reduced?1:1+Math.sin(f.seconds*2.5)*.012,1);
  if(columns>1){
   const col=reduced?0:walk?1+Math.floor(f.seconds*8)%2:action==='attack'?3:action==='cast'?4:action==='hurt'||dead?5:0;
   texture.offset.set(col/columns,1-(appearance.row+1)/rows);
  }
  material.current.color.set(action==='polymorph'?'#ffffff':action==='hurt'?'#ffb7a0':classTint[unit.classId??0]||'#ffffff');
  material.current.opacity=dead?.48:1;
  material.current.emissive.set(action==='cast'?schoolColor(unit.cast?.school??school??6):action==='hurt'?'#7b2b16':'#172028');
  material.current.emissiveIntensity=action==='cast'?.24:.1;
 });
 const canvasHeight=height*(columns>1?1.48:1);
 return <group ref={body}><mesh castShadow receiveShadow position={[0,canvasHeight*(appearance.anchor-.5),0]}>
  <planeGeometry args={[canvasHeight,canvasHeight]}/><meshStandardMaterial ref={material} map={texture} transparent alphaTest={.3} side={DoubleSide} roughness={1} metalness={0}/>
 </mesh></group>;
}

function Totem({height}:{height:number}){
 return <group scale={height/3}>
  <mesh castShadow position={[0,.8,0]}><boxGeometry args={[.6,1.6,.6]}/><meshStandardMaterial color="#886348"/></mesh>
  <mesh position={[0,1.8,0]} rotation={[0,0,Math.PI/4]}><boxGeometry args={[.75,.75,.3]}/><meshStandardMaterial color="#8adeba" emissive="#427c70" emissiveIntensity={.7}/></mesh>
  <mesh position={[0,1.25,0]}><boxGeometry args={[1.5,.15,.2]}/><meshStandardMaterial color="#c39b69"/></mesh>
 </group>;
}

type UnitProps={unit:BattleUnitData;scene:BattleScene;skills:BattleSkill[];onSelect:(id:string)=>void};
export const BattleUnit=memo(function BattleUnit({unit,scene,skills,onSelect}:UnitProps){
 const group=useRef<Group>(null),ring=useRef<Mesh>(null),frame=useBattleFrame();
 const selected=unit.id===scene.selectedId,dead=unit.hp<=0;
 const height=actorHeight(scene.layout,unit);
 const skill=skills.find(s=>s.spellId===unit.cast?.spell);
 useFrame(()=>{const f=frame.current;if(group.current){group.current.position.fromArray(unitPoint(f.layout,unit.id));group.current.visible=!unit.removed;}if(ring.current)ring.current.rotation.z=f.scene.reducedMotion?0:f.seconds*.12;},-2);
 if(unit.removed)return null;
 return <group name={`battle-unit:${unit.id}`} ref={group} onClick={event=>{event.stopPropagation();onSelect(unit.id);}}>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.02,0]} scale={[height*.28,height*.17,1]}><circleGeometry args={[1,32]}/><meshBasicMaterial color="#071017" transparent opacity={.32} depthWrite={false}/></mesh>
  {!dead&&<mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[height*.26,height*(selected?.3:.275),48]}/><meshBasicMaterial color={selected?'#ffe0a4':unit.foe?'#df896b':'#85d2b0'} transparent opacity={selected?.95:.45} depthWrite={false} toneMapped={false}/></mesh>}
  {!dead&&unit.marker&&<mesh rotation={[-Math.PI/2,0,0]} position={[0,.055,0]}><ringGeometry args={[height*.34,height*.38,48]}/><meshBasicMaterial color={unit.marker==='focus'?'#f48c6a':'#c9a1ff'} transparent opacity={.9} depthWrite={false} toneMapped={false}/></mesh>}
  <Suspense fallback={null}>{unit.visual?.model?<Creature key={`${unit.visual.model.src}:${unit.visual.model.appearanceKey||''}`} unit={unit} height={height} model={unit.visual.model}/>:unit.totemUnit?<Totem height={height}/>:<Sprite unit={unit} height={height} clock={scene.clock} school={skill?.school}/>}</Suspense>
 </group>;
},(a,b)=>{
 // Health/cast/position packets are read by the frame loop and DOM overlay.
 // Reconcile model geometry only when its appearance or selection changes.
 const x=a.unit,y=b.unit;
 if(x.id!==y.id||x.removed!==y.removed||(x.hp<=0)!==(y.hp<=0)||x.foe!==y.foe||x.marker!==y.marker||a.onSelect!==b.onSelect)return false;
 if((x.id===a.scene.selectedId)!==(y.id===b.scene.selectedId)||actorHeight(a.scene.layout,x)!==actorHeight(b.scene.layout,y))return false;
 if(x.visual?.model||y.visual?.model)return x.visual?.model?.src===y.visual?.model?.src&&x.visual?.model?.appearanceKey===y.visual?.model?.appearanceKey;
 return x.totemUnit===y.totemUnit&&a.skills===b.skills&&x.cast?.spell===y.cast?.spell&&JSON.stringify(spriteAppearance(x,a.scene.clock))===JSON.stringify(spriteAppearance(y,b.scene.clock));
});
