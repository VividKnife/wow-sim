import {useEffect,useRef,useState} from 'react';
import {restockTownSupplies,townSupplyRunKey} from '@/lib/town-supplies.js';

export default function TownSupplyPlugin({snapshot,busy,send,getSnapshot}:{snapshot:any;busy:boolean;send:(body:any)=>Promise<boolean>;getSnapshot:()=>any}){
 const [running,setRunning]=useState(false);
 const completed=useRef<string|null>(null),mounted=useRef(true);
 const key=townSupplyRunKey(snapshot);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  if(!key){completed.current=null;return;}
  if(busy||running||completed.current===key)return;
  completed.current=key;setRunning(true);
  void restockTownSupplies({getSnapshot,send,runKey:key,isCancelled:()=>!mounted.current}).finally(()=>{setRunning(false);});
 },[key,busy,running,getSnapshot,send]);
 return null;
}
