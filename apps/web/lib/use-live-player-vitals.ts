"use client";
import {useLocalCombat} from './local-combat-store';
import {useCombatPlayback} from './use-combat-playback';

/** Keep the player frame on the same combat timeline as the battle scene. */
export function useLivePlayerVitals(state:any,data:any,playback:any,contentVersion:string|undefined){
 const active=!!state.combat;
 const local=useLocalCombat(state,data,active);
 const current=active&&local.state.combat?.id===state.combat.id&&local.state.clock>=state.clock?local:{state,data};
 return useCombatPlayback(current.state,current.data,active?playback:null,contentVersion,active);
}
