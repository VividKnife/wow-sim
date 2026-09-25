import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import WorldScene from '../../app/world-scene';
import type {GameProps} from '../../app/game-ui';
import '../../app/globals.css';

function Preview(){
 const [mode,setMode]=useState('idle'),[mobile,setMobile]=useState(false);
 const state={id:'spirit-preview',name:'林间旅人',raceId:1,classId:8,gender:'male',level:20,hp:mode==='idle'?100:0,clock:0,location:'goldshire',equipment:{5:{id:56}},activity:mode==='ghost'?{type:'revive',targets:['spirit-preview'],startedAt:0,endsAt:10000}:{type:mode==='dead'?'dead':'idle'}};
 const data={items:{56:{slot:20}},location:{id:'goldshire',name:'闪金镇',region:'艾尔文森林'},map:[]};
 return <main style={{maxWidth:mobile?390:1000,margin:'32px auto',padding:16}}>
  <h1>灵魂形态与跑尸动画</h1><p>检查倒地、释放灵魂、复活、场景暂停及手机布局。预览状态保持到手动切换。</p>
  <nav className="action-row" style={{marginBottom:16}}>{Object.entries({idle:'存活',dead:'倒地',ghost:'灵魂跑尸'}).map(([value,label])=><button key={value} onClick={()=>setMode(value)} aria-pressed={mode===value}>{label}</button>)}<button onClick={()=>setMobile(value=>!value)} aria-pressed={mobile}>手机布局</button></nav>
  <WorldScene {...{state,data,busy:false,send:async()=>true} as unknown as GameProps}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
