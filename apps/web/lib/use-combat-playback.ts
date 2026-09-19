"use client";
import {saveFetch} from './save-fetch';
import {useEffect,useState} from 'react';
import {createCombatPlayback,playbackPerspective} from './combat-playback.js';

const recordings=new Map<string,any>();
export function useCombatPlayback(state:any,data:any,manifest:any,contentVersion:string|undefined,open:boolean){
 const key=manifest&&contentVersion?`${contentVersion}:${state.id}:${manifest.id}`:'';
 const [sample,setSample]=useState<any>(null),[status,setStatus]=useState('');
 useEffect(()=>{
  if(!key||!open)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,frame=0,lastSample=0;
  const controller=new AbortController();
  const play=(loaded:any)=>{
   const cursor=createCombatPlayback(loaded.recording,loaded.receivedAt,loaded.transit);
   setStatus('');
   const draw=(now:number)=>{
    if(stopped)return;
    if(!document.hidden&&now-lastSample>=100){lastSample=now;setSample({key,...cursor.read(now)});}
    frame=requestAnimationFrame(draw);
   };
   draw(performance.now());
  };
  const load=async()=>{
   try{
    setStatus('正在准备战斗画面…');
    const started=performance.now();
    const response=await saveFetch(`/api/game/replay?${new URLSearchParams({id:manifest.id,characterId:state.id})}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
    if(!response.ok)throw new Error('Playback unavailable');
    const recording=await response.json(),receivedAt=performance.now();
    if(stopped)return;
    if(recording.id!==manifest.id||recording.contentVersion!==contentVersion)throw new Error('Playback version mismatch');
    const loaded={recording,receivedAt,transit:(receivedAt-started)/2};
    recordings.set(key,loaded);while(recordings.size>4)recordings.delete(recordings.keys().next().value!);
    play(loaded);
   }catch{
    if(stopped)return;
    setStatus('战斗画面暂时无法加载，正在重试…');timer=setTimeout(load,2000);
   }
  };
  const cached=recordings.get(key);if(cached)play(cached);else void load();
  return()=>{stopped=true;controller.abort();cancelAnimationFrame(frame);clearTimeout(timer);};
 },[key,open]);
 if(!key||sample?.key!==key)return {state,data,status:key?status:'',replaying:false};
 return {...playbackPerspective(state,data,sample.snapshot,manifest.endClock),status,replaying:true};
}
