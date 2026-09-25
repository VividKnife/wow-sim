'use client';
import type {ReactNode} from 'react';
import {useLocalCombat} from '@/lib/local-combat-store';
import {useCombatPlayback} from '@/lib/use-combat-playback';
import DamageMeter from './damage-meter';
import type {GameProps} from './game-ui';

// Subscribe here so combat frames update the meter without rerendering the HUD.
export default function LiveDamageMeter({state,data,playback,contentVersion,empty}:{
 state:GameProps['state'];data:GameProps['data'];playback?:GameProps['playback'];
 contentVersion?:string;empty?:ReactNode;
}){
 const local=useLocalCombat(state,data,true);
 const {state:s,data:d}=useCombatPlayback(local.state,local.data,playback,contentVersion,true);
 const battle=s.combat||s.lastCombat;
 return battle?<DamageMeter battle={battle} dungeon={s.dungeon} clock={s.clock} skills={d.combatSkills||d.skills}/>:empty;
}
