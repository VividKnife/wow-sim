"use client";
import {useEffect,useState} from 'react';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {Button} from '@/components/ui/button';
import {GameProps,duration} from './game-ui';
import MapTraveler,{MapTravelerMode} from './map-traveler';
import {mapRegions,mapRegion,mapPoints,playerMapPoint,travelMapFrame} from '../lib/world-map.js';

function useTravelElapsed(clock:number,startedAt:number|undefined,endsAt:number|undefined,moving:boolean){
 const [sample,setSample]=useState({clock,startedAt,endsAt,elapsed:0});
 useEffect(()=>{
  if(!moving)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0;const origin=performance.now();
  const draw=(now:number)=>{
   if(document.visibilityState!=='visible')return;
   const elapsed=motion.matches?0:Math.max(0,now-origin);
   setSample({clock,startedAt,endsAt,elapsed});
   if(!motion.matches&&clock+elapsed<(endsAt??clock))frame=requestAnimationFrame(draw);
  };
  const resume=()=>{cancelAnimationFrame(frame);if(document.visibilityState==='visible')frame=requestAnimationFrame(draw);};
  frame=requestAnimationFrame(draw);
  document.addEventListener('visibilitychange',resume);motion.addEventListener('change',resume);
  return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',resume);motion.removeEventListener('change',resume);};
 },[clock,startedAt,endsAt,moving]);
 return moving&&sample.clock===clock&&sample.startedAt===startedAt&&sample.endsAt===endsAt?sample.elapsed:0;
}

