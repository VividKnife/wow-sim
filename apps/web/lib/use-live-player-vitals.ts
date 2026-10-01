"use client";
import {useCombatPlayback} from './use-combat-playback';

/** Keep the player frame on the same combat timeline as the battle scene. */
export function useLivePlayerVitals(state:any,data:any,playback:any,contentVersion:string|undefined){
 const active=!!state.combat;
 return useCombatPlayback(state,data,active?playback:null,contentVersion,active);
}
