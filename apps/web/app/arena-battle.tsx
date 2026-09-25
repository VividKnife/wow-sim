"use client";
import {useLowEffects} from '@/lib/use-low-effects';
import {useBattleViewZoom} from '@/lib/use-battle-zoom';
import {useEffect,useMemo,useRef,useState} from 'react';
import BattleHD2D from './battle-hd2d';
import {arenaBattleScene} from '@/lib/arena-battle-scene.js';
import {recentCombatEvents,mergeCombatEffects,unitCondition} from '@/lib/combat-view.js';
import type {BattleScene} from '@/lib/battle-hd2d-types';

export default function ArenaBattle({match}:{match:any}){
 const [zoom,setZoom,defaultZoom]=useBattleViewZoom(match.id);
 const [selectedId,setSelectedId]=useState(match.teams[0].members[0].id);
 const [lowEffects,setLowEffects]=useLowEffects(),[reducedMotion,setReducedMotion]=useState(false),[effects,setEffects]=useState<any[]>([]);
 const cursor=useRef(0);
 useEffect(()=>{
  const motion=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(motion.matches);
  update();motion.addEventListener('change',update);
  return()=>motion.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  const events=recentCombatEvents(match.logs,cursor.current,match.clock);cursor.current=match.logs.at(-1)?.id||cursor.current;
  if(match.phase==='combat'&&events.length)setEffects(old=>mergeCombatEffects(old,events,Date.now(),match.projectiles));
 },[match.logs,match.clock,match.phase,match.projectiles]);
 useEffect(()=>{const timer=setInterval(()=>setEffects(old=>old.some(e=>Date.now()-e.shownAt>=1500)?old.filter(e=>Date.now()-e.shownAt<1500):old),200);return()=>clearInterval(timer);},[]);
 const scene=useMemo(()=>arenaBattleScene(match,{selectedId,zoom,effects,sampledAt:performance.now(),wallAt:Date.now(),lowEffects,reducedMotion}) as BattleScene,[match,selectedId,zoom,effects,lowEffects,reducedMotion]);
 const selected=match.teams.flatMap((t:any)=>t.members).find((c:any)=>c.id===scene.selectedId),unit=scene.units.find(c=>c.id===scene.selectedId);
 return <div className="arena-character-battle">
  <div className="arena-scene-toolbar"><div className="battle-zoom" role="group" aria-label="竞技场视野缩放">
   <button type="button" aria-label="缩小竞技场视野" disabled={zoom<=.5} onClick={()=>setZoom(z=>Math.max(.5,Math.round((z-.1)*10)/10))}>−</button>
   <output>{Math.round(zoom*100)}%</output>
   <button type="button" aria-label="放大竞技场视野" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,Math.round((z+.1)*10)/10))}>＋</button>
   <button type="button" onClick={()=>setZoom(defaultZoom)}>默认取景</button>
  </div><label className="battle-effects-control"><input type="checkbox" checked={lowEffects} onChange={e=>setLowEffects(e.target.checked)}/>简化特效</label></div>
  <div className="battle-room"><BattleHD2D scene={scene} skills={match.skills||[]} onSelect={setSelectedId} active/>
   {match.phase==='countdown'&&<div className="battle-pull-countdown" role="status"><span>准备开门</span><strong>{Math.max(0,Math.ceil((3000-match.clock)/1000))}</strong></div>}
  </div>
  <div className="arena-scene-roster" role="group" aria-label="选择竞技场战斗角色">{scene.units.map(c=><button key={c.id} type="button" aria-pressed={scene.selectedId===c.id} onClick={()=>setSelectedId(c.id)} className={c.foe?'enemy':'ally'}>{c.name}{c.hp<=0?' · 已倒下':''}</button>)}</div>
  {selected&&unit&&<div className="arena-scene-selection"><strong>{selected.name}</strong><span>{selected.hp<=0?'已倒下':unitCondition(unit,match.clock)||selected.cast?.name||selected.intent||'可行动'}</span><span>{Math.max(0,Math.ceil(selected.hp))} / {selected.maxHp}</span></div>}
 </div>;
}
