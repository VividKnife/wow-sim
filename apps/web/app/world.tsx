"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon} from './game-ui';
import Dungeon from './dungeon';
import LocalNpcs from './local-npcs';
import City from './city';
import WorldMap from './world-map';
import Hearthstone from './hearthstone';
import Mounts from './mounts';
import Escort from './escort';
import {Gathering} from './professions';
export default function World({state:s,data:d,busy,revision,send}:GameProps){
 const [filter,setFilter]=useState('全部'),[mapOpen,setMapOpen]=useState(false);
 const questList=d.quests.filter((q:any)=>q.active);
 const navigationLocked=busy||!!s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const navigate=async(id:number)=>{if(await send({type:'navigateQuest',id}))setMapOpen(true);};
 const navigationButton=(q:any)=>q.navigation?<Button variant="outline" disabled={navigationLocked||q.navigation.here} onClick={()=>navigate(q.id)}>{q.navigation.here?(q.navigation.kind==='turnin'?'已到交付地点':'已在任务区域'):(q.navigation.kind==='turnin'?'前往交付':'前往任务区域')} ↗</Button>:<span className="quest-navigation-note">暂无可导航地点，请查看任务说明</span>;
 if(s.dungeon)return <div className="world-main"><Hearthstone state={s} data={d} busy={busy} send={send}/><Dungeon state={s} data={d} busy={busy} send={send}/></div>;
 return <div className={'world-layout '+(d.city?'has-city':' ')}><section className="world-main">{d.city&&<City key={s.id+':'+s.location} state={s} data={d} busy={busy} revision={revision} send={send}/>}<div className="section-heading"><div><div className="eyebrow">{d.location.region} / 等级 {d.location.min}—{d.location.max}</div><h1>{d.location.name}</h1></div><Button variant="outline" onClick={()=>setMapOpen(!mapOpen)}>{mapOpen?'收起地图':'打开区域地图'} ↗</Button></div>
 <details className="panel travel-toolbox"><summary>旅行与野外技能 <small>炉石 · 坐骑 · 护送 · 采集</small></summary><div className="travel-toolbox-content"><Hearthstone state={s} data={d} busy={busy} send={send}/><Mounts state={s} data={d} busy={busy} send={send}/><Escort state={s} data={d} busy={busy} send={send}/><Gathering state={s} data={d} busy={busy} send={send}/></div></details>
 {mapOpen&&<WorldMap state={s} data={d} busy={busy} send={send}/>}
 {(s.location==='deadmines'||d.location.region==='西部荒野')&&<Dungeon state={s} data={d} busy={busy} send={send}/>}
 {!d.city&&<div className="filterbar local-filters">{['全部','人物与服务','怪物','任务物件'].map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</div>}
 {(d.city||['全部','任务物件'].includes(filter))&&d.questTools?.length>0&&<section className="panel"><h2>任务物品</h2>{d.questTools.map((t:any)=><div className="item-row" key={t.id}><Icon src={t.icon} name={t.name}/><div className="grow"><strong>{t.name}</strong><small>{t.place}</small></div><Button variant="outline" disabled={busy||s.location===t.location&&!t.available} onClick={()=>send(s.location===t.location?{type:'useQuestItem',id:t.id}:{type:'travel',to:t.location})}>{s.location===t.location?t.label:'前往使用地点'}</Button></div>)}</section>}
 {(d.city||['全部','人物与服务'].includes(filter))&&<LocalNpcs key={s.id+':'+s.location} state={s} data={d} busy={busy} send={send}/>}
 {!d.city&&d.hasFlight&&<Button variant="outline" disabled={busy||s.flightPoints.includes(s.location)} onClick={()=>send({type:'unlockFlight'})}>{s.flightPoints.includes(s.location)?'飞行点已发现':'与飞行管理员交谈 · 发现飞行点'}</Button>}
 <div className="interaction-grid">
 {(d.city||['全部','怪物'].includes(filter))&&d.monsters.map((m:any)=><button className={'interaction monster '+(m.min>s.level+2?'danger':'')} key={m.id} disabled={busy} onClick={()=>send({type:'hunt',id:m.id})}><span className="mob-level">{m.min===m.max?m.min:`${m.min}—${m.max}`}{m.elite?' 精英':''}</span><strong>{m.name}</strong><small>开始自动狩猎 →</small></button>)}
 {(d.city||['全部','任务物件'].includes(filter))&&d.gatherables.map((o:any)=><button className="interaction" key={o.id} disabled={busy} onClick={()=>send({type:'gather',id:o.id})}><span className="quest-mark">◇</span><strong>{o.items[0]?.name||o.name}</strong><small>调查 / 采集 · 5 秒</small></button>)}
 </div>
 {!d.city&&d.hasFlight&&s.flightPoints.includes(s.location)&&s.flightPoints.filter((n:string)=>n!==s.location).map((n:string)=><Button key={n} variant="outline" onClick={()=>send({type:'fly',to:n})}>飞往 {d.map.find((x:any)=>x.id===n)?.name}</Button>)}
 <section id="quest-list" className="panel quest-panel"><div className="section-heading"><div><div className="eyebrow">冒险手册</div><h2>任务日志 <small>{Object.keys(s.quests).length} / 20</small></h2></div><small>接受与交付任务，请与对应人物交谈</small></div>
 {!questList.length&&<p className="empty">还没有正在进行的任务。点击附近带有 ! 标记的人物，开始一段冒险。</p>}
 {questList.map((q:any)=><details className="quest-entry" key={q.id}><summary><span className={'quest-mark '+(q.complete?'complete':'')}>{q.complete?'✓':'◇'}</span><strong>{q.name}</strong><small>Lv.{q.level} · {q.complete?'等待交付':'进行中'}</small></summary><p>{q.description}</p><div className="objective-list">{q.objectives.map((o:any,i:number)=><div key={i}><span className={o.count>=o.required?'done':''}>{o.name} <b>{o.count}/{o.required}</b></span><small>{o.locations.map((id:string)=>d.map.find((n:any)=>n.id===id)?.name).filter(Boolean).join('、')}</small></div>)}</div><div className="action-row">{navigationButton(q)}<Button variant="ghost" disabled={busy} onClick={()=>send({type:'abandon',id:q.id})}>放弃任务</Button></div></details>)}
 </section></section></div>
}
