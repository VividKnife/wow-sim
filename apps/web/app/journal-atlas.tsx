"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {useContentPack} from '../lib/use-content-pack';

export default function JournalAtlas({dungeon,onSelectBoss}:{dungeon:any;onSelectBoss:(id:string)=>void}){
 const {data,error,retry}=useContentPack(dungeon.contentVersion,dungeon.atlasPack);
 const atlas=dungeon.atlas||data?.atlas;
 const [floorId,setFloorId]=useState<number|null>(null);
 if(!atlas)return <div className="journal-empty" role="status">{error||'正在加载副本地图…'}{error&&<Button onClick={retry}>重试</Button>}</div>;
 const floor=atlas.floors.find((f:any)=>f.id===floorId)||atlas.floors[0];
 return <div className="journal-atlas">
  <div className="journal-floor-tabs" aria-label="选择地图楼层">{atlas.floors.map((f:any)=><Button key={f.id} variant={f.id===floor.id?'default':'outline'} size="sm" aria-pressed={f.id===floor.id} onClick={()=>setFloorId(f.id)}>{f.name}</Button>)}</div>
  <div className="journal-map-image" style={{aspectRatio:`${atlas.width}/${atlas.height}`}}>
   <img src={floor.image} alt={`${dungeon.name} · ${floor.name}`} width={atlas.width} height={atlas.height}/>
   {dungeon.bosses.map((boss:any,index:number)=>{const node=atlas.bossLocations[boss.id];if(!node||atlas.floorByNode[node]!==floor.id)return null;const point=atlas.points[node];return <button type="button" key={boss.id} style={{left:point[0]/atlas.width*100+'%',top:point[1]/atlas.height*100+'%'}} onClick={()=>onSelectBoss(boss.id)} aria-label={`查看${boss.name}`} title={boss.name}>{index+1}</button>;})}
  </div>
  <ol className="journal-map-key">{dungeon.bosses.map((boss:any,index:number)=><li key={boss.id}><button type="button" onClick={()=>onSelectBoss(boss.id)}><b>{index+1}</b> {boss.name}</button></li>)}</ol>
  <p className="footnote">点击地图编号查看首领与掉落。{atlas.attribution||'原版地图 · 暴雪客户端纹理'}</p>
 </div>;
}
