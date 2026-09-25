import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import {OrbitControls,Html} from '@react-three/drei';
import {Suspense} from 'react';
import {Creature} from '../../app/battle-hd2d/creature';
import {BattleFrames} from '../../app/battle-hd2d/frame';
import {sceneLayout} from '../../lib/battle-scene.js';
import {moltenCoreModel} from '../../../../packages/game-data/molten-core-models.js';
import {moltenCoreBosses,moltenCoreTrash} from '../../../../packages/game-domain/src/rules/molten-core-content.js';
import type {BattleScene,BattleUnitData} from '../../lib/battle-hd2d-types';
import '../../app/globals.css';
import './molten-core-models.css';

const catalogue=[...moltenCoreBosses,...Object.values(moltenCoreTrash),
 {entry:12119,name:'烈焰行者护卫'},{entry:12099,name:'火誓者'},{entry:11672,name:'熔岩犬'},
 {entry:11664,name:'烈焰行者精英'},{entry:11663,name:'烈焰行者医师'},{entry:12143,name:'烈焰之子'}];
const actions={idle:'待机',walk:'移动',attack:'攻击',cast:'施法',hurt:'受击',dead:'死亡',submerge:'潜入熔岩',emerge:'重新现身',surrender:'投降'};
function Gallery(){
 const [entry,setEntry]=useState(11502),[all,setAll]=useState(false),[action,setAction]=useState('idle');
 const [clock,setClock]=useState(0),[start,setStart]=useState(0),[paused,setPaused]=useState(false);
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>setClock(t=>t+50),50);return()=>clearInterval(timer);},[paused]);
 const rows=useMemo(()=>all?catalogue:catalogue.filter(c=>c.entry===entry),[all,entry]);
 const units=rows.map((row,i)=>({id:String(row.entry),name:row.name,entry:row.entry,hp:action==='dead'?0:100,maxHp:100,foe:false,
  position:all?(i%6)*10:0,positionY:all?Math.floor(i/6)*11:0,
  modelAnimation:{action,startedAt:start,until:start+86400000},visual:{model:moltenCoreModel(row.entry)!}}));
 const layout=sceneLayout(units,[],1,{minX:-8,maxX:60,minY:-8,maxY:52} as any);
 const scene:BattleScene={encounterId:`gallery-${all?'all':entry}-${action}-${start}`,live:!paused,sampledAt:performance.now(),
  layout,units,clock,selectedId:String(entry),range:5,effects:[],projectiles:[],groundEffects:[],lowEffects:true,reducedMotion:false};
 return <main className="mc-model-gallery"><header><p>熔火之心 · 原版生物图鉴</p><h1>模型与骨骼动作</h1><p>10 名首领 · 11 种小怪 · 6 种随从与召唤物。拖动旋转，滚轮缩放。</p></header>
  <div className="action-row"><button onClick={()=>setAll(!all)}>{all?'查看单体':'查看全部 27 种'}</button><button onClick={()=>setPaused(!paused)}>{paused?'继续播放':'暂停动作'}</button>
   {Object.entries(actions).filter(([id])=>!['submerge','emerge','surrender'].includes(id)||(!all&&(entry===11502&&id!=='surrender'||entry===12018&&id==='surrender'))).map(([id,name])=><button key={id} aria-pressed={action===id} onClick={()=>{setAction(id);setStart(clock);}}>{name}</button>)}
  </div>
  <section className={'mc-model-stage '+(all?'is-all':'')} aria-label="原版模型预览">
   <Canvas key={all?'all':entry} camera={{position:all?[25,42,63]:[10,6,12],fov:all?52:40,near:.1,far:200}}>
    <color attach="background" args={['#171d24']}/><ambientLight intensity={1.8}/><directionalLight position={[10,18,12]} intensity={2.4}/><directionalLight position={[-8,8,-8]} color="#ffb78a" intensity={1.2}/>
    <OrbitControls target={all?[25,0,23]:[0,3,0]} minDistance={3} maxDistance={100}/>
    <gridHelper args={[all?70:25,all?14:10,'#554739','#30353a']} position={all?[25,-.01,22]:[0,-.01,0]}/>
    <Suspense fallback={<Html center>正在加载原版模型…</Html>}><BattleFrames scene={scene}>
     {units.map((unit,i)=><group key={unit.id} position={all?[(i%6)*10,0,Math.floor(i/6)*11]:[0,0,0]}>
      <Creature unit={unit as BattleUnitData} height={all?4.8:7} model={unit.visual.model}/>
      <Html position={[0,all?-.7:8,0]} center><span className="mc-model-name">{unit.name}</span></Html>
     </group>)}
    </BattleFrames></Suspense>
   </Canvas>
  </section>
  <nav className="mc-model-list" aria-label="选择 MC 生物">{catalogue.map(row=><button key={row.entry} aria-pressed={!all&&entry===row.entry} onClick={()=>{setEntry(row.entry);setAll(false);setAction('idle');setStart(clock);}}>{row.name}</button>)}</nav>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Gallery/>);
