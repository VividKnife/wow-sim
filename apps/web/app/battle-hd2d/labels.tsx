import {useCallback,useMemo,type ReactNode} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {Vector3} from 'three';
import {actorHeight} from '@/lib/battle-hd2d.js';
import {projectBattleLabel} from '@/lib/battle-labels.js';
import {actionProgress,schoolColor,unitCondition} from '@/lib/combat-view.js';
import type {BattleScene,BattleSkill} from '@/lib/battle-hd2d-types';
import {useBattleFrame} from './frame';

const origin=():[number,number]=>[0,0];
const damageKey=(unit:string,event:string|number)=>JSON.stringify([unit,event]);
type Registry=Map<string,HTMLDivElement>;
function Anchor({id,registry,children,damage=false}:{id:string;registry:Registry;children:ReactNode;damage?:boolean}){
 const ref=useCallback((node:HTMLDivElement|null)=>{if(node){node.hidden=true;registry.set(id,node);}else registry.delete(id);},[id,registry]);
 return <div ref={ref} style={{position:'absolute',top:0,left:0,zIndex:damage?2:1}}><div style={{transform:'translate(-50%,-50%)'}}>{children}</div></div>;
}
export function BattleLabels({scene,skills,onSelect}:{scene:BattleScene;skills:BattleSkill[];onSelect:(id:string)=>void}){
 const frame=useBattleFrame(),registry=useMemo<Registry>(()=>new Map(),[]),point=useMemo(()=>new Vector3(),[]);
 const skillById=useMemo(()=>new Map(skills.map(s=>[s.spellId,s])),[skills]);
 useFrame(({camera,size})=>{
  const f=frame.current;camera.updateMatrixWorld();
  const position=(id:string,unitId:string,height:number,dx=0)=>{
   const node=registry.get(id);if(!node)return;
   projectBattleLabel(point,f.layout,unitId,height,camera,size,dx);
   node.hidden=point.z< -1||point.z>1;
   const transform=`translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;
   if(node.style.transform!==transform)node.style.transform=transform;
  };
  for(const unit of f.scene.units){
   const height=actorHeight(f.layout,unit);position(unit.id,unit.id,height*1.15);
   const cue=registry.get(unit.id)?.querySelector<HTMLElement>('.hd2d-skill');
   if(cue){const event=f.scene.effects.findLast(e=>e.actorId===unit.id&&e.spellId&&['cast','launch'].includes(e.kind));cue.hidden=!(unit.cast&&f.clock>=unit.cast.startedAt&&f.clock<unit.cast.until)&&!(event&&f.wall>=event.shownAt&&f.wall-event.shownAt<1000);}
   f.scene.effects.filter(e=>e.targetId===unit.id&&(e.amount||e.kind==='miss')).slice(-3).forEach((e,i)=>position(damageKey(unit.id,e.id),unit.id,height*.65,(i-1)*.35));
  }
 },-1);
 // One DOM root for the whole overlay. Per-actor/per-hit Html roots repeatedly
 // traverse the skinned scene on mount and commit independently on every packet.
 return <Html calculatePosition={origin} zIndexRange={[30,30]} style={{pointerEvents:'none'}}>{scene.units.filter(u=>!u.removed).map(unit=>{
  const selected=unit.id===scene.selectedId,dead=unit.hp<=0,condition=unitCondition(unit,scene.clock);
  const event=scene.effects.findLast(e=>e.actorId===unit.id&&e.spellId&&['cast','launch'].includes(e.kind));
  const casting=!!unit.cast&&scene.clock>=unit.cast.startedAt&&scene.clock<unit.cast.until;
  const cue=skillById.get((casting?unit.cast?.spell:event?.spellId)??0);
  return <div key={unit.id}>
   <Anchor id={unit.id} registry={registry}>
    <button type="button" style={{pointerEvents:'auto'}} onClick={()=>onSelect(unit.id)} aria-label={`${unit.name}，生命 ${Math.max(0,Math.ceil(unit.hp))}，${dead?'已倒下':condition||'可行动'}`} aria-pressed={selected} className={`hd2d-unit-label ${unit.foe?'enemy':'ally'} ${selected?'selected':''} ${dead?'dead':''}`} data-unit-id={unit.id}>
     {unit.commandMark&&!dead&&<span className="hd2d-command-mark">{unit.commandMark}</span>}<span className="hd2d-unit-name">{unit.name}</span>
     {unit.marker&&!dead&&<small className={`hd2d-objective ${unit.marker}`}>{unit.marker==='focus'?'集火':'控场'}</small>}
     {!dead&&<><span className="hd2d-health"><i style={{width:`${Math.max(0,Math.min(100,unit.hp/Math.max(1,unit.maxHp)*100))}%`}}/></span><span className="hd2d-action"><i style={{width:`${(unit.cast?actionProgress(unit.cast.startedAt,unit.cast.until,scene.clock):unit.swing||0)*100}%`,background:unit.cast?'#a9ceec':'#c7ad71'}}/></span></>}
     {condition&&<small className="hd2d-condition">{condition}</small>}
     {cue&&!dead&&<small className="hd2d-skill" title={cue.name} style={{color:schoolColor(cue.school)}}>{cue.icon?<img src={cue.icon} alt="" width={18} height={18}/>:<span className="hd2d-skill-placeholder" aria-hidden="true">{cue.name.slice(0,1)}</span>}<span className="hd2d-skill-name">{cue.name}</span></small>}
    </button>
   </Anchor>
   {scene.effects.filter(e=>e.targetId===unit.id&&(e.amount||e.kind==='miss')).slice(-3).map(e=><Anchor key={e.id} id={damageKey(unit.id,e.id)} registry={registry} damage><span className={`hd2d-damage ${e.critical?'critical':''} ${scene.reducedMotion?'still':''}`} style={{color:schoolColor(e.school,e.kind==='heal')}}>{e.kind==='miss'?'未命中':`${e.kind==='heal'?'+':''}${e.amount}${e.critical?'!':''}`}</span></Anchor>)}
  </div>;
 })}</Html>;
}

