import {Component,Suspense,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import {Bounds,Html,OrbitControls,useGLTF,useTexture} from '@react-three/drei';
import type {CreatureModelData} from '@/lib/battle-hd2d-types';
import {battleModel} from '@/lib/battle-models.js';
import {createCreatureInstance} from '@/lib/creature-instance.js';
import {creatureClip} from '@/lib/creature-animation.js';
import {publicAsset} from '@/lib/public-asset';
import CreaturePortrait from './creature-portrait';

class ModelBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}
function PetMesh({model,paused}:{model:any;paused:boolean}){
 const asset=useGLTF(publicAsset(model.src)),skins=useTexture(Object.values(model.textures||{}).map(path=>publicAsset(String(path))));
 const instance=useMemo(()=>createCreatureInstance(asset,model,[],skins),[asset,model,skins]);
 useEffect(()=>{instance.action(creatureClip(model.animations,'idle'))?.play();return()=>instance.dispose();},[instance,model]);
 useFrame((_,delta)=>{if(!paused)instance.mixer.update(Math.min(delta,.1));});
 return <primitive object={instance.object} dispose={null}/>;
}
export default function PetModel({entry,name}:{entry:number;name:string}){
 const model=useMemo(()=>battleModel({entry,kind:'beast'}) as CreatureModelData|null,[entry]),container=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(true),[foreground,setForeground]=useState(true),[paused,setPaused]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting));
  if(container.current)observer.observe(container.current);
  const query=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setPaused(query.matches),visibility=()=>setForeground(!document.hidden);
  motion();visibility();query.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();query.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);
 const fallback=<div className="pet-model-fallback"><CreaturePortrait unit={{entry,creatureType:1}}/><p role="status">{model?'3D 外观暂不可用':'此宠物的 3D 外观尚未收录'}</p>{model&&<button type="button" onClick={()=>{useGLTF.clear(publicAsset(model.src));useTexture.clear(Object.values(model.textures||{}).map(path=>publicAsset(String(path))));setAttempt(n=>n+1);}}>重新加载</button>}</div>;
 return <div ref={container} className="pet-model" aria-label={`${name}的 3D 展示`}>
  {model&&visible&&foreground?<ModelBoundary key={`${entry}:${attempt}`} fallback={fallback}>
   <Canvas camera={{position:[5,2.8,6],fov:38}} dpr={[1,1.5]} frameloop={paused?'demand':'always'} fallback={fallback}>
    <ambientLight intensity={1.7}/><directionalLight position={[4,7,6]} intensity={2.5}/><directionalLight position={[-4,2,-3]} color="#aecbb2" intensity={1.2}/>
    <Suspense fallback={<Html center><span className="pet-model-loading" role="status">正在加载宠物…</span></Html>}><Bounds fit clip observe margin={1}><PetMesh model={model} paused={paused}/></Bounds></Suspense>
    <OrbitControls makeDefault enablePan={false} minPolarAngle={.2} maxPolarAngle={Math.PI/2} minDistance={1} maxDistance={25}/>
   </Canvas>
  </ModelBoundary>:model?<CreaturePortrait unit={{entry,creatureType:1}}/>:fallback}
  <div className="pet-model-caption"><span>拖动旋转 · 滚轮缩放</span>{model&&<button type="button" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'播放动作':'暂停动作'}</button>}</div>
 </div>;
}
