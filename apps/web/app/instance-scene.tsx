import {useEffect,useState} from 'react';
import BattleHD2D from './battle-hd2d';
import {sceneLayout} from '@/lib/battle-scene.js';
import {useLowEffects} from '@/lib/use-low-effects';
import type {BattleScene} from '@/lib/battle-hd2d-types';

export default function InstanceScene({scene,playerId,skills,active,onSelect}:{scene:any;playerId:string;skills:any[];active:boolean;onSelect?:(id:string)=>void}){
 const [selected,setSelected]=useState(playerId),[lowEffects]=useLowEffects();
 const [reducedMotion,setReducedMotion]=useState(false);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 const unit=scene.units.find((u:any)=>u.id===selected)||scene.units[0];
 const view:BattleScene={mode:'preparation',title:scene.name,subtitle:`${scene.roomName} · ${scene.phase}`,encounterId:scene.id+':'+scene.roomId,playerId,
  live:active,clock:scene.clock,sampledAt:performance.now(),layout:sceneLayout(scene.units,[],1,scene.area),units:scene.units,selectedId:unit?.id||playerId,range:0,
  projectiles:[],effects:[],groundEffects:[],lowEffects,reducedMotion,ground:scene.ground};
 return <div className="world-embedded-battle instance-preparation" aria-label="副本队伍场景" data-instance-id={scene.id} data-member-count={scene.memberCount}>
  <BattleHD2D scene={view} skills={skills} onSelect={id=>{setSelected(id);onSelect?.(id);}} active={active}/>
  <div className="instance-preparation-status" role="status"><strong>{scene.memberCount} 人 · {scene.phase}</strong><span>{unit?.name} · 生命 {Math.round(unit?.hp||0)}/{Math.round(unit?.maxHp||0)}</span><span>{(unit?.effects||[]).filter((e:any)=>e.kind==='buff').map((e:any)=>e.name).slice(0,8).join(' · ')||'可先补充增益、恢复或安排战术，再推进战斗'}</span></div>
 </div>;
}