export default function WorldMap({state:s,data:d,busy,send}:GameProps){
 const moving=s.activity.type==='travel';
 const elapsed=useTravelElapsed(s.clock,s.activity.startedAt,s.activity.endsAt,moving);
 const frame=travelMapFrame(s,elapsed),player=playerMapPoint(frame.journey,d.map);
 const playerMode:MapTravelerMode=moving?(s.activity.flight?'flying':d.mounts?.active?'riding':'walking'):(d.mounts?.active?'riding':'idle');
 const [selection,setSelection]=useState<{region:string;origin:string}|null>(null);
 const region=selection&&selection.origin===s.location?selection.region:mapRegion(d.location.region);
 const config=mapRegions[region as keyof typeof mapRegions];
 const points=d.map.filter((n:any)=>mapRegion(n.region)===region);
 const locked=busy||!!s.combat||s.hp<=0||!(['idle','hunt'].includes(s.activity.type)||moving&&!s.activity.flight);
 const select=(region:string)=>setSelection({region,origin:s.location});
 const at=(id:string)=>mapPoints[id as keyof typeof mapPoints];
 const legs:{from:string;to:string;progress:number;startProgress:number}[]=frame.legs.filter((leg:{from:string;to:string})=>at(leg.from)&&at(leg.to)&&points.some((n:any)=>n.id===leg.from)&&points.some((n:any)=>n.id===leg.to));
 const routeLegs=frame.legs as {from:string;to:string;progress:number;startProgress:number}[];
 const nextLeg=routeLegs.findIndex(leg=>leg.progress<1);
 const waypointIds=routeLegs.length?[routeLegs[0].from,...routeLegs.map(leg=>leg.to)]:[];
 const travel=(id:string)=>send({type:'travel',to:id});
 return <section className="panel map-panel" aria-label="区域地图">
  <div className="map-toolbar"><GameSelect aria-label="选择区域" value={region} onValueChange={select}>{Object.entries(mapRegions).map(([id,r])=><GameSelectOption key={id} value={id}>{r.name}</GameSelectOption>)}</GameSelect><Button variant="outline" size="sm" onClick={()=>select(player?.region||mapRegion(d.location.region))}>定位玩家</Button></div>
  <div className="map-status" role="status"><strong>{moving?`${s.activity.flight?'飞行':'行进'}中 → ${d.map.find((n:any)=>n.id===s.activity.to)?.name}`:`当前位置：${d.location.name}`}</strong><span>{moving?(frame.remaining>0?`剩余 ${duration(frame.remaining)}`:'等待抵达确认'):'点击地图上的地点出发'}{player?.region!==region?' · 玩家在其他区域':''}{player?.crossing?' · 跨区途中':''}</span></div>
  {moving&&waypointIds.length>0&&<ol className="map-waypoints" aria-label="沿途路点">{waypointIds.map((id,index)=>{const passed=index===0||routeLegs[index-1].progress>=1,next=index===nextLeg+1&&nextLeg>=0;return <li key={`${index}:${id}`} className={next?'is-next':passed?'is-passed':''} aria-current={next?'step':undefined}><span aria-hidden="true">{passed?'✓':index}</span><b>{index===0&&routeLegs[0].startProgress>0?'改道位置':d.map.find((n:any)=>n.id===id)?.name||id}</b>{next&&<small>下一站</small>}</li>;})}</ol>}
  <div className="region-map-scroll" tabIndex={0} aria-label="地点地图，窄屏可横向滚动"><div className={'region-map '+(!config.image?'schematic-map':'')}>
   {config.image?<img className="region-map-art" src={config.image} alt={config.name+'区域地图'}/>:<div className="courier-background"><strong>{region}</strong><span>区域地点与交通示意</span></div>}
   <svg className="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{legs.map((leg,i)=>{const a=at(leg.from),b=at(leg.to);return <g key={i}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>{leg.progress>0&&<line className="map-route-completed" x1={a[0]+(b[0]-a[0])*leg.startProgress} y1={a[1]+(b[1]-a[1])*leg.startProgress} x2={a[0]+(b[0]-a[0])*leg.progress} y2={a[1]+(b[1]-a[1])*leg.progress}/>}</g>;})}</svg>
   {points.map((n:any,i:number)=>{const p=at(n.id),current=!moving&&n.id===s.location;if(!p)return null;const flight=n.hasFlight?` · 鸟点${n.flightUnlocked?'已解锁':'未发现'}`:'';return <button key={n.id} className={'map-pin '+(current?'is-current ':'')+(n.id===s.activity.to?'is-destination ':'')+(n.hasFlight?'has-flight ':'')} style={{left:p[0]+'%',top:p[1]+'%'}} disabled={locked||(moving?n.id===s.activity.to:n.id===s.location)||n.travel===null} onClick={()=>travel(n.id)} aria-label={`${n.name}${current?' · 当前位置':` · ${moving?'改道前往':'前往'} · ${n.travel===null?'需传送抵达':duration(n.travel)}`}${flight}`} title={`${n.name} · Lv.${n.min}—${n.max}${flight}`}><span className="map-pin-dot">{n.hasFlight?'↗':n.kind==='dungeon'?'⚔':i+1}</span><span className="map-pin-label">{n.name}{n.hasFlight&&<small className={n.flightUnlocked?'flight-discovered':''}>↗ {n.flightUnlocked?'鸟点已解锁':'鸟点未发现'}</small>}</span></button>;})}
   {player&&player.region===region&&<span key={region} className={'map-player-position'+(moving?' is-moving':'')} style={{left:player.x+'%',top:player.y+'%'}}><MapTraveler mode={playerMode}/></span>}
  </div></div>
  <div className="map-legend"><span>角色：玩家位置与出行方式</span><span>数字 / ⚔ 地点</span><span>↗ 鸟点（标注解锁状态）</span><span>虚线：待行进 · 蓝线：已走过</span></div>
  <details className="map-location-list"><summary>地点列表 · {points.length} 个地点</summary><div className="location-grid">{points.map((n:any,i:number)=><button key={n.id} disabled={locked||(moving?n.id===s.activity.to:n.id===s.location)||n.travel===null} className={'location-node '+(n.id===s.location?'current':'')} onClick={()=>travel(n.id)}><strong>{i+1}. {n.name}</strong><small>{!moving&&n.id===s.location?'当前位置':`Lv.${n.min}—${n.max} · ${n.travel===null?'需传送抵达':duration(n.travel)}`}</small>{n.hasFlight&&<small>↗ {n.flightUnlocked?'鸟点已解锁':'鸟点未发现'}</small>}</button>)}</div></details>
  <p className="footnote">{moving?(s.activity.flight?'飞行期间不可改道。':'点击其他地点可随时改道或折返，按当前位置计算路程。'):''}地点按区域地图近似标注；移动沿现有道路计时。鸟点需到飞行管理员处发现。{region==='信使路线'?'信使路线为驿站示意，不代表地理比例。':''}</p>
 </section>;
}
