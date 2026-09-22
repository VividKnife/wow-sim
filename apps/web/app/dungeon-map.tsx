"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps} from './game-ui';
import BossLoot,{type JournalBoss} from './boss-loot';
import './dungeon-map.css';

const statuses:Record<string,string>={cleared:'已清理',skipped:'已绕过',absent:'本次未出现',current:'下一场',ahead:'未清理'};
type MapEncounter={description?:string;id:string;name:string;kind:string;status:string;bossIds:number[];path:string[];canNavigate:boolean;navigateReason:string;enemies:{entry:number;name:string}[];quests:{questId:number;questName:string;name:string;count:number;required:number}[]};
type DungeonMapView={id:string;name:string;route:MapEncounter[];locationId:string;destination:string;path:string[];autoAdvance:boolean;canFullClear:boolean;navigateReason:string;map:{attribution?:string;width:number;height:number;points:Record<string,[number,number]>;floors:{id:number;name:string;image:string}[];floorByNode:Record<string,number>;edges:[string,string][]}};

export default function DungeonMap({state:s,data:d,busy,send,raid}:GameProps&{raid?:'guild'|'gold'}){
 const raidView=raid==='guild'?d.guildRaid:raid==='gold'?d.goldRaid:null;
 const dm:DungeonMapView=raidView?.map||d.dungeon;
 const [selectedId,setSelectedId]=useState<string|null>(null),[detailed,setDetailed]=useState(false);
 const [floorId,setFloorId]=useState(0);
 const detailRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selectedId)detailRef.current?.scrollIntoView({block:'nearest',behavior:'instant'});},[selectedId]);
 const selected=dm.route.find(r=>r.id===selectedId)||null;
 const journal:{id:string;bosses:JournalBoss[]}[]=d.dungeonJournal||[];
 const bosses=journal.find(j=>j.id===dm.id)?.bosses||[];
 const map=dm.map,at=(id:string)=>map.points[id];
 const planned=selected?.path?.length?selected.path:[dm.locationId,...dm.path];
 const pairs=new Set(planned.slice(1).map((id:string,i:number)=>[planned[i],id].sort().join(':')));
 if(!selected&&dm.destination==='full'&&dm.autoAdvance)for(const [a,b] of map.edges)pairs.add([a,b].sort().join(':'));
 const target=dm.route.find(r=>r.id===dm.destination);
 const location=dm.route.find(r=>r.id===dm.locationId);
 const navigate=(destination:string)=>send({type:raid==='guild'?'raidNavigate':raid==='gold'?'goldNavigate':'dungeonNavigate',destination});
 return <section className="panel dungeon-atlas" aria-label="完整副本地图">
  <div className="section-heading"><div><div className="eyebrow">{raid?'团队副本地图 · 10名首领':'地下城地图 · 全部区域'}</div><h2>{dm.name}</h2></div><Button size="sm" variant="outline" onClick={()=>setDetailed(!detailed)}>{detailed?'标准视图':'放大地图'}</Button></div>
  <div className="dungeon-map-status" role="status"><span>小队位置：<strong>{location?.name||'副本入口'}</strong></span><span>目的地：<strong>{target?.name||(dm.destination==='full'?'全清副本':'尚未选择')}</strong>{dm.autoAdvance?' · 推进中':' · 已停止'}</span></div>
  <p className="footnote">点击首领查看掉落，点击区域规划路线。金色连线为所选路线。{raid?'沿途清理怪物群，首领战后可拾取装备、休整或继续。':'战斗中改道在本场结束后生效。'}</p>
  <div className="atlas-floor-controls" aria-label="地图区域">{map.floors.length>1&&<><Button size="sm" variant={floorId===0?'default':'outline'} aria-pressed={floorId===0} onClick={()=>setFloorId(0)}>完整副本</Button>{map.floors.map(f=><Button key={f.id} size="sm" variant={floorId===f.id?'default':'outline'} aria-pressed={floorId===f.id} onClick={()=>setFloorId(f.id)}>{f.name}{map.floorByNode[dm.locationId]===f.id?' · 小队':''}</Button>)}</>}<Button size="sm" variant="outline" onClick={()=>setFloorId(map.floorByNode[dm.locationId])}>定位小队</Button></div>
  {map.floors.filter(f=>floorId===0||floorId===f.id).map(floor=><div className="atlas-floor" key={floor.id}>
  <div className="atlas-floor-heading"><h3>{floor.name}</h3><small>{dm.route.filter(r=>map.floorByNode[r.id]===floor.id&&r.kind==='boss').length} 处首领遭遇</small></div>
  <div className="dungeon-map-scroll" tabIndex={0} aria-label={`${floor.name}地图，可横向滚动`}><div className={'dungeon-map-canvas '+(detailed?'is-zoomed':'')} style={{aspectRatio:`${map.width} / ${map.height}`}}>
   {/* Original client tiles are assembled losslessly; labels/pins remain separate. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img className="atlas-original-map" src={floor.image} alt={`${dm.name} · ${floor.name}副本地图`} width={map.width} height={map.height}/>
   <svg viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="none" aria-hidden="true">
    {map.edges.filter(([a,b])=>map.floorByNode[a]===floor.id&&map.floorByNode[b]===floor.id&&pairs.has([a,b].sort().join(':'))).map(([a,b])=><line key={a+':'+b} className="atlas-corridor is-planned" x1={at(a)[0]} y1={at(a)[1]} x2={at(b)[0]} y2={at(b)[1]}/>)}
   </svg>
   {floor.id===1&&<span className={'atlas-entrance '+(dm.locationId==='entrance'?'is-player':'')} style={{left:at('entrance')[0]/map.width*100+'%',top:at('entrance')[1]/map.height*100+'%'}}>{dm.locationId==='entrance'?'小队 · 入口':'入口'}</span>}
   {dm.route.map((r,index)=>{if(map.floorByNode[r.id]!==floor.id)return null;
    const [x,y]=at(r.id),isBoss=r.kind==='boss',current=r.id===dm.locationId;
    return <button type="button" key={r.id} className={`atlas-pin status-${r.status} ${isBoss?'is-boss':''} ${current?'is-player':''} ${selected?.id===r.id?'is-selected':''} ${dm.destination===r.id?'is-target':''}`} style={{left:x/map.width*100+'%',top:y/map.height*100+'%'}} onClick={()=>setSelectedId(r.id)} aria-pressed={selected?.id===r.id} aria-label={`${r.name} · ${statuses[r.status]}${r.quests.length?' · 任务目标':''}${current?' · 小队位置':''}`} title={`${r.name} · ${statuses[r.status]}`}>
     <span className="atlas-pin-symbol" aria-hidden="true">{r.status==='cleared'?'✓':isBoss?'☠':r.kind==='interaction'?'⚙':index+1}</span>
     {r.quests.length>0&&<b className="atlas-quest" aria-hidden="true">!</b>}
     {isBoss&&<span className="atlas-pin-name">{bosses.filter((b)=>r.bossIds.includes(b.id)).map((b)=>b.name).join(' / ')||r.name}</span>}
     {current&&<span className="atlas-player-label">小队</span>}
    </button>;
   })}
  </div></div></div>)}
  <div className="atlas-legend"><span>☠ 首领</span><span>数字 · 怪物群</span><span>⚙ 机关</span><span className="quest-color">! 未完成任务</span><span>✓ 已清理</span><span>蓝圈 · 小队位置</span><span>{map.attribution||'原版地图 · 暴雪客户端纹理'}</span></div>
  <div className="action-row atlas-actions"><Button disabled={busy||!dm.canFullClear} onClick={()=>navigate('full')}>{dm.destination==='full'&&dm.autoAdvance?'重新规划全清路线':'全清副本'}</Button>{dm.autoAdvance&&<Button variant="outline" disabled={busy} onClick={()=>send({type:raid==='guild'?'raidPause':raid==='gold'?'goldPause':'dungeonPause'})}>本场结束后停止</Button>}</div>
  {dm.navigateReason&&<p className="footnote">{dm.navigateReason}</p>}
  {selected?<div ref={detailRef} className="atlas-selection" aria-label="所选区域详情">
   <div className="atlas-destination"><div className="section-heading"><div><div className="eyebrow">{selected.kind==='boss'?'首领目的地':'区域目的地'} · {statuses[selected.status]}</div><h3>{selected.name}</h3></div><Button size="sm" variant="ghost" onClick={()=>setSelectedId(null)}>关闭详情</Button></div>
    <p>{s.combat?'先结束当前战斗，再沿所选路线前进。':'沿途逐场清理敌人并完成必要机关。'}{selected.kind==='boss'?'击杀该首领及本场随从后停止。':'完成该区域后停止。'}</p>
    <Button disabled={busy||!selected.canNavigate} onClick={()=>navigate(selected.id)}>{selected.kind==='boss'?'推进并击杀该首领':'推进并清理该区域'}</Button>
    {selected.description&&<p>{selected.description}</p>}
    {selected.navigateReason&&<p className="footnote">{selected.navigateReason}</p>}
    {selected.quests.length>0&&<ul className="atlas-quests" aria-label="相关任务">{selected.quests.map((q)=><li key={`${q.questId}:${q.name}`}><strong>! {q.questName}</strong><span>{q.name} · {q.count} / {q.required}</span></li>)}</ul>}
    {selected.enemies.length>0&&<p className="footnote">区域敌人：{selected.enemies.map((e)=>e.name).join('、')}</p>}
    {selected.canNavigate&&<details><summary>查看行进路线 · {selected.path.filter((id:string)=>dm.route.some((r)=>r.id===id&&!['cleared','skipped','absent'].includes(r.status))).length} 场待清理遭遇</summary><ol className="atlas-waypoints">{selected.path.map((id:string)=><li key={id}>{dm.route.find((r)=>r.id===id)?.name||'副本入口'}</li>)}</ol></details>}
   </div>
   {raid&&selected.kind==='boss'&&<div className="atlas-loot"><h3>首领战利品</h3><p>{raid==='gold'?'击败后公开拍卖三件装备，拍卖结束再继续路线。':'每周首杀获得一件适合团长的史诗装备；练习不重复发放奖励。'}</p>{raidView.bosses.find((b:any)=>b.id===selected.id)?.loot?.map((item:any)=><p key={item.id}>{item.name}</p>)}</div>}
   {!raid&&selected.bossIds.length>0&&<div className="atlas-loot">{bosses.filter((b)=>selected.bossIds.includes(b.id)).map((b)=><div key={b.id}><BossLoot key={`${dm.id}:${b.id}`} boss={b}/></div>)}</div>}
  </div>:<p className="atlas-hint">选择地图上的首领或怪物群，查看详情与行进路线。</p>}
 </section>;
}
