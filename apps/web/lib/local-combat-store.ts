"use client";
import {useSyncExternalStore} from 'react';
import {playbackPerspective} from './combat-playback.js';
import type {BattlegroundView} from '../../../packages/contracts/src/battleground';

let current:any=null;
const listeners=new Set<()=>void>();
export function publishLocalCombat(snapshot:any) {current=snapshot;for(const listener of listeners)listener();}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
const read=()=>current;
const empty=()=>null;
export function useLocalArena(fallback:any){
 const sample=useSyncExternalStore(subscribe,read,empty)?.view?.arena;
 return sample?.match?.id===fallback?.match?.id&&['countdown','combat'].includes(fallback?.match?.phase)&&sample.match.clock>=fallback.match.clock?sample:fallback;
}
export function useLocalBattleground(fallback:BattlegroundView|undefined):BattlegroundView|undefined{
 const sample=useSyncExternalStore(subscribe,read,empty)?.view?.battleground;
 const match=fallback?.match;
 return match&&sample?.match?.id===match.id&&['countdown','combat'].includes(match.phase)&&sample.match.clock>=match.clock&&sample.match.revision>=match.revision?sample:fallback;
}
export function useLocalCombat(state:any,data:any,enabled:boolean) {
  const sample=useSyncExternalStore(enabled?subscribe:()=>()=>{},enabled?read:empty,empty);
  // The scene may interpolate one tick, but never continue a stale fight forever.
  return sample?.view?.battleView?.actors?.some((actor:any)=>actor.id===state.id)
    ? playbackPerspective(state,data,sample,sample.player.clock+100) : {state,data};
}
