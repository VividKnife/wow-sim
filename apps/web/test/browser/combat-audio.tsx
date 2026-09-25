import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {combatSoundForEvent,createCombatAudio} from '../../lib/combat-audio.js';
import '../../app/globals.css';

function Harness(){
 const host=useRef<HTMLDivElement>(null),[status,setStatus]=useState('音效未开启'),[active,setActive]=useState(0);
 const [player]=useState(()=>createCombatAudio({createAudio:src=>{
  const audio=new Audio(src);audio.controls=true;
  audio.addEventListener('playing',()=>setStatus(`正在播放：${src}`));
  audio.addEventListener('error',()=>setStatus(`加载失败：${src}`));
  host.current?.appendChild(audio);return audio;
 }}));
 useEffect(()=>{const update=()=>player.setActive(!document.hidden);update();document.addEventListener('visibilitychange',update);const timer=setInterval(()=>setActive(player.activeCount),100);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);player.dispose();};},[player]);
 const sample=(kind:string,school?:number,nameEn?:string)=>player.play(combatSoundForEvent({kind,school,spellId:nameEn?1:undefined},{nameEn,school}));
 return <main className="game-shell"><section className="panel"><h1>战斗音效 · 独立验证</h1><p>使用实际音频文件与生产播放控制器，不访问角色存档。</p><div className="action-row"><button onClick={()=>{player.setEnabled(true);player.play('ui-click');}}>开启音效</button><button onClick={()=>{player.setEnabled(false);setStatus('已静音');}}>关闭音效</button><button onClick={()=>sample('damage')}>近战挥击</button><button onClick={()=>sample('heal',1,'Lesser Heal')}>次级治疗术</button><button onClick={()=>sample('damage',2,'Fireball')}>火球命中</button><button onClick={()=>sample('damage',4,'Frostbolt')}>寒冰命中</button><button onClick={()=>sample('damage',5,'Shadow Bolt')}>暗影箭命中</button><button onClick={()=>sample('damage',6,'Arcane Missiles')}>奥术飞弹命中</button><button onClick={()=>{for(const cue of ['melee-swing','heal-impact','fire-impact','frost-impact','shadow-impact','arcane-impact'])player.play(cue);}}>六种声音同时触发</button></div><p role="status">{status}</p><p>播放中的声音：{active} / 4</p><div ref={host} aria-label="已触发音频"/></section></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
