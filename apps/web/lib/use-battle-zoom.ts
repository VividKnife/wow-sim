'use client';
import {useState,useSyncExternalStore} from 'react';
import {readBattleZoom,writeBattleZoom,subscribeGraphicsPreferences} from './graphics-preferences.js';

export function useBattleZoom(){
 const zoom=useSyncExternalStore(subscribeGraphicsPreferences,readBattleZoom,()=>1);
 return [zoom,writeBattleZoom] as const;
}

export function useBattleViewZoom(encounterId:string|undefined){
 const [defaultZoom]=useBattleZoom();
 const [override,setOverride]=useState<{encounterId:string|undefined;value:number}|null>(null);
 const zoom=override&&override.encounterId===encounterId?override.value:defaultZoom;
 const setZoom=(next:number|((value:number)=>number))=>setOverride(previous=>{
  const value=previous&&previous.encounterId===encounterId?previous.value:defaultZoom;
  return {encounterId,value:typeof next==='function'?next(value):next};
 });
 return [zoom,setZoom,defaultZoom] as const;
}
