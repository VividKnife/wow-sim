"use client";
import {useEffect,useRef,useState} from 'react';
import {combatSoundForEvent,createCombatAudio} from '@/lib/combat-audio.js';
import {useAudioPreference} from '@/lib/use-audio-preference';
import type {BattleScene,BattleSkill} from '@/lib/battle-hd2d-types';

export function BattleAudio({scene,skills,active}:{scene:BattleScene;skills:BattleSkill[];active:boolean}){
 const [player]=useState(()=>createCombatAudio());
 const [enabled,setEnabled]=useAudioPreference('effectsEnabled'),[volume,setVolume]=useAudioPreference('effectsVolume');
 const heard=useRef(new Set<string|number>());
 useEffect(()=>{player.setEnabled(enabled);},[player,enabled]);
 useEffect(()=>{player.setVolume(volume);},[player,volume]);
 useEffect(()=>{const update=()=>player.setActive(active&&!!scene.live&&!document.hidden);update();document.addEventListener('visibilitychange',update);return()=>{document.removeEventListener('visibilitychange',update);player.setActive(false);};},[player,active,scene.live]);
 useEffect(()=>()=>player.dispose(),[player]);
 useEffect(()=>{heard.current.clear();},[scene.encounterId]);
 useEffect(()=>{
  const now=Date.now(),cues=new Set<string>();
  for(const event of scene.effects){
   if(heard.current.has(event.id))continue;
   heard.current.add(event.id);
   if(event.shownAt>now||now-event.shownAt>800)continue;
   const cue=combatSoundForEvent(event,skills.find(s=>s.spellId===event.spellId));
   if(cue&&!cues.has(cue)){player.play(cue);cues.add(cue);}
  }
  if(heard.current.size>500)heard.current=new Set(scene.effects.map(e=>e.id));
 },[scene.effects,skills,player]);
 return <div className="battle-audio-controls" role="group" aria-label="战斗音效">
  <button type="button" aria-pressed={enabled} onClick={()=>{player.setEnabled(!enabled);setEnabled(!enabled);if(!enabled)player.play('ui-click');}}>{enabled?'音效：开':'音效：关'}</button>
  <label>音量 <input type="range" aria-label="战斗音量" min="0" max="100" step="5" value={Math.round(volume*100)} onChange={e=>setVolume(Number(e.target.value)/100)}/></label>
 </div>;
}
