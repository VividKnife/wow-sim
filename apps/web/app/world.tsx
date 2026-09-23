"use client";
import QuestScenes from './quest-scenes';
import {useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,ItemDisplay} from './game-ui';
import LocalNpcs from './local-npcs';
import City from './city';
import WorldMap from './world-map';
import Escort from './escort';
import StockadesQuestEvent from './stockades-quest-event';
import {Gathering} from './professions';
import PlayerHud from './player-hud';
import WorldScene from './world-scene';
import CreaturePortrait from './creature-portrait';
import {MapPin,Map as MapIcon,ScrollText} from 'lucide-react';
import './journey.css';
type WorldProps=GameProps&{overview?:ReactNode;onOpenDungeon?:()=>void;onObserve?:()=>void;sceneActive?:boolean};
export default function World({state:s,data:d,busy,revision,send,overview,onOpenDungeon,onObserve,playback,contentVersion,simulationStatus,sceneActive=true}:WorldProps){
 const [filter,setFilter]=useState('全部'),[mapOpen,setMapOpen]=useState(false);
 const questList=d.quests.filter((q:any)=>q.active);
 const completedQuests=questList.filter((q:any)=>q.complete).length;
 const navigationLocked=busy||!!s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const navigate=async(id:number)=>{if(await send({type:'navigateQuest',id}))setMapOpen(true);};
 const navigationButton=(q:any)=>q.navigation?<Button variant="outline" disabled={navigationLocked||q.navigation.here} onClick={()=>navigate(q.id)}>{q.navigation.here?(q.navigation.kind==='turnin'?'已到交付地点':'已在任务区域'):(q.navigation.kind==='turnin'?'前往交付':'前往任务区域')} ↗</Button>:<span className="quest-navigation-note">暂无可导航地点，请查看任务说明</span>;
 if(s.dungeon)return <div className="world-main"><PlayerHud state={s} data={d}/>{overview}<section className="panel"><h2>{s.dungeon?'正在探索'+d.dungeon.name:d.dungeon.name}</h2><p>在地下城页面查看小队准备、路线进度与遭遇。</p><Button onClick={onOpenDungeon} disabled={!onOpenDungeon}>打开地下城 →</Button></section></div>;
 return <div className={'world-layout '+(d.city?'has-city':'')}><section className="world-main">
 <PlayerHud state={s} data={d}/>
 <WorldScene key={s.id} state={s} data={d} busy={busy} send={send} playback={playback} contentVersion={contentVersion} simulationStatus={simulationStatus} active={sceneActive} onObserve={onObserve}/>
 <header className="location-heading">
  <div className="location-identity"><MapPin size={23} aria-hidden="true"/><div><span>{d.location.region} · {d.city?'城镇':'野外'}</span><h1>{d.location.name}</h1></div></div>
  <div className="location-actions"><a href="#quest-list" className="quest-shortcut"><ScrollText size={16}/><span>任务 {questList.length}{completedQuests>0&&<b> · {completedQuests} 可交付</b>}</span></a><Button variant="outline" aria-expanded={mapOpen} aria-controls="region-map" onClick={()=>setMapOpen(!mapOpen)}><MapIcon size={16}/>{mapOpen?'收起地图':'区域地图'}</Button></div>
 </header>
 {overview}
 {mapOpen&&<div id="region-map"><WorldMap state={s} data={d} busy={busy} send={send}/></div>}
 {!d.city&&<nav className="filterbar local-filters" aria-label="附近活动">{['全部','人物与服务','怪物','任务物件'].map(f=><button type="button" key={f} aria-pressed={filter===f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</nav>}
 {(d.city||['全部','人物与服务'].includes(filter))&&<LocalNpcs key={'npcs:'+s.id+':'+s.location} state={s} data={d} busy={busy} send={send}/>}
 {d.city&&<City key={'city:'+s.id+':'+s.location} state={s} data={d} busy={busy} revision={revision} send={send}/>}

 <details className="panel travel-toolbox"><summary>旅行与野外技能 <small>护送 · 采集</small></summary><div className="travel-toolbox-content"><Escort state={s} data={d} busy={busy} send={send}/><Gathering state={s} data={d} busy={busy} send={send}/></div></details>
 {(d.location.kind==='dungeon')&&<section className="panel"><h2>{s.dungeon?'正在探索'+d.dungeon.name:d.dungeon.name}</h2><p>在地下城页面查看小队准备、路线进度与遭遇。</p><Button onClick={onOpenDungeon} disabled={!onOpenDungeon}>打开地下城 →</Button></section>}
 {(d.city||['全部','任务物件'].includes(filter))&&d.questTools?.length>0&&<section className="panel"><h2>任务物品</h2>{d.questTools.map((t:any)=><div className="item-row" key={t.id}><ItemDisplay className="grow" item={d.items[t.id]||t} details={t.place}/><Button variant="outline" disabled={busy||s.location===t.location&&!t.available} onClick={()=>send(s.location===t.location?{type:'useQuestItem',id:t.id}:{type:'travel',to:t.location})}>{s.location===t.location?t.label:'前往使用地点'}</Button></div>)}</section>}
 <QuestScenes state={s} data={d} busy={busy} send={send}/><StockadesQuestEvent state={s} data={d} busy={busy} send={send}/>
 <div className="interaction-grid">
 {(d.city||['全部','怪物'].includes(filter))&&d.monsters.map((m:any)=><button className={'interaction monster '+(m.min>s.level+2?'danger':'')} key={m.id} disabled={busy} onClick={()=>send({type:'hunt',id:m.id})}><CreaturePortrait unit={{entry:m.id}} className="monster-portrait"/><span className="mob-level">{m.min===m.max?m.min:`${m.min}—${m.max}`}{m.elite?' 精英':''}</span><strong>{m.name}</strong><small>开始自动狩猎 →</small></button>)}
 {(d.city||['全部','任务物件'].includes(filter))&&d.gatherables.map((o:any)=><button className="interaction" key={o.id} disabled={busy} onClick={()=>send({type:'gather',id:o.id})}><span className="quest-mark">◇</span><strong>{o.items[0]?.name||o.name}</strong><small>自动采集至任务完成</small></button>)}
 </div>
 <section id="quest-list" tabIndex={-1} className="panel quest-panel"><div className="section-heading"><div><h2>任务日志 <small>{Object.keys(s.quests).length} / 20</small></h2></div><small>接受与交付任务，请与对应人物交谈</small></div>
 {!questList.length&&<p className="empty">暂无任务。与附近带有 ! 标记的人物交谈可接取任务。</p>}
 {questList.map((q:any)=><details className="quest-entry" key={q.id}><summary><span className={'quest-mark '+(q.complete?'complete':'')}>{q.complete?'✓':'◇'}</span><strong>{q.name}</strong><small>Lv.{q.level} · {q.complete?'等待交付':'进行中'}</small></summary><p>{q.description}</p><div className="objective-list">{q.objectives.map((o:any,i:number)=><div key={i}><span className={o.count>=o.required?'done':''}>{o.name} <b>{o.count}/{o.required}</b></span><small>{o.locations.map((id:string)=>d.map.find((n:any)=>n.id===id)?.name).filter(Boolean).join('、')}</small></div>)}</div>{q.scenes?.map((scene:any)=><div className="action-row" key={scene.key}><Button variant="outline" disabled={busy||!scene.available} onClick={()=>send({type:'questScene',id:q.id,key:scene.key})}>{scene.name}</Button><small>{scene.adaptation} · {scene.duration/1000} 秒</small></div>)}<div className="action-row">{navigationButton(q)}<Button variant="ghost" disabled={busy} onClick={()=>send({type:'abandon',id:q.id})}>放弃任务</Button></div></details>)}
 </section></section></div>
}
