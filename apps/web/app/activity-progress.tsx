"use client";
import {useEffect,useState} from 'react';
import {duration,Icon} from './game-ui';
import './activity-progress.css';

type Skill={spellId:number;name:string;cast?:number};
type ProgressState={clock:number;activity:{type:string;startedAt?:number;endsAt?:number;spell?:number;mount?:number};cast?:{startedAt:number;until:number;spell:number}|null;combat?:unknown;rest?:{startedAt?:number;until:number;foodUntil:number;waterUntil:number}|null;presence?:{paused?:boolean}};
type ProgressData={skills?:Skill[];combatSkills?:Skill[];hearthstone?:{destinationName:string|number};mounts?:{collection:{id:number;name:string}[]};itemBuffs?:{spell:number;name:string;icon?:string;until:number}[]};

function Progress({label,start,end,clock,running}:{label:string;start:number;end:number;clock:number;running:boolean}){
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{
  if(!running)return;
  const began=performance.now();
  const timer=setInterval(()=>setElapsed(performance.now()-began),50);
  return()=>clearInterval(timer);
 },[running]);
 const total=Math.max(1,end-start),current=Math.min(total,Math.max(0,clock-start+(running?elapsed:0))),percent=current/total*100;
 return <div className="activity-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${label}，${Math.round(percent)}%`}>
  <div className="activity-progress-fill" style={{width:`${percent}%`}}/>
  <span>{label}</span><b>{percent>=100?'等待完成':`${((total-current)/1000).toFixed(1)} 秒 · ${Math.floor(percent)}%`}</b>
 </div>;
}

export default function ActivityProgress({state:s,data:d,running=true}:{state:ProgressState;data:ProgressData;running?:boolean}){
 const a=s.activity,cast=s.cast;
 let start=a.startedAt,end=a.endsAt,label=a.spell?d.skills?.find(skill=>skill.spellId===a.spell)?.name:undefined;
 if(a.type==='conjure'){label=label||'制造补给';start??=(end||0)-(d.skills?.find(skill=>skill.spellId===a.spell)?.cast||3000);}
 else if(a.type==='hearth'){label=`炉石 · 返回${d.hearthstone?.destinationName||''}`;start??=(end||0)-10000;}
 else if(['classSpell','classChannel'].includes(a.type))label=label||'职业技能';
 else if(a.type==='teleport')label=label||'传送术';
 else if(a.type==='mount')label=`召唤${d.mounts?.collection.find(m=>m.id===a.mount)?.name||'坐骑'}`;
 else if(s.combat&&cast){start=cast.startedAt;end=cast.until;label=d.combatSkills?.find(skill=>skill.spellId===cast.spell)?.name||'施法';}
 else if(!s.combat&&s.rest){start=s.rest.startedAt;end=s.rest.until;label=s.rest.foodUntil>s.clock&&s.rest.waterUntil>s.clock?'进食与饮水':s.rest.foodUntil>s.clock?'进食':'饮水';}
 else if(!['resurrect','questItem'].includes(a.type))end=undefined;
 return <>{start!==undefined&&end!==undefined&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&<Progress key={`${s.clock}:${start}:${end}:${running}`} label={label||'施法'} start={start} end={end} clock={s.clock} running={running&&!s.presence?.paused}/>} {!!d.itemBuffs?.length&&<div className="utility-buffs" aria-label="物品增益">{d.itemBuffs.map(buff=><span key={buff.spell}><Icon src={buff.icon} name={buff.name} size={24}/>{buff.name}<small>{duration(buff.until-s.clock)}</small></span>)}</div>}</>;
}
