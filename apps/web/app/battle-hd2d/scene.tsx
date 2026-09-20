import {Suspense,useCallback,useEffect,useLayoutEffect} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {useTexture} from '@react-three/drei';
import {groundTheme,spriteAppearance} from '@/lib/battle-hd2d.js';
import {ACESFilmicToneMapping,WebGLRenderer,type WebGLRendererParameters} from 'three';
import {EffectComposer,Bloom,DepthOfField} from '@react-three/postprocessing';
import type {BattleScene,BattleSkill} from '@/lib/battle-hd2d-types';
import {BattleFrames,CameraRig} from './frame';
import {Environment} from './environment';
import {BattleUnit} from './unit';
import {BattleEffects} from './effects';

export function clearBattleAssets(scene:BattleScene){
 const urls=new Set([`/battle/ground/${groundTheme(scene.ground).id}.webp`,'/battle/hd2d/characters.png','/battle/hd2d/forms.png',...scene.units.map(unit=>spriteAppearance(unit,scene.clock).src)]);
 for(const url of urls)useTexture.clear(url);
}
function LoadingSignal({onLoading}:{onLoading:()=>void}){useLayoutEffect(onLoading,[onLoading]);return null;}
function Lifecycle({low,visible,onReady,onLost}:{low:boolean;visible:boolean;onReady:()=>void;onLost:()=>void}){
 const {gl,invalidate}=useThree();
 // Layout effects are reconnected when Suspense reveals a newly loaded terrain or creature.
 useLayoutEffect(onReady,[onReady]);
 useEffect(()=>{const lost=(event:Event)=>{event.preventDefault();onLost();};gl.domElement.addEventListener('webglcontextlost',lost);return()=>gl.domElement.removeEventListener('webglcontextlost',lost);},[gl,onLost]);
 useEffect(()=>{if(!low||!visible)return;const timer=setInterval(invalidate,1000/30);return()=>clearInterval(timer);},[low,visible,invalidate]);
 return null;
}
export default function BattleCanvas({scene,skills,onSelect,visible,onReady,onLoading,onLost}:{scene:BattleScene;skills:BattleSkill[];onSelect:(id:string)=>void;visible:boolean;onReady:()=>void;onLoading:()=>void;onLost:()=>void}){
 const createRenderer=useCallback((defaults:WebGLRendererParameters)=>{try{const renderer=new WebGLRenderer({...defaults,antialias:true,alpha:false,powerPreference:'high-performance'});renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;return renderer;}catch(error){queueMicrotask(onLost);throw error;}},[onLost]);
 return <Canvas orthographic camera={{position:[0,25,32],zoom:24,near:.1,far:150}} shadows={scene.lowEffects?false:'percentage'}
  dpr={scene.lowEffects?1:[1,1.5]} frameloop={!visible?'never':scene.lowEffects?'demand':'always'} gl={createRenderer}
  aria-label="HD-2D 三维战斗场景" fallback={null}>
  <BattleFrames scene={scene}>
   <CameraRig/>
   <Suspense fallback={<LoadingSignal onLoading={onLoading}/>}>
    <Environment ground={scene.ground||'grass'} low={scene.lowEffects} reduced={scene.reducedMotion}/>
    {scene.units.map(unit=><BattleUnit key={`${scene.encounterId}:${unit.id}`} unit={unit} scene={scene} skills={skills} onSelect={onSelect}/>)}
    <BattleEffects scene={scene}/>
    {!scene.lowEffects&&<EffectComposer multisampling={0}><Bloom luminanceThreshold={.8} intensity={.35} mipmapBlur/><DepthOfField target={[0,0,0]} focusRange={16} bokehScale={1.2} height={360}/></EffectComposer>}
    <Lifecycle low={scene.lowEffects} visible={visible} onReady={onReady} onLost={onLost}/>
   </Suspense>
  </BattleFrames>
 </Canvas>;
}
