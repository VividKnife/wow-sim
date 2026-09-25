import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Game from '../../app/game';
import '../../app/globals.css';
import '../../app/journey.css';
function PerformanceReadout(){
 const [sample,setSample]=useState('正在采样');
 useEffect(()=>{
  let raf=0,last=0,frames:number[]=[],longTasks=0;
  const observer=new PerformanceObserver(list=>{longTasks+=list.getEntries().length;});
  observer.observe({type:'longtask',buffered:false});
  const draw=(now:number)=>{if(last&&!document.hidden)frames.push(now-last);last=now;raf=requestAnimationFrame(draw);};raf=requestAnimationFrame(draw);
  const timer=setInterval(()=>{const sorted=frames.sort((a,b)=>a-b);if(sorted.length)setSample(`主线程 ${Math.round(1000/(sorted.reduce((a,b)=>a+b,0)/sorted.length))} FPS · P95 ${Math.round(sorted[Math.floor(sorted.length*.95)])} ms · 长任务 ${longTasks}`);frames=[];longTasks=0;},5000);
  return()=>{cancelAnimationFrame(raf);clearInterval(timer);observer.disconnect();};
 },[]);
 return <output style={{position:'fixed',bottom:4,left:20,zIndex:100000,pointerEvents:'none',background:'#101820',color:'white',fontSize:12,padding:4}} aria-label="性能采样">{sample}</output>;
}
createRoot(document.getElementById('root')!).render(<><Game/><PerformanceReadout/></>);
