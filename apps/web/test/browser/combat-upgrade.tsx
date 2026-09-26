import {createNpcMember} from '../../../../packages/game-domain/src/rules/party.js';
/// <reference types="vite/client" />
import React,{Profiler,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {abilities} from '../../../../packages/game-domain/src/rules/catalog.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import Battle from '../../app/battle';
import Strategy from '../../app/strategy';
import '../../app/globals.css';
function fixture(group=true){
 let s:any=createGame('测试法师',283,0);s.level=20;s.learned=abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId);const st:any=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;
 for(const id of ['warrior','priest','rogue','mage'])createNpcMember(s,id);
 s.rules=[{spell:10,condition:'enemyCountAtLeast',value:3,enabled:true},{spell:116,condition:'always',value:0,enabled:true}];
 s.party.find((c:any)=>c.classId===8).rules=[{spell:133,condition:'always',value:0,enabled:true}];
 startCombat(s,group?[636,636,1729]:[299],group);return s;
}
function Harness(){
 const [measuring,setMeasuring]=useState(false),[report,setReport]=useState('');
 const renders=useRef<number[]>([]);
 useEffect(()=>{
  if(!measuring)return;
  renders.current=[];const gaps:number[]=[],longTasks:number[]=[];let last=performance.now(),frame=0;
  const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push(entry.duration);});
  observer.observe({type:'longtask'});
  const draw=(now:number)=>{gaps.push(now-last);last=now;frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);
  const timer=setTimeout(()=>{
   const sorted=gaps.slice().sort((a,b)=>a-b),commits=renders.current;
   const result=JSON.stringify({frames:gaps.length,frameP95Ms:Math.round(sorted[Math.floor(sorted.length*.95)]||0),maxFrameMs:Math.round(Math.max(0,...gaps)),longTasks:longTasks.length,maxLongTaskMs:Math.round(Math.max(0,...longTasks)),reactCommits:commits.length,reactTotalMs:Math.round(commits.reduce((a,b)=>a+b,0)),reactMaxMs:Math.round(Math.max(0,...commits))});
   setReport(result);console.info('Combat performance (12s)',result);setMeasuring(false);
  },12000);
  return()=>{clearTimeout(timer);cancelAnimationFrame(frame);observer.disconnect();};
 },[measuring]);
 const [s,setState]=useState(()=>fixture()),[open,setOpen]=useState(true),[paused,setPaused]=useState(false),[error,setError]=useState('');const current=useRef(s);current.current=s;
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>setState((s:any)=>advance(s,s.wallAt+250,{}).state),250);return()=>clearInterval(timer);},[paused]);
 const send=async(action:any)=>{try{const next=act(current.current,action,current.current.wallAt);setState(next);current.current=next;setError('');return true;}catch(e:any){setError(e.message);return false;}};
 const snapshot=projectClientSnapshot(s,view(s));
 const props={state:snapshot.player,data:snapshot.view,busy:false,send};
 return <main className="game-shell"><section className="panel"><h1>战斗升级 · 独立验证</h1><p>20 级、已学技能及群怪为测试夹具，不连接用户存档。战斗使用真实引擎。</p><div className="action-row"><button onClick={()=>{setState(fixture());setOpen(true);}}>重置五人群怪</button><button onClick={()=>{setState(fixture(false));setOpen(true);}}>重置野外单怪</button><button disabled={measuring} onClick={()=>{setState(fixture());setPaused(false);setOpen(true);setMeasuring(true);}}>开始 12 秒性能采样</button><button onClick={()=>setOpen(true)}>查看战斗</button><button onClick={()=>setPaused(!paused)}>{paused?'继续模拟':'暂停模拟'}</button></div></section><p aria-live="polite">当前活动：{s.activity.type} · 存活队员：{[s,...s.party].filter((c:any)=>c.hp>0).length} / {s.party.length+1}</p><output aria-label="性能采样结果">{report}</output><Strategy {...props}/><Profiler id="battle" onRender={(_,__,duration)=>{if(measuring)renders.current.push(duration);}}><Battle {...props} open={open} onOpenChange={setOpen}/></Profiler>{error&&<p role="alert">{error}</p>}</main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Harness/>);
