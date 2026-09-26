'use client';
import {useLocalCombat} from '@/lib/local-combat-store';
import {useCombatPlayback} from '@/lib/use-combat-playback';
import {classCombatMeta,classResource} from '../../../packages/sim-core/src/class-combat.js';
import BattleRaidFrames from './battle-raid-frames';
import type {GameProps} from './game-ui';

// Keep high-frequency health updates inside the frames, not the entire HUD.
export default function LiveRaidFrames({state,data,playback,contentVersion,selectedId,onSelect}:{
 state:GameProps['state'];data:GameProps['data'];playback?:GameProps['playback'];
 contentVersion?:string;selectedId:string;onSelect:(id:string)=>void;
}){
 const local=useLocalCombat(state,data,true);
 const {state:s,data:d}=useCombatPlayback(local.state,local.data,playback,contentVersion,true);
 const current=[{...s,stats:d.stats},...(d.party||[])];
 const units=(s.combat&&d.battleView?.actors||current).filter((unit:any)=>!unit.escortNpc);
 // At camp the battle projection describes the last fight. Use current HP and
 // resources so recovery is visible instead of retaining that fight's casualties.
 const views=s.combat?d.battleView?.units||{}:Object.fromEntries(current.map((unit:any)=>[unit.id,{
  hp:unit.hp,maxHp:unit.stats?.maxHp??unit.maxHp??1,
  className:classCombatMeta[unit.classId]?.name,resource:classResource(unit,unit.stats),
 }]));
 return <BattleRaidFrames units={units} views={views} selectedId={units.some((unit:any)=>unit.id===selectedId)?selectedId:s.id} onSelect={onSelect} clock={s.clock} live/>;
}
