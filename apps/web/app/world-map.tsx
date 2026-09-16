"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,duration} from './game-ui';
import {mapRegions,mapRegion,mapPoints,playerMapPoint} from '../lib/world-map.js';

export default function WorldMap({state:s,data:d,busy,send}:GameProps){
 const player=playerMapPoint(d.journey||{from:s.location,to:s.location,progress:0},d.map);
 const [selection,setSelection]=useState<{region:string;origin:string}|null>(null);
 const region=selection&&selection.origin===s.location?selection.region:player?.region||mapRegion(d.location.region);
 const config=mapRegions[region as keyof typeof mapRegions];
 const points=d.map.filter((n:any)=>mapRegion(n.region)===region);
 const moving=s.activity.type==='travel';
 const locked=busy||!!s.combat||s.hp<=0||!['idle','hunt'].includes(s.activity.type);
 const select=(region:string)=>setSelection({region,origin:s.location});
 const at=(id:string)=>mapPoints[id as keyof typeof mapPoints];
 const legs:any[]=[];let from=s.activity.from;
 for(const e of s.activity.path||[]){const to=e.a===from?e.b:e.a;legs.push([from,to]);from=to;}
 const travel=(id:string)=>send({type:'travel',to:id});
 return <section className="panel map-panel" aria-label="区域地图">
  <div className="map-toolbar"><div className="filterbar">{Object.entries(mapRegions).map(([id,r])=><button key={id} className={region===id?'active':''} aria-pressed={region===id} onClick={()=>select(id)}>{r.name}</button>)}</div><Button variant="outline" size="sm" onClick={()=>select(player?.region||mapRegion(d.location.region))}>定位玩家</Button></div>
  <div className="map-status" role="status"><strong>{moving?`${s.activity.flight?'飞行':'行进'}中 → ${d.map.find((n:any)=>n.id===s.activity.to)?.name}`:`当前位置：${d.location.name}`}</strong><span>{moving?`剩余 ${duration(s.activity.endsAt-s.clock)}`:'点击地图上的地点出发'}{player?.region!==region?' · 玩家在其他区域':''}{player?.crossing?' · 跨区途中':''}</span></div>
  <div className="region-map-scroll" tabIndex={0} aria-label="地点地图，窄屏可横向滚动"><div className={'region-map '+(!config.image?'schematic-map':'')}>
   {config.image?<img className="region-map-art" src={config.image} alt={config.name+'区域地图'}/>:<div className="courier-background"><strong>信使路线</strong><span>跨区域驿站示意图</span></div>}
   <svg className="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{legs.filter(([a,b])=>points.some((n:any)=>n.id===a)&&points.some((n:any)=>n.id===b)).map(([a,b],i)=><line key={i} x1={at(a)[0]} y1={at(a)[1]} x2={at(b)[0]} y2={at(b)[1]}/>)}</svg>
   {points.map((n:any,i:number)=>{const p=at(n.id),current=!moving&&n.id===s.location;if(!p)return null;const flight=n.hasFlight?` · 鸟点${n.flightUnlocked?'已解锁':'未发现'}`:'';return <button key={n.id} className={'map-pin '+(current?'is-current ':'')+(n.id===s.activity.to?'is-destination ':'')+(n.hasFlight?'has-flight ':'')} style={{left:p[0]+'%',top:p[1]+'%'}} disabled={locked||n.id===s.location||n.travel===null} onClick={()=>travel(n.id)} aria-label={`${n.name}${current?' · 当前位置':` · 前往 · ${n.travel===null?'需传送抵达':duration(n.travel)}`}${flight}`} title={`${n.name} · Lv.${n.min}—${n.max}${flight}`}><span className="map-pin-dot">{n.hasFlight?'↗':n.kind==='dungeon'?'⚔':i+1}</span><span className="map-pin-label">{n.name}{n.hasFlight&&<small className={n.flightUnlocked?'flight-discovered':''}>↗ {n.flightUnlocked?'鸟点已解锁':'鸟点未发现'}</small>}</span></button>;})}
   {player&&player.region===region&&<div className="map-player" style={{left:player.x+'%',top:player.y+'%'}} role="img" aria-label={moving?'玩家位置：旅行中':'玩家当前位置'}><span>▲</span><b>{moving?'行进中':'你在这里'}</b></div>}
  </div></div>
  <div className="map-legend"><span>▲ 玩家</span><span>数字 / ⚔ 地点</span><span>↗ 鸟点（标注解锁状态）</span><span>虚线：当前路线</span></div>
  <details className="map-location-list"><summary>地点列表 · {points.length} 个地点</summary><div className="location-grid">{points.map((n:any,i:number)=><button key={n.id} disabled={locked||n.id===s.location||n.travel===null} className={'location-node '+(n.id===s.location?'current':'')} onClick={()=>travel(n.id)}><strong>{i+1}. {n.name}</strong><small>{n.id===s.location?(moving?'出发地':'当前位置'):`Lv.${n.min}—${n.max} · ${n.travel===null?'需传送抵达':duration(n.travel)}`}</small>{n.hasFlight&&<small>↗ {n.flightUnlocked?'鸟点已解锁':'鸟点未发现'}</small>}</button>)}</div></details>
  <p className="footnote">地点按区域地图近似标注；移动沿现有道路计时。鸟点需到飞行管理员处发现。{region==='信使路线'?'信使路线为驿站示意，不代表地理比例。':''}</p>
 </section>;
}
