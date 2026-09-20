import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html,useTexture} from '@react-three/drei';
import {DoubleSide,Group,Mesh,MeshStandardMaterial,NearestFilter,SRGBColorSpace} from 'three';
import {spriteAppearance,unitAnimation,unitPoint,actorHeight,CAMERA_TILT} from '@/lib/battle-hd2d.js';
import {actionProgress,battleTarget,schoolColor,unitCondition} from '@/lib/combat-view.js';
import type {BattleScene,BattleUnitData,BattleSkill} from '@/lib/battle-hd2d-types';
import {useBattleFrame} from './frame';

const classTint:Record<number,string>={2:'#fff1c4',9:'#c29bff',11:'#ddedb0'};

function Sprite({unit,height,clock,school}:{unit:BattleUnitData;height:number;clock:number;school?:number}){
 const appearance=spriteAppearance(unit,clock),{columns,rows}=appearance;
 const original=useTexture(appearance.src as string),texture=useMemo(()=>{const t=original.clone();t.colorSpace=SRGBColorSpace;t.magFilter=t.minFilter=NearestFilter;t.generateMipmaps=false;t.repeat.set(1/columns,1/rows);t.needsUpdate=true;return t;},[original,columns,rows]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 const body=useRef<Group>(null),material=useRef<MeshStandardMaterial>(null),frame=useBattleFrame();
 const previous=useRef<[number,number]>([Infinity,Infinity]),lastMove=useRef(0);
 useFrame(({camera})=>{
  if(!body.current||!material.current)return;
  const f=frame.current,p=unitPoint(f.layout,unit.id),target=battleTarget(unit,f.scene.units,f.clock),q=target?unitPoint(f.layout,target.id):null;
  const moved=Math.hypot(p[0]-previous.current[0],p[2]-previous.current[1]);
  if(Number.isFinite(moved)&&moved>.001)lastMove.current=f.wall;
  previous.current=[p[0],p[2]];
  const action=unitAnimation(unit,f.scene.effects,f.clock,f.wall,f.wall-lastMove.current<120),reduced=f.scene.reducedMotion;
  const facing=q?(q[0]<p[0]?-1:1):(unit.foe?-1:1);
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

export function BattleUnit({unit,scene,skills,onSelect}:{unit:BattleUnitData;scene:BattleScene;skills:BattleSkill[];onSelect:(id:string)=>void}){
 const group=useRef<Group>(null),ring=useRef<Mesh>(null),skillLabel=useRef<HTMLElement>(null),frame=useBattleFrame();
 const selected=unit.id===scene.selectedId,dead=unit.hp<=0;
 const height=actorHeight(scene.layout,unit);
 const skill=skills.find(s=>s.spellId===unit.cast?.spell),condition=unitCondition(unit,scene.clock);
 const event=scene.effects.findLast(e=>e.actorId===unit.id&&e.spellId&&['cast','launch'].includes(e.kind));
 const casting=!!unit.cast&&scene.clock>=unit.cast.startedAt&&scene.clock<unit.cast.until;
 const cue=casting?skill:skills.find(s=>s.spellId===event?.spellId);
 // Run before Drei Html (priority 0), so labels and the mesh see the same frame.
 useFrame(()=>{const f=frame.current;if(group.current){group.current.position.fromArray(unitPoint(f.layout,unit.id));group.current.visible=!unit.removed;}if(ring.current)ring.current.rotation.z=f.scene.reducedMotion?0:f.seconds*.12;
  if(skillLabel.current)skillLabel.current.hidden=casting?!(unit.cast&&f.clock>=unit.cast.startedAt&&f.clock<unit.cast.until):!(event&&f.wall>=event.shownAt&&f.wall-event.shownAt<1000);
 },-2);
 if(unit.removed)return null;
 return <group ref={group} onClick={event=>{event.stopPropagation();onSelect(unit.id);}}>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.02,0]} scale={[height*.28,height*.17,1]}><circleGeometry args={[1,32]}/><meshBasicMaterial color="#071017" transparent opacity={.32} depthWrite={false}/></mesh>
  {!dead&&<mesh ref={ring} rotation={[-Math.PI/2,0,0]} position={[0,.04,0]}><ringGeometry args={[height*.26,height*(selected?.3:.275),48]}/><meshBasicMaterial color={selected?'#ffe0a4':unit.foe?'#df896b':'#85d2b0'} transparent opacity={selected?.95:.45} depthWrite={false} toneMapped={false}/></mesh>}
  {unit.totemUnit?<Totem height={height}/>:<Sprite unit={unit} height={height} clock={scene.clock} school={skill?.school}/>}
  <Html position={[0,height*1.15/Math.sqrt(1-CAMERA_TILT**2),0]} center zIndexRange={[30,0]} style={{pointerEvents:'auto'}}>
   <button type="button" onClick={()=>onSelect(unit.id)} aria-label={`${unit.name}，生命 ${Math.max(0,Math.ceil(unit.hp))}，${condition||'可行动'}`} aria-pressed={selected} className={`hd2d-unit-label ${unit.foe?'enemy':'ally'} ${selected?'selected':''} ${dead?'dead':''}`} data-unit-id={unit.id}>
    <span className="hd2d-unit-name">{unit.name}</span>
    {!dead&&<><span className="hd2d-health"><i style={{width:`${Math.max(0,Math.min(100,unit.hp/Math.max(1,unit.maxHp)*100))}%`}}/></span><span className="hd2d-action"><i style={{width:`${(unit.cast?actionProgress(unit.cast.startedAt,unit.cast.until,scene.clock):unit.swing||0)*100}%`,background:unit.cast?'#a9ceec':'#c7ad71'}}/></span></>}
    {condition&&<small className="hd2d-condition">{condition}</small>}
    {cue&&!dead&&<small ref={skillLabel} className="hd2d-skill" title={cue.name} style={{color:schoolColor(cue.school)}}>{cue.icon?<img src={cue.icon} alt="" width={18} height={18}/>:<span className="hd2d-skill-placeholder" aria-hidden="true">{cue.name.slice(0,1)}</span>}<span className="hd2d-skill-name">{cue.name}</span></small>}
   </button>
  </Html>
  {scene.effects.filter(e=>e.targetId===unit.id&&(e.amount||e.kind==='miss')).slice(-3).map((e,i)=><Html key={e.id} position={[(i-1)*.35,height*.65,0]} center zIndexRange={[40,31]} style={{pointerEvents:'none'}}><span className={`hd2d-damage ${e.critical?'critical':''} ${scene.reducedMotion?'still':''}`} style={{color:schoolColor(e.school,e.kind==='heal')}}>{e.kind==='miss'?'未命中':`${e.kind==='heal'?'+':''}${e.amount}${e.critical?'!':''}`}</span></Html>)}
 </group>;
}
