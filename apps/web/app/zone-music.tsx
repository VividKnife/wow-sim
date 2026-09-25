'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Music2,Pause,Play,RotateCcw,Volume1,VolumeX} from 'lucide-react';
import styles from './zone-music.module.css';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {createZoneMusic,zoneMusicForLocation} from '@/lib/zone-music.js';

import {useAudioPreference} from '@/lib/use-audio-preference';
export default function ZoneMusic({location,dungeon=false,active=true,controls=true}:{location:{id:string;region:string};dungeon?:boolean;active?:boolean;controls?:boolean}){
 const player=useRef<ReturnType<typeof createZoneMusic>|null>(null);
 const [enabled,setEnabled]=useAudioPreference('musicEnabled'),[status,setStatus]=useState('ready');
 const [volume,setVolume]=useAudioPreference('musicVolume');
 const source=zoneMusicForLocation(location,dungeon);
 useEffect(()=>{
  const controller=createZoneMusic({onStatus:setStatus});player.current=controller;
  const unlock=()=>controller.retry();
  const visibility=()=>controller.setActive(document.visibilityState==='visible');
  visibility();
  document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);
  document.addEventListener('visibilitychange',visibility);
  return()=>{document.removeEventListener('pointerdown',unlock);document.removeEventListener('keydown',unlock);document.removeEventListener('visibilitychange',visibility);controller.dispose();player.current=null;};
 },[]);
 useEffect(()=>{player.current?.setSource(active?source:null);},[source,active]);
 useEffect(()=>{player.current?.setEnabled(enabled);},[enabled]);
 useEffect(()=>{player.current?.setVolume(volume);},[volume]);
 const toggle=()=>setEnabled(!enabled);
 const changeVolume=(percent:number)=>setVolume(percent/100);
 const percent=Math.round(volume*100);
 const needsRetry=enabled&&(status==='blocked'||status==='error');
 const audible=enabled&&status==='playing'&&percent>0;
 const region=dungeon?'死亡矿井':({ironforge:'铁炉堡',darnassus:'达纳苏斯',orgrimmar:'奥格瑞玛',undercity:'幽暗城',thunderbluff:'雷霆崖',moonglade:'月光林地',lakeshire:'赤脊山',thelsamar:'洛克莫丹',algaz:'洛克莫丹',silverstream:'洛克莫丹'} as Record<string,string>)[location.id]||(['北郡','艾尔文'].includes(location.region)?'艾尔文森林':location.region);
 const hint=!enabled?'已暂停':!source?'暂无区域音乐':status==='error'?'加载失败 · 点击重试':status==='blocked'?'点击播放':percent===0?'已静音':status==='playing'?'正在播放':status==='paused'?'已暂停':'准备播放';
 const action=needsRetry?'播放背景音乐':enabled?'暂停背景音乐':'播放背景音乐';
 if(!controls)return null;
 return <section className={styles.player} aria-label="区域音乐" data-playing={audible}>
  <div className={styles.mobileControl}><Popover><PopoverTrigger asChild><button type="button" className={styles.toggle} aria-label="音乐设置" title="音乐设置"><Music2 size={16}/></button></PopoverTrigger><PopoverContent side="top" align="end" className={styles.mobilePanel} aria-label="区域音乐设置"><strong>{region}</strong><p>{hint}</p><button type="button" onClick={needsRetry?()=>player.current?.retry():toggle}>{action}</button><label>音量 {percent}%<input type="range" min="0" max="100" step="1" value={percent} aria-label="背景音乐音量" aria-valuetext={`${percent}%`} onChange={event=>changeVolume(Number(event.target.value))}/></label></PopoverContent></Popover></div>
  <div className={styles.eyebrow}><Music2 size={12} aria-hidden="true"/><span>区域音乐</span><span className={styles.dot}/></div>
  <div className={styles.track}>
   <div className={styles.copy}><strong title={region}>{region}</strong><span className={styles.status} role="status">{hint}</span></div>
   <button type="button" className={styles.toggle} onClick={needsRetry?()=>player.current?.retry():toggle} aria-label={action} title={action}>
    {status==='error'&&enabled?<RotateCcw size={15}/>:enabled&&!needsRetry?<Pause size={15}/>:<Play size={15}/>}</button>
  </div>
  <div className={styles.volume}>
   {percent===0?<VolumeX size={14} aria-hidden="true"/>:<Volume1 size={14} aria-hidden="true"/>}
   <input className={styles.slider} style={{'--volume':`${percent}%`} as CSSProperties} type="range" min="0" max="100" step="1" value={percent} aria-label="背景音乐音量" aria-valuetext={`${percent}%`} onChange={event=>changeVolume(Number(event.target.value))}/>
   <span className={styles.value}>{percent}<small>%</small></span>
  </div>
 </section>;
}
