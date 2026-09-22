"use client";
import {Component,lazy,Suspense,useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import type {BattleScene,BattleSkill} from '@/lib/battle-hd2d-types';
import {groundTheme} from '@/lib/battle-hd2d.js';
import {BattleAudio} from './battle-audio';
import {battleModel} from '../../../packages/game-data/battle-models.js';

class SceneError extends Component<{children:ReactNode;onError:()=>void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(){this.props.onError();}
 render(){return this.state.failed?null:this.props.children;}
}
export default function BattleHD2D({scene:input,skills,onSelect,active}:{scene:BattleScene;skills:BattleSkill[];onSelect:(id:string)=>void;active:boolean}){
 const scene=useMemo(()=>({...input,units:input.units.map(unit=>({...unit,visual:{...unit.visual,model:battleModel(unit,input.clock)||unit.visual?.model}}))}),[input]);
 const [visible,setVisible]=useState(true),[ready,setReady]=useState(false),[lost,setLost]=useState(false),[generation,setGeneration]=useState(0),[supported,setSupported]=useState<boolean|null>(null);
 const [BattleCanvas,setBattleCanvas]=useState(()=>lazy(()=>import('./battle-hd2d/scene')));
 const [manual,setManual]=useState(false);
 const onManual=useCallback(()=>setManual(true),[]);
 useEffect(()=>{setManual(false);},[scene.encounterId,scene.layout.zoom]);
 useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(cancelled)return;let context:WebGL2RenderingContext|null=null;try{context=document.createElement('canvas').getContext('webgl2');setSupported(!!context);}catch{setSupported(false);}finally{context?.getExtension('WEBGL_lose_context')?.loseContext();}});return()=>{cancelled=true;};},[generation]);
 useEffect(()=>{const change=()=>setVisible(!document.hidden);change();document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 const onReady=useCallback(()=>setReady(true),[]),onLoading=useCallback(()=>setReady(false),[]),onLost=useCallback(()=>setLost(true),[]);
 const retry=useCallback(async()=>{
  // TextureLoader and React.lazy retain failures; a new canvas alone cannot retry them.
  try{(await import('./battle-hd2d/scene')).clearBattleAssets(scene);}catch{/* The fresh lazy component retries module loading below. */}
  setBattleCanvas(()=>lazy(()=>import('./battle-hd2d/scene')));setLost(false);setReady(false);setGeneration(n=>n+1);
 },[scene]);
 const theme=groundTheme(scene.ground);
 return <><div className="battle-3d-controls"><button type="button" aria-pressed={!manual} onClick={()=>setManual(false)}>{manual?'恢复自动镜头':'自动镜头'}</button><span>拖动旋转 · 滚轮缩放 · 右键平移</span><BattleAudio scene={scene} skills={skills} active={active}/></div><div className={`hd2d-field ${scene.reducedMotion?'reduced-motion':''}`} data-renderer={ready&&!lost?'three':'loading'} data-ground={theme.id}>
  <div className="hd2d-scene" aria-label="3D 战场">
   {active&&!lost&&supported&&<SceneError key={generation} onError={onLost}><Suspense fallback={null}><BattleCanvas scene={scene} skills={skills} onSelect={onSelect} visible={visible} onReady={onReady} onLoading={onLoading} onLost={onLost} manual={manual} onManual={onManual}/></Suspense></SceneError>}
   {!ready&&!lost&&supported!==false&&<div className="hd2d-loading hd2d-loading-progress" role="status">正在准备战场与角色素材…</div>}
   {supported===false&&<div className="hd2d-loading" role="alert"><strong>此设备暂时无法启用 3D 战场</strong><span>可继续使用下方队伍面板和战斗记录。</span><button onClick={retry}>重试图形连接</button></div>}
   {lost&&<div className="hd2d-loading" role="alert"><strong>战场画面暂时无法显示</strong><span>可继续查看队伍状态与战斗记录。</span><button onClick={retry}>恢复战场画面</button></div>}
  </div>
  <div className="hd2d-vignette"/>
  <div className="hd2d-scene-title"><span className="hd2d-chapter">{scene.live?'LIVE ENCOUNTER':'BATTLE RECORD'}</span><strong>{theme.name}</strong><span>3D · {scene.lowEffects?'流畅':'精细'}</span></div>
  <div className="hd2d-scene-caption"><span className="hd2d-live-dot"/>{scene.layout.area?.name||'遭遇战'}<span>选择角色查看目标与技能范围</span></div>
 </div></>;
}
