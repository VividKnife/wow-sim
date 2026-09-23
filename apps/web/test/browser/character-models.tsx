import React,{Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import {OrbitControls,Html} from '@react-three/drei';
import {Creature} from '../../app/battle-hd2d/creature';
import {BattleFrames} from '../../app/battle-hd2d/frame';
import {sceneLayout} from '../../lib/battle-scene.js';
import {battleModel} from '../../../../packages/game-data/battle-models.js';
import manifest from '../../../../packages/game-data/data/classic-characters-manifest.json';
import type {BattleScene,CreatureModelData} from '../../lib/battle-hd2d-types';
import '../../app/globals.css';
import './molten-core-models.css';

const races:Record<number,string>={1:'人类',2:'兽人',3:'矮人',4:'暗夜精灵',5:'亡灵',6:'牛头人',7:'侏儒',8:'巨魔'};
const classes:Record<number,string>={1:'战士',2:'圣骑士',3:'猎人',4:'盗贼',5:'牧师',7:'萨满祭司',8:'法师',9:'术士',11:'德鲁伊'};
// Derive availability from shipped appearances, never invent race/class combinations.
function Gallery(){
 const [race,setRace]=useState(1),[classId,setClass]=useState(1),[gender,setGender]=useState('male'),[level,setLevel]=useState(60);
 const [action,setAction]=useState('idle'),[start,setStart]=useState(0),[clock,setClock]=useState(0),[paused,setPaused]=useState(false);
 const [sampledAt,setSampledAt]=useState(()=>performance.now());
 useEffect(()=>{if(paused)return;const id=setInterval(()=>{setSampledAt(performance.now());setClock(t=>t+50);},50);return()=>clearInterval(id);},[paused]);
 const available=Object.keys(classes).map(Number).filter(c=>`${race}-0-${c}-t1` in manifest.appearances);
 const model=battleModel({raceId:race,gender,classId,level})! as CreatureModelData;
 const unit={id:'character',name:classes[classId],hp:action==='dead'?0:100,maxHp:100,position:0,positionY:0,modelAnimation:{action,startedAt:start,until:start+86400000}};
 const scene:BattleScene={encounterId:'character-gallery',live:!paused,sampledAt,layout:sceneLayout([unit],[],1),units:[unit],clock,selectedId:unit.id,range:5,effects:[],projectiles:[],groundEffects:[],lowEffects:true,reducedMotion:false};
 const setName=(manifest.sets as Record<string,string>)[classId];
 return <main className="mc-model-gallery"><header><p>原版人物 · 种族与职业外观</p><h1>{races[race]}{classes[classId]} · {level===60?setName+' T1':'初始服装'}</h1><p>8 个种族 · 男女体型 · 80 种职业组合。拖动旋转，滚轮缩放。60 级自动启用 T1 外观。</p></header>
  <nav className="action-row" aria-label="种族">{Object.entries(races).map(([id,name])=><button key={id} aria-pressed={race===+id} onClick={()=>{setRace(+id);if(!(`${id}-0-${classId}-t1` in manifest.appearances))setClass(1);}}>{name}</button>)}</nav>
  <nav className="action-row" aria-label="职业">{available.map(id=><button key={id} aria-pressed={classId===id} onClick={()=>setClass(id)}>{classes[id]}</button>)}</nav>
  <div className="action-row">{['male','female'].map(g=><button key={g} aria-pressed={gender===g} onClick={()=>setGender(g)}>{g==='male'?'男性':'女性'}</button>)}{[20,60].map(l=><button key={l} aria-pressed={level===l} onClick={()=>setLevel(l)}>{l===60?'60 级 · T1 套装':'20 级 · 初始服装'}</button>)}<button onClick={()=>setPaused(!paused)}>{paused?'继续动作':'暂停动作'}</button></div>
  <section className="mc-model-stage" aria-label="人物模型预览"><Canvas camera={{position:[8,4,7],fov:40,near:.1,far:100}}><color attach="background" args={['#171d24']}/><ambientLight intensity={1.8}/><directionalLight position={[10,18,12]} intensity={2.4}/><OrbitControls target={[0,2,0]} minDistance={2} maxDistance={25}/><gridHelper args={[20,10,'#554739','#30353a']}/><Suspense fallback={<Html center>正在加载原版人物…</Html>}><BattleFrames scene={scene}><Creature key={model.appearanceKey} unit={unit} height={4} model={model}/></BattleFrames></Suspense></Canvas></section>
  <div className="action-row">{Object.entries({idle:'待机',walk:'移动',attack:'攻击',cast:'施法',hurt:'受击',dead:'死亡'}).map(([id,label])=><button key={id} aria-pressed={action===id} onClick={()=>{setAction(id);setStart(clock);}}>{label}</button>)}</div>
  <p>身体与骨骼共用，衣服使用原版贴图，头盔、肩甲和武器跟随原版骨骼挂点。当前为职业套装预设，背包换装不会改变外观。</p>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Gallery/>);
