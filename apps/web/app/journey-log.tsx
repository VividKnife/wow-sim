"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {duration,type GameProps} from './game-ui';
import Battle from './battle';
import {journeyTime} from '@/lib/journey-time.js';

function EventTime({at,state}:{at:number;state:any}){
 const time=journeyTime(at,state);
 return <time dateTime={time.dateTime}>{time.label}</time>;
}

export default function JourneyLog({state:s,data:d,onObserve,...props}:GameProps&{onObserve:()=>void}){
 const [selected,setSelected]=useState<any>(null);
 const archive=selected&&selected.playerId===s.id?selected:null;
 const historicalState=archive?{...s,clock:archive.battle.endedAt,combat:null,lastCombat:archive.battle,logs:archive.logs,location:archive.location.id,dungeon:null}:null;
 return <section className="panel"><div className="section-heading"><h2>战斗与旅程记录</h2><small>击杀 {s.totals.kills} · 获得经验 {s.totals.xp}</small></div><p>记录核心旅程事件；最近 20 场战斗可查看结束时的战场与战报。</p><div className="combat-log">{[...(s.journey||[])].reverse().map((row:any)=>{
 const active=row.kind==='hunt'&&s.activity.type==='hunt'&&s.activity.journeySession===row.id;
 const live=s.combat&&row.battleIds?.includes(s.combat.id);
 const battles=(row.battleIds||[]).map((id:string)=>(s.battleHistory||[]).find((item:any)=>item.battle.id===id)).filter(Boolean).reverse();
 return <div key={row.id} className={'log-'+row.kind}><EventTime at={row.at} state={s}/><span>{row.text}{row.kind==='hunt'&&<> · {duration((active||live?s.clock:row.endedAt)-row.at)} · 击杀 {row.kills+(live?s.combat.enemies.filter((enemy:any)=>enemy.dead&&!enemy.summonedBy).length:0)}{active||live?' · 进行中':''}</>}{live&&<Button variant="link" onClick={onObserve}>查看当前战斗</Button>}{battles.length===1&&<Button variant="link" onClick={()=>setSelected({...battles[0],playerId:s.id})}>查看战斗</Button>}{battles.length>1&&<details><summary>查看战斗（{battles.length} 场）</summary>{battles.map((item:any)=><Button variant="link" key={item.battle.id} onClick={()=>setSelected({...item,playerId:s.id})}><EventTime at={item.battle.startedAt} state={s}/> · {duration(item.battle.endedAt-item.battle.startedAt)} · 查看战斗</Button>)}</details>}{row.battleIds?.length>0&&!battles.length&&!live&&<small> · 详情已过保留范围</small>}</span></div>;
 })}{!s.journey?.length&&<p>开始冒险后，旅行、任务与战斗会记录在这里。</p>}</div>{archive&&<Battle key={archive.battle.id} {...props} state={historicalState} data={{...d,location:archive.location,battleView:archive.view}} historical open onOpenChange={open=>{if(!open)setSelected(null);}}/>}</section>;
}
