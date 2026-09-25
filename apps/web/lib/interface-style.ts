'use client';
import {useSyncExternalStore} from 'react';
export type InterfaceStyle='classic'|'web';
const key='wow-sim:interface-style';
const event='wow-sim:interface-style-change';
let memory:InterfaceStyle|null=null;
const read=():InterfaceStyle=>{try{return memory||(localStorage.getItem(key)==='web'?'web':'classic');}catch{return memory||'classic';}};
const subscribe=(listener:()=>void)=>{
 const storage=(e:StorageEvent)=>{if(e.key===key||e.key===null){memory=null;listener();}};
 window.addEventListener('storage',storage);window.addEventListener(event,listener);
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener(event,listener);};
};
export function useInterfaceStyle(){
 const style=useSyncExternalStore(subscribe,read,():InterfaceStyle=>'classic');
 const setStyle=(next:InterfaceStyle)=>{memory=next;try{localStorage.setItem(key,next);}catch{/* Keep this session usable when storage is unavailable. */}window.dispatchEvent(new Event(event));};
 return [style,setStyle] as const;
}
