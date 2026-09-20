'use client';
import {useEffect,useState,type ReactNode} from 'react';
import CharacterModel from './character-model';

type Preview={equipment:Record<string,{id:number}>;items:Record<string,{slot:number}>};
export default function CreationModel({raceId,classId,boost,fallback,title}:{raceId:number;classId:number;boost:boolean;fallback:ReactNode;title:string}){
 const [result,setResult]=useState<Preview|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`/api/character-preview?raceId=${raceId}&classId=${classId}&level=${boost?20:1}`,{signal:controller.signal})
   .then(async response=>{if(!response.ok)throw new Error('Preview unavailable');return response.json();})
   .then(data=>{if(!controller.signal.aborted)setResult(data);})
   .catch(()=>{if(!controller.signal.aborted)setError(true);});
  return()=>controller.abort();
 },[raceId,classId,boost,attempt]);
 if(!result)return <div className="creation-model-loading">{fallback}<p role="status">{error?<>外观暂不可用 <button type="button" onClick={()=>{setError(false);setAttempt(value=>value+1);}}>重试</button></>:'正在准备角色外观…'}</p></div>;
 return <CharacterModel raceId={raceId} classId={classId} equipment={result.equipment} items={result.items} fallback={fallback} title={title}/>;
}
