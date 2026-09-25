'use client';
/* eslint-disable @next/next/no-img-element -- Original local map textures. */
import atlas from '../../../packages/game-data/data/world-atlas.json';
import {mapRegions} from '@/lib/world-map.js';
import {atlasLabels} from '@/lib/world-atlas-layout.js';
import './world-atlas.css';

const continents=atlas.continents.map(continent=>({...continent,labels:atlasLabels(continent.regions)}));
const centerMap=(element:HTMLDivElement|null)=>{if(element)element.scrollLeft=(element.scrollWidth-element.clientWidth)/2;};
type Player={region:string;x:number;y:number}|null;
export default function WorldAtlas({player,onSelect}:{player:Player;onSelect:(region:string)=>void}){
 return <div className="world-atlas" aria-label="艾泽拉斯世界地图">
  <p className="world-atlas-help">点击地区进入区域地图，再选择具体地点旅行。窄屏可左右滑动地图。<span>◆ 玩家所在地区</span></p>
  <div className="world-atlas-continents">{continents.map(continent=><section key={continent.id} className="world-atlas-continent" aria-label={continent.name}>
   <h3>{continent.name}</h3>
   <div ref={centerMap} className="world-atlas-scroll" tabIndex={0} aria-label={`${continent.name}地图，窄屏可横向滚动`}><div className="world-atlas-terrain">
    <img src={continent.image} alt={`${continent.name}原版大陆地图`} width={1002} height={668}/>
    <svg className="world-atlas-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{continent.labels.map(region=><g key={region.id}><line x1={region.anchorX} y1={region.anchorY} x2={region.x} y2={region.y}/><circle cx={region.anchorX} cy={region.anchorY} r=".45"/></g>)}</svg>
    {continent.labels.filter(region=>region.id in mapRegions).map(region=>{
     const current=player?.region===region.id;
     return <button key={region.id} className={`world-atlas-region ${current?'is-player':''}`} style={{left:region.x+'%',top:region.y+'%'}} onClick={()=>onSelect(region.id)} aria-label={`${region.id} · 查看区域地图${current?' · 玩家所在地区':''}`} aria-current={current?'location':undefined}><span>{current?'◆ ':''}{region.id}</span></button>;
    })}
   </div></div>
  </section>)}</div>
  <p className="footnote">地图上的地区标签均可点击，也可用 Tab 选择、Enter 打开。大陆纹理 © Blizzard Entertainment。</p>
 </div>;
}
