'use client';
import {useEffect,useRef,useState} from 'react';
import {Compass,Footprints,Maximize2,Pause,Play} from 'lucide-react';
import {worldSceneState,worldScenery} from '@/lib/world-scene.js';
import {scenePresentation} from '@/lib/scene-presentation.js';
import CharacterModel from './character-model';
import SceneBackdrop from './scene-backdrop';
import Battle from './battle';
import type {GameProps} from './game-ui';
import './world-scene.css';

export default function WorldScene(props:GameProps&{onObserve?:()=>void;animationPaused?:boolean;canLead?:boolean;commandMemberId?:string;onCommandMemberChange?:(id:string)=>void}){
 const {state:s,data:d}=props,scene=worldSceneState(s,d),presentation=scenePresentation(s,d);
 const container=useRef<HTMLElement>(null);
 const [paused,setPaused]=useState(false),[visible,setVisible]=useState(true),[foreground,setForeground]=useState(true);
 useEffect(()=>{
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'120px'});
  if(container.current)observer.observe(container.current);
  const visibility=()=>setForeground(!document.hidden);
  visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
 },[]);
 const animationPaused=paused||!!props.animationPaused||!visible||!foreground||!!s.presence?.paused;
 return <section ref={container} className={`world-scene scenery-${worldScenery(presentation.location)} ${scene.flying?'is-flying':''} ${scene.moving&&!animationPaused?'is-moving':''} ${scene.combat?'is-combat':''}`} aria-label="世界沉浸场景" data-motion={scene.animation} data-travel-mode={scene.flying?'flight':scene.mountDisplayId?'ride':'foot'}>
  <div className="world-exploration" aria-hidden={scene.combat} inert={scene.combat}>
   <SceneBackdrop image={presentation.image} city={!!d.city&&!presentation.instance} flying={scene.flying}/><div className="world-scene-mist"/>
   {scene.flying&&<div className="world-flight-clouds" aria-hidden="true"/>}
   <div className={'world-avatar '+(scene.mountDisplayId?'is-mounted':'')}>
    <div className="world-avatar-shadow"/>
    <CharacterModel equipment={s.equipment} items={d.items} raceId={s.raceId||1} classId={s.classId||8} gender={s.gender||'male'} view={scene.flying?'flight':'world'} animation={scene.animation as 'Stand'|'Run'|'Fly'|'Death'} mountDisplayId={scene.mountDisplayId} paused={animationPaused||scene.combat} fallback={<span className="world-model-placeholder">✦</span>} title="第三人称角色与当前装备"/>
   </div>
   <div className="world-scene-vignette"/>
   <header className="world-scene-heading"><span>艾泽拉斯 · {presentation.instance?'副本':scene.flying?'天空航线':'旅途'}</span><h2>{presentation.name}{scene.flying?'上空':''}</h2><p>{presentation.region} · {presentation.instance?'副本内部':scene.flying?'飞行途中':d.city?'城镇':'野外'}</p></header>
   <div className="world-scene-compass" aria-hidden="true"><Compass size={28}/><span>N</span></div>
   <footer className="world-scene-footer"><span className="world-motion-label"><Footprints size={15}/>{scene.label}{scene.destination&&<span> → {scene.destination}</span>}</span><span className="world-avatar-name">{s.name} <small>Lv. {s.level}</small></span></footer>
   <button className="world-scene-pause" onClick={()=>setPaused(value=>!value)} aria-label={paused?'播放场景动画':'暂停场景动画'} aria-pressed={paused}>{paused?<Play size={14}/>:<Pause size={14}/>}</button>
   {scene.flying&&<progress className="world-flight-progress" aria-label="飞行航程" max={1} value={scene.flightProgress}/>}
  </div>
  {scene.combat&&<><div className="world-battle-pending" role="status">正在进入战场…</div><div className="world-scene-combat"><Battle {...props} embedded open={visible&&!animationPaused} onOpenChange={()=>{}}/>{props.onObserve&&<button className="world-battle-expand" onClick={props.onObserve}><Maximize2 size={14}/>展开战斗</button>}</div></>}
 </section>;
}
