import {useEffect,useRef,useState} from 'react';
import {createCombatAudio} from '@/lib/combat-audio.js';
import {freshBuffSounds} from '@/lib/buff-audio.js';
import {useAudioPreference} from '@/lib/use-audio-preference';
import type {GameProps} from './game-ui';
export function PartyBuffAudio({state:s,data:d}:Pick<GameProps,'state'|'data'>){
 const [player]=useState(()=>createCombatAudio());
 const [enabled]=useAudioPreference('effectsEnabled'),[volume]=useAudioPreference('effectsVolume');
 const cursor=useRef<number|null>(null);
 useEffect(()=>{player.setEnabled(enabled);player.setVolume(volume);},[player,enabled,volume]);
 useEffect(()=>{const update=()=>player.setActive(!document.hidden&&!s.combat);update();document.addEventListener('visibilitychange',update);return()=>{document.removeEventListener('visibilitychange',update);player.setActive(false);};},[player,!!s.combat]);
 useEffect(()=>()=>player.dispose(),[player]);
 useEffect(()=>{
  const latest=s.logSequence??s.logs.at(-1)?.id??0,previous=cursor.current;cursor.current=latest;
  // Mounting, re-opening, hidden tabs and historical/offline logs never replay.
  if(previous==null||document.hidden||!enabled||s.combat)return;
  for(const cue of freshBuffSounds(s.logs,d.combatSkills||[],previous,s.clock))player.play(cue);
 },[s.logs,s.logSequence,s.clock,s.combat,d.combatSkills,enabled,player]);
 return null;
}
