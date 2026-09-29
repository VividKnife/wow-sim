'use client';
import {useSyncExternalStore} from 'react';

const key='wow-sim:command-hidden',event='wow-sim:command-hidden-change';
let memory:boolean|null=null;
const read=()=>{try{return memory??localStorage.getItem(key)==='true';}catch{return memory??false;}};
const subscribe=(listener:()=>void)=>{
 const storage=(e:StorageEvent)=>{if(e.key===key||e.key===null){memory=null;listener();}};
 window.addEventListener('storage',storage);window.addEventListener(event,listener);
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener(event,listener);};
};
const write=(hidden:boolean)=>{
 memory=hidden;
 try{localStorage.setItem(key,String(hidden));}catch{/* Preserve the preference for this session when storage is unavailable. */}
 window.dispatchEvent(new Event(event));
};
export function useCommandHidden(){
 const hidden=useSyncExternalStore(subscribe,read,()=>false);
 return [hidden,write] as const;
}
