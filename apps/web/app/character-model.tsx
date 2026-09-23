"use client";

import {useEffect,useRef,useState,type ReactNode} from 'react';
import {modelEquipment} from '@/lib/model-viewer.js';

type Status='loading'|'loaded'|'partial'|'error';
export default function CharacterModel({equipment,items,raceId,classId,gender='male',fallback,title='角色 3D 换装预览',view='portrait',animation='Stand',mountDisplayId=0,paused=false}:{equipment:Record<string,{id:number}>;items:Record<string,{slot:number}>;raceId:number;classId:number;gender?:'male'|'female';fallback:ReactNode;title?:string;view?:'portrait'|'world'|'flight';animation?:'Stand'|'Run'|'Fly'|'Death';mountDisplayId?:number;paused?:boolean}){
 const container=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
 const [intersecting,setIntersecting]=useState(true),[foreground,setForeground]=useState(true),[attempt,setAttempt]=useState(0);
 const [state,setState]=useState<{revision:string;status:Status}>({revision:'',status:'loading'});
 const revision=JSON.stringify({raceId,classId,gender,view,mountDisplayId,items:modelEquipment(equipment,items)});
 const motion=useRef({animation,paused});
 useEffect(()=>{motion.current={animation,paused};},[animation,paused]);
 const publishMotion=()=>frame.current?.contentWindow?.postMessage({channel:'wow-character-motion',...motion.current},window.location.origin);
 const status=state.revision===revision?state.status:'loading';
 const visible=intersecting&&foreground;
 useEffect(()=>{
  const observer=new IntersectionObserver(entries=>setIntersecting(entries[0].isIntersecting),{rootMargin:'80px'});
  if(container.current)observer.observe(container.current);
  const visibility=()=>setForeground(!document.hidden);
  document.addEventListener('visibilitychange',visibility);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{
  const timeout=visible?window.setTimeout(()=>setState({revision,status:'error'}),70000):undefined;
  const publish=()=>frame.current?.contentWindow?.postMessage({channel:'wow-character-equipment',revision,...JSON.parse(revision)},window.location.origin);
  const receive=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||event.data?.channel!=='wow-character-model')return;
   if(event.data.status==='ready'){publish();publishMotion();return;}
   if(event.data.revision===revision&&['loading','loaded','partial','error'].includes(event.data.status)){
    if(event.data.status!=='loading')window.clearTimeout(timeout);
    setState({revision,status:event.data.status});
    if(event.data.status==='loaded'||event.data.status==='partial')publishMotion();
   }
  };
  window.addEventListener('message',receive);publish();
  return()=>{window.clearTimeout(timeout);window.removeEventListener('message',receive);};
 },[revision,visible,attempt]);
 useEffect(()=>{publishMotion();},[animation,paused]);
 const ready=visible&&(status==='loaded'||status==='partial');
 return <div ref={container} data-status={status} className={'character-model '+(ready?'model-ready':'')}>
  {!ready&&<div className="model-fallback" aria-hidden="true">{fallback}</div>}
  {visible&&status!=='error'&&<iframe ref={frame} key={attempt} src="/model-viewer/index.html" title={title} className="model-frame" onLoad={()=>{setState({revision,status:'loading'});frame.current?.contentWindow?.postMessage({channel:'wow-character-equipment',revision,...JSON.parse(revision)},window.location.origin);}}/>}
  <div className="model-status" role="status">
   {!visible?'人物预览已暂停':status==='loading'?'正在加载 3D 外观…':status==='error'?<>3D 外观暂不可用 <button type="button" onClick={()=>{setState({revision,status:'loading'});setAttempt(n=>n+1);}}>重试</button></>:status==='partial'?'部分装备外观暂不可用':'拖动人物旋转'}
  </div>
 </div>;
}
