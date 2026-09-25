'use client';
import {useEffect,useState} from 'react';
import {contentLoader} from './content-loader.js';

export function useContentPack(version:string|undefined,pack:string|undefined){
 const key=JSON.stringify([version,pack]);
 const [result,setResult]=useState<{key:string;data?:any;error?:string}>({key:''});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!version||!pack)return;
  let active=true;
  setResult({key});
  void contentLoader.pack(version,pack).then(data=>{if(active)setResult({key,data});}).catch(error=>{if(active)setResult({key,error:error.message});});
  return()=>{active=false;};
 },[version,pack,key,attempt]);
 return {data:result.key===key?result.data:undefined,error:result.key===key?result.error:undefined,retry:()=>setAttempt(n=>n+1)};
}
