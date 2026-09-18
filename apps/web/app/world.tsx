"use client";
import {useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon} from './game-ui';
import LocalNpcs from './local-npcs';
import City from './city';
import WorldMap from './world-map';
import Escort from './escort';
import {Gathering} from './professions';
import PlayerHud from './player-hud';
import CreaturePortrait from './creature-portrait';
type WorldProps=GameProps&{overview?:ReactNode;onOpenDungeon?:()=>void};
export default function World({state:s,data:d,busy,revision,send,overview,onOpenDungeon}:WorldProps){
 const [filter,setFilter]=useState('全部'),[mapOpen,setMapOpen]=useState(false);
 const questList=d.quests.filter((q:any)=>q.active);
 const navigationLocked=busy||!!s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const navigate=async(id:number)=>{if(await send({type:'navigateQuest',id}))setMapOpen(true);};
 const navigationButton=(q:any)=>q.navigation?<Button variant="outline" disabled={navigationLocked||q.navigation.here} onClick={()=>navigate(q.id)}>{q.navigation.here?(q.navigation.kind==='turnin'?'已到交付地点':'已在任务区域'):(q.navigation.kind==='turnin'?'前往交付':'前往任务区域')} ↗</Button>:<span className="quest-navigation-note">暂无可导航地点，请查看任务说明</span>;
 if(s.dungeon)return <div className="world-main"><PlayerHud state={s} data={d}/>{overview}<section className="panel"><h2>{s.dungeon?'正在探索死亡矿井':'死亡矿井'}</h2><p>在地下城页面查看小队准备、路线进度与遭遇。</p><Button onClick={onOpenDungeon} disabled={!onOpenDungeon}>打开地下城 →</Button></section></div>;
 return <div className={'world-layout '+(d.city?'has-city':' ')}><section className="world-main"><h1 className="journey-title">继续你的旅程</h1><PlayerHud state={s} data={d}/><section className="journey-hero" aria-labelledby="journey-location-title"><div className="journey-hero-art" aria-hidden="true"><span className="journey-sun"/><span className="journey-mountains far"/><span className="journey-mountains near"/><span className="journey-tower"><i/></span><span className="journey-road"/></div><div className="journey-hero-top"><span>{d.location.region} · {d.location.name}</span><span>{d.city?'城镇区域':'野外活动'}</span></div><div className="journey-hero-copy"><div className="eyebrow">THE ROAD AHEAD</div><h2 id="journey-location-title">风吹过{d.location.name}</h2><p>{d.location.region}之外，是通往下一段旅程的路。</p><Button variant="outline" onClick={()=>setMapOpen(!mapOpen)}>{mapOpen?'收起区域地图':'打开区域地图'}　→</Button></div></section>{mapOpen&&<WorldMap state={s} data={d} busy={busy} send={send}/>} {overview}{(d.city||['全部','人物与服务'].includes(filter))&&<LocalNpcs key={s.id+':'+s.location} state={s} data={d} busy={busy} send={send}/>} {d.city&&<City key={s.id+':'+s.location} state={s} data={d} busy={busy} revision={revision} send={send}/>}
 <details className="panel travel-toolbox"><summary>旅行与野外技能 <small>护送 · 采集</small></summary><div className="travel-toolbox-content"><Escort state={s} data={d} busy={busy} send={send}/><Gathering state={s} data={d} busy={busy} send={send}/></div></details>
 {(s.location==='deadmines'||d.location.region==='西部荒野')&&<section className="panel"><h2>{s.dungeon?'正在探索死亡矿井':'死亡矿井'}</h2><p>在地下城页面查看小队准备、路线进度与遭遇。</p><Button onClick={onOpenDungeon} disabled={!onOpenDungeon}>打开地下城 →</Button></section>}
 {!d.city&&<div className="filterbar local-filters">{['全部','人物与服务','怪物','任务物件'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</div>}
 {(d.city||['全部','任务物件'].includes(filter))&&d.questTools?.length>0&&<section className="panel"><h2>任务物品</h2>{d.questTools.map((t:any)=><div className="item-row" key={t.id}><Icon src={t.icon} name={t.name}/><div className="grow"><strong>{t.name}</strong><small>{t.place}</small></div><Button variant="outline" disabled={busy||s.location===t.location&&!t.available} onClick={()=>send(s.location===t.location?{type:'useQuestItem',id:t.id}:{type:'travel',to:t.location})}>{s.location===t.location?t.label:'前往使用地点'}</Button></div>)}</section>}
 <div className="interaction-grid">
 {(d.city||['全部','怪物'].includes(filter))&&d.monsters.map((m:any)=><button className={'interaction monster '+(m.min>s.level+2?'danger':'')} key={m.id} disabled={busy} onClick={()=>send({type:'hunt',id:m.id})}><CreaturePortrait unit={{entry:m.id}} className="monster-portrait"/><span className="mob-level">{m.min===m.max?m.min:`${m.min}—${m.max}`}{m.elite?' 精英':''}</span><strong>{m.name}</strong><small>开始自动狩猎 →</small></button>)}
 {(d.city||['全部','任务物件'].includes(filter))&&d.gatherables.map((o:any)=><button className="interaction" key={o.id} disabled={busy} onClick={()=>send({type:'gather',id:o.id})}><span className="quest-mark">◇</span><strong>{o.items[0]?.name||o.name}</strong><small>调查 / 采集 · 5 秒</small></button>)}
 </div>
 <section id="quest-list" className="panel quest-panel"><div className="section-heading"><div><div className="eyebrow">冒险手册</div><h2>任务日志 <small>{Object.keys(s.quests).length} / 20</small></h2></div><small>接受与交付任务，请与对应人物交谈</small></div>
 {!questList.length&&<p className="empty">还没有正在进行的任务。点击附近带有 ! 标记的人物，开始一段冒险。</p>}
 {questList.map((q:any)=><details className="quest-entry" key={q.id}><summary><span className={'quest-mark '+(q.complete?'complete':'')}>{q.complete?'✓':'◇'}</span><strong>{q.name}</strong><small>Lv.{q.level} · {q.complete?'等待交付':'进行中'}</small></summary><p>{q.description}</p><div className="objective-list">{q.objectives.map((o:any,i:number)=><div key={i}><span className={o.count>=o.required?'done':''}>{o.name} <b>{o.count}/{o.required}</b></span><small>{o.locations.map((id:string)=>d.map.find((n:any)=>n.id===id)?.name).filter(Boolean).join('、')}</small></div>)}</div><div className="action-row">{navigationButton(q)}<Button variant="ghost" disabled={busy} onClick={()=>send({type:'abandon',id:q.id})}>放弃任务</Button></div></details>)}
 </section></section></div>
}
