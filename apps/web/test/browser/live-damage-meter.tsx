import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import LiveDamageMeter from '../../app/live-damage-meter';
import {publishLocalCombat} from '../../lib/local-combat-store';

const state={id:'hero',clock:0,combat:null,lastCombat:null};
const data={skills:[],stats:{}};
function snapshot(id:string,clock:number,damage:number,ended=false){
 const battle={id,startedAt:0,...(ended?{endedAt:clock}:{}),metrics:{startedAt:0,actors:{hero:{actorId:'hero',name:'测试法师',classId:8,damage,healing:0,spells:{}}}}};
 return {player:{...state,clock,combat:ended?null:battle,lastCombat:ended?battle:null},view:{battleView:{actors:[{id:'hero'}],units:{hero:{}}}}};
}
function Harness(){
 const [result,setResult]=useState('待运行');
 const run=()=>{
  try{
   const expect=(pattern:RegExp)=>{if(!pattern.test(document.querySelector('#meter')!.textContent!))throw new Error(`缺少 ${pattern}`);};
   const row=()=>document.querySelector('#meter .dm-row')?.getAttribute('aria-label')||'';
   const damage=(value:number,dps:string)=>{if(!row().includes(`伤害 ${value}，DPS ${dps}`))throw new Error(row());};
   flushSync(()=>publishLocalCombat(null));expect(/尚无战斗/);
   flushSync(()=>publishLocalCombat(snapshot('first',1000,120)));expect(/战斗中/);damage(120,'120.0');
   flushSync(()=>publishLocalCombat(snapshot('first',2000,300)));damage(300,'150.0');expect(/00:02/);
   flushSync(()=>publishLocalCombat(snapshot('first',3000,300)));damage(300,'100.0');
   flushSync(()=>publishLocalCombat(snapshot('first',4000,400,true)));expect(/已结束/);damage(400,'100.0');
   flushSync(()=>publishLocalCombat(snapshot('second',1000,50)));expect(/战斗中/);damage(50,'50.0');
   flushSync(()=>publishLocalCombat({...snapshot('other',2000,999),player:{...state,id:'other'},view:{battleView:{actors:[{id:'other'}],units:{other:{}}}}}));expect(/尚无战斗/);
   flushSync(()=>publishLocalCombat(null));expect(/尚无战斗/);
   setResult('PASS：首次战斗、伤害递增、无伤害时 DPS 与计时更新、结算、下一场重置、角色隔离、清空回退');
  }catch(error){setResult(`FAIL：${error}`);}
 };
 return <main><h1>实时伤害统计回归测试</h1><p>主界面 props 始终不变，仅发布真实本地战斗数据流。</p><button onClick={run}>运行测试</button><p role="status">{result}</p><div id="meter"><LiveDamageMeter state={state} data={data} empty={<p>尚无战斗</p>}/></div></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
