import {useEffect,useRef,useState} from 'react';
import {scheduleCombatSounds,createCombatAudio} from '@/lib/combat-audio.js';
import {useAudioPreference} from '@/lib/use-audio-preference';
import type {BattleScene,BattleSkill} from '@/lib/battle-hd2d-types';

export function BattleAudio({scene,skills,active}:{scene:BattleScene;skills:BattleSkill[];active:boolean}){
 const [player]=useState(()=>createCombatAudio());
 const [enabled,setEnabled]=useAudioPreference('effectsEnabled'),[volume,setVolume]=useAudioPreference('effectsVolume');
 const heard=useRef(new Set<string|number>());
 useEffect(()=>{player.setEnabled(enabled);},[player,enabled]);
 useEffect(()=>{player.setVolume(volume);},[player,volume]);
 useEffect(()=>{const update=()=>player.setActive(active&&!!scene.live&&!scene.paused&&!document.hidden);update();document.addEventListener('visibilitychange',update);return()=>{document.removeEventListener('visibilitychange',update);player.setActive(false);};},[player,active,scene.live,scene.paused]);
 useEffect(()=>()=>player.dispose(),[player]);
 useEffect(()=>{heard.current.clear();},[scene.encounterId]);
 useEffect(()=>scheduleCombatSounds(scene.effects,skills,scene.units,heard.current,(cue:string)=>player.play(cue)),[scene.effects,scene.units,scene.encounterId,skills,player]);
 return <div className="battle-audio-controls" role="group" aria-label="战斗音效">
  <button type="button" aria-pressed={enabled} onClick={()=>{player.setEnabled(!enabled);setEnabled(!enabled);if(!enabled)player.play('ui-click');}}>{enabled?'音效：开':'音效：关'}</button>
  <label>音量 <input type="range" aria-label="战斗音量" min="0" max="100" step="5" value={Math.round(volume*100)} onChange={e=>setVolume(Number(e.target.value)/100)}/></label>
 </div>;
}
