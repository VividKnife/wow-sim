"use client";
import {useEffect,useState} from 'react';
import {Footprints,Navigation} from 'lucide-react';
import {duration,Icon} from './game-ui';
import './activity-progress.css';

type Skill={spellId:number;name:string;cast?:number;icon?:string};
type ProgressState={clock:number;activity:{type:string;startedAt?:number;endsAt?:number;spell?:number;mount?:number;from?:string;to?:string;flight?:boolean;target?:string|number|null;auto?:boolean};cast?:{startedAt:number;until:number;spell:number}|null;combat?:unknown;rest?:{startedAt?:number;until:number;foodUntil:number;waterUntil:number}|null;presence?:{paused?:boolean}};
type ProgressData={map?:{id:string;name:string}[];skills?:Skill[];combatSkills?:Skill[];hearthstone?:{destinationName:string|number};mounts?:{collection:{id:number;name:string}[]};itemBuffs?:{spell:number;name:string;icon?:string;until:number}[]};

function Progress({label,start,end,clock,running,journey,quartz,icon,channel}:{label:string;start:number;end:number;clock:number;running:boolean;quartz?:boolean;icon?:string;channel?:boolean;journey?:{from:string;to:string;flight:boolean}}){
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{
  if(!running)return;
  const began=performance.now();
  const timer=setInterval(()=>setElapsed(performance.now()-began),50);
  return()=>clearInterval(timer);
 },[running]);
 const total=Math.max(1,end-start),current=Math.min(total,Math.max(0,clock-start+(running?elapsed:0))),percent=current/total*100;
 if(journey){const TravelIcon=journey.flight?Navigation:Footprints;return <section className="travel-progress" aria-label="旅途进度">
  <div className="travel-progress-heading"><span><TravelIcon size={18} aria-hidden="true"/>{journey.flight?'飞行中':'行进中'}</span><strong>{percent>=100?'等待抵达确认':`还有 ${duration(total-current)}`}<small>{Math.floor(percent)}%</small></strong></div>
  <div className="travel-progress-route"><span>{journey.from}</span><span>{journey.to}</span></div>
  <div className="travel-progress-track" role="progressbar" aria-label={`${journey.from}至${journey.to}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(percent)} aria-valuetext={`${Math.floor(percent)}%，${percent>=100?'等待抵达确认':`剩余${duration(total-current)}`}`}>
   <div className="travel-progress-distance" style={{width:`${percent}%`}}/>
   <span className="travel-progress-marker" style={{left:`${percent}%`}} aria-hidden="true"><TravelIcon size={16}/></span>
  </div>
 </section>;}
 if(quartz){
  const fill=channel?100-percent:percent,remaining=((total-current)/1000).toFixed(1);
  return <div className={`quartz-castbar ${channel?'is-channel':''} ${percent>=100?'is-pending':''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${label}，${channel?'引导':'施法'}，剩余 ${remaining} 秒`}>
   <div className="quartz-cast-icon"><Icon src={icon} name={label} size={28}/></div>
   <div className="quartz-cast-track"><div className="quartz-cast-fill" style={{width:`${fill}%`}}/><i className="quartz-cast-spark" style={{left:`${fill}%`}} aria-hidden="true"/>
    <span className="quartz-cast-name">{label}</span><b className="quartz-cast-time">{percent>=100?'等待完成':`${remaining} / ${(total/1000).toFixed(1)}`}</b>
   </div>
  </div>;
 }
 return <div className="activity-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${label}，${Math.round(percent)}%`}>
  <div className="activity-progress-fill" style={{width:`${percent}%`}}/>
  <span>{label}</span><b>{percent>=100?'等待完成':`${((total-current)/1000).toFixed(1)} 秒 · ${Math.floor(percent)}%`}</b>
 </div>;
}

export default function ActivityProgress({state:s,data:d,running=true,hideTravel=false,quartz=false}:{state:ProgressState;data:ProgressData;running?:boolean;hideTravel?:boolean;quartz?:boolean}){
 const a=s.activity,cast=s.cast;
 let start=a.startedAt,end=a.endsAt,label=a.spell?d.skills?.find(skill=>skill.spellId===a.spell)?.name:undefined;
 if(a.type==='travel')label=a.flight?'飞行中':'行进中';
 else if(a.type==='revive')label='跑尸中 · 返回尸体';
 else if(a.type==='conjure'){label=label||'制造补给';start??=(end||0)-(d.skills?.find(skill=>skill.spellId===a.spell)?.cast||3000);}
 else if(a.type==='hearth'){label=`炉石 · 返回${d.hearthstone?.destinationName||''}`;start??=(end||0)-10000;}
 else if(['classSpell','classChannel'].includes(a.type))label=label||'职业技能';
 else if(a.type==='teleport')label=label||'传送术';
 else if(a.type==='mount')label=`召唤${d.mounts?.collection.find(m=>m.id===a.mount)?.name||'坐骑'}`;
 else if(a.type==='gather')label=a.target==null?'等待采集目标刷新':'采集中';
 else if(a.type==='professionGather')label=a.auto?'自动采集中':'采集中';
 else if(s.combat&&cast){start=cast.startedAt;end=cast.until;label=d.combatSkills?.find(skill=>skill.spellId===cast.spell)?.name||'施法';}
 else if(!s.combat&&s.rest){start=s.rest.startedAt;end=s.rest.until;label=s.rest.foodUntil>s.clock&&s.rest.waterUntil>s.clock?'进食与饮水':s.rest.foodUntil>s.clock?'进食':'饮水';}
 else if(!['resurrect','questItem'].includes(a.type))end=undefined;
 const spellId=s.combat&&cast?cast.spell:a.spell;
 const spellIcon=[...(d.skills||[]),...(d.combatSkills||[])].find(skill=>skill.spellId===spellId)?.icon;
 const castIcon=a.type==='hearth'?'/icons/assets/inv_misc_rune_01.png':spellIcon||(a.type==='mount'?'/icons/assets/ability_mount_ridinghorse.png':undefined);
 const journey=a.type==='travel'?{from:d.map?.find(n=>n.id===a.from)?.name||a.from||'出发地',to:d.map?.find(n=>n.id===a.to)?.name||a.to||'目的地',flight:!!a.flight}:undefined;
 return <>{!(hideTravel&&a.type==='travel')&&start!==undefined&&end!==undefined&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&<Progress key={`${s.clock}:${start}:${end}:${running}`} label={label||'施法'} start={start} end={end} clock={s.clock} running={running&&!s.presence?.paused} journey={journey} quartz={quartz} icon={castIcon} channel={a.type==='classChannel'}/>}</>;
}
