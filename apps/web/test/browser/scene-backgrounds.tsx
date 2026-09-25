/* eslint-disable @next/next/no-img-element -- Inspect the shipped scene assets. */
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import backgrounds from '../../../../packages/game-data/data/scene-backgrounds.json';
import WorldScene from '../../app/world-scene';
import {GameSelect,GameSelectOption} from '../../components/ui/game-select';
import '../../app/globals.css';

const dungeonNames:Record<string,string>={"ragefire-chasm":"怒焰裂谷","wailing-caverns":"哀嚎洞穴","shadowfang-keep":"影牙城堡","blackfathom-deeps":"黑暗深渊","gnomeregan":"诺莫瑞根","razorfen-kraul":"剃刀沼泽","scarlet-monastery-graveyard":"血色修道院·墓地","scarlet-monastery-library":"血色修道院·图书馆","scarlet-monastery-armory":"血色修道院·武器库","scarlet-monastery-cathedral":"血色修道院·大教堂","razorfen-downs":"剃刀高地","uldaman":"奥达曼","zul-farrak":"祖尔法拉克","maraudon-purple":"玛拉顿·紫色水晶","maraudon-orange":"玛拉顿·橙色水晶","maraudon-inner":"玛拉顿·内殿","sunken-temple":"沉没的神庙","blackrock-depths":"黑石深渊","lower-blackrock-spire":"黑石塔下层","upper-blackrock-spire":"黑石塔上层","dire-maul-east":"厄运之槌·东","dire-maul-west":"厄运之槌·西","dire-maul-north":"厄运之槌·北","scholomance":"通灵学院","stratholme-live":"斯坦索姆·血色区","stratholme-undead":"斯坦索姆·亡灵区","deadmines":"死亡矿井","stockades":"暴风城监狱"};
const raidNames:Record<string,string>={'molten-core':'熔火之心','onyxias-lair':'奥妮克希亚的巢穴'};
const choices=[...Object.entries(backgrounds.regions).map(([id,image])=>({id:'region:'+id,name:id,image,instance:false})),...Object.entries(backgrounds.dungeons).map(([id,image])=>({id,name:dungeonNames[id]||raidNames[id]||id,image,instance:true}))];
function Preview(){
 const [selected,setSelected]=useState(choices[0].id),[mode,setMode]=useState('idle'),[mobile,setMobile]=useState(false),[paused,setPaused]=useState(false),[report,setReport]=useState(''),[decoded,setDecoded]=useState('正在解码全部背景…');
 const root=useRef<HTMLDivElement>(null),scene=choices.find(c=>c.id===selected)!;
 useEffect(()=>{
  let active=true;
  void Promise.all(choices.map(async c=>{const image=new Image();image.src=c.image;try{await image.decode();return image.naturalWidth>0?null:c.name;}catch{return c.name;}})).then(results=>{if(active)setDecoded(results.some(Boolean)?'无法解码：'+results.filter(Boolean).join('、'):`${results.length} / ${results.length} 张背景解码通过`);});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  let previous='',unchanged=0;
  const timer=setInterval(()=>{
   const layer=root.current?.querySelector('.world-scene-photo-pass'),cloud=root.current?.querySelector('.world-flight-clouds');
   if(!layer)return;
   const style=getComputedStyle(layer),transform=style.transform;
   unchanged=transform===previous?unchanged+1:0;previous=transform;
   setReport(`背景：${style.animationPlayState} · 周期 ${style.animationDuration} · ${unchanged>1?'位置保持': '位置变化'}${cloud?' · 云层 '+getComputedStyle(cloud).animationPlayState:''} · ${root.current!.scrollWidth<=root.current!.clientWidth?'无横向溢出':'存在溢出'}`);
  },500);return()=>clearInterval(timer);
 },[selected,mode,paused]);
 const location={id:'preview',name:scene.name,region:scene.instance?'艾尔文':scene.name,kind:'wild'};
 const state={name:'林间旅人',level:20,hp:100,raceId:1,classId:8,gender:'female',equipment:{5:{id:56}},clock:5000,location:'preview',activity:mode==='idle'?{type:'idle'}:{type:'travel',from:'preview',to:'destination',startedAt:0,endsAt:60000,flight:mode==='flight'},mounted:mode==='ride'?900020:0,dungeon:scene.instance?{id:scene.id}:null};
 const data={items:{56:{slot:20}},location,map:[location,{...location,id:'destination'}],dungeon:scene.instance?{id:scene.id,name:scene.name,route:[]}:null};
 return <main style={{maxWidth:1280,margin:'auto',padding:20}}>
  <h1>区域与副本背景巡检</h1><p>正式 WorldScene 组件 · 45 个区域 / 30 个副本 · 展示用动作，不读写存档</p>
  <div className="action-row" style={{flexWrap:'wrap',margin:'16px 0'}}>
   <GameSelect aria-label="场景" value={selected} onValueChange={value=>setSelected(String(value))}>{choices.map(c=><GameSelectOption key={c.id} value={c.id}>{c.instance?'副本 · ':'区域 · '}{c.name}</GameSelectOption>)}</GameSelect>
   {[['idle','待机'],['foot','步行'],['ride','骑乘'],['flight','飞行']].map(([id,label])=><button key={id} onClick={()=>setMode(id)} aria-pressed={mode===id}>{label}</button>)}
   <button onClick={()=>setPaused(p=>!p)} aria-pressed={paused}>{paused?'继续演出':'暂停演出'}</button>
   <button onClick={()=>setMobile(m=>!m)} aria-pressed={mobile}>{mobile?'桌面宽度':'390px 手机宽度'}</button>
  </div>
  <p role="status">{decoded}</p><output style={{display:'block',marginBottom:12,fontSize:12}}>{report}</output>
  <div ref={root} style={{maxWidth:mobile?390:undefined,margin:'auto'}}><WorldScene state={state} data={data} busy={false} send={async()=>true} animationPaused={paused}/></div>
  <details style={{marginTop:24}}><summary>全部背景缩略图</summary><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>{choices.map(c=><button key={c.id} onClick={()=>setSelected(c.id)} style={{textAlign:'left'}}><img src={c.image} alt="" loading="lazy" style={{width:'100%',aspectRatio:'16 / 9',objectFit:'cover'}}/>{c.name}</button>)}</div></details>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
