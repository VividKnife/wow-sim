'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {createLevelUpObserver,playLevelUpSound} from '@/lib/level-up.js';
import {useAudioPreference} from '@/lib/use-audio-preference';
import './level-up-notification.css';

export default function LevelUpNotification({state}:{state:{id:string;level:number}}){
 const [consume]=useState(()=>createLevelUpObserver(state));
 const [reward,setReward]=useState<{from:number;level:number}|null>(null);
 const voice=useRef<HTMLAudioElement|null>(null);
 const [enabled]=useAudioPreference('effectsEnabled');
 const [volume]=useAudioPreference('effectsVolume');
 useEffect(()=>{
  const next=consume(state);
  if(!next)return;
  // Consume each increase once, including Strict Mode effect replays.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setReward(next);
  voice.current?.pause();
  voice.current=playLevelUpSound();
 },[state,consume]);
 useEffect(()=>{
  if(!reward)return;
  const timer=setTimeout(()=>setReward(null),4400);
  return()=>clearTimeout(timer);
 },[reward]);
 useEffect(()=>{
  if(!enabled)voice.current?.pause();
  if(voice.current)voice.current.volume=Number(volume);
 },[enabled,volume]);
 useEffect(()=>()=>{voice.current?.pause();},[]);
 return <div className="level-up-notification" role="status" aria-live="polite" aria-atomic="true">
  {reward&&<div className="level-up-burst" key={reward.level}>
   <div className="level-up-magic" aria-hidden="true"><i className="level-up-column"/><i className="level-up-ring"/><i className="level-up-ring level-up-ring-second"/>{Array.from({length:16},(_,index)=><i className="level-up-mote" key={index} style={{'--x':`${(index*47)%100}%`,'--delay':`${index*.065}s`,'--drift':`${(index%2?1:-1)*(18+index*3)}px`} as CSSProperties}/>)}</div>
   <div className="level-up-title">等级提升</div><div className="level-up-rule" aria-hidden="true"/>
   <div className="level-up-level">你已经达到 <strong>{reward.level}</strong> 级！</div>
  </div>}
 </div>;
}
