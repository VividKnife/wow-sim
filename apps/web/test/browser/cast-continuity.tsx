import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import ActivityProgress from '../../app/activity-progress';
import '../../app/globals.css';
function Check(){
 const [run,setRun]=useState(0),[clock,setClock]=useState(0),[report,setReport]=useState('尚未开始');
 useEffect(()=>{
  if(!run)return;
  const began=performance.now();let frame=0,last=0,seen=false,previous:Element|null=null,rewinds=0,replacements=0,maxAdvance=0;
  // The 1.2-second delayed sample represents only 0.6 seconds of simulation.
  // No completion packet follows: the known cast must finish by itself.
  const packet=setTimeout(()=>setClock(600),1200);
  const sample=()=>{
   const node=document.querySelector('[role=progressbar]');
   if(node){const progress=Number(node.getAttribute('aria-valuenow'));if(seen){if(progress<last)rewinds++;if(node!==previous)replacements++;maxAdvance=Math.max(maxAdvance,progress-last);}last=progress;seen=true;previous=node;}
   if(seen&&!node){setReport(JSON.stringify({rewinds,replacements,maxAdvance,finishedAt:Math.round(performance.now()-began)}));return;}
   if(performance.now()-began>5000){setReport('FAIL: 读条没有结束');return;}
   frame=requestAnimationFrame(sample);
  };frame=requestAnimationFrame(sample);
  return()=>{clearTimeout(packet);cancelAnimationFrame(frame);};
 },[run]);
 return <main style={{padding:40,color:'white',background:'#211b18',minHeight:'100vh'}}><h1>施法连续性回归</h1><p>3 秒施法；1.2 秒时收到落后的状态，此后不发完成回执。</p><button onClick={()=>{setClock(0);setReport('测试中');setRun(n=>n+1);}}>测试延迟读条</button>{run>0&&<ActivityProgress key={run} state={{clock,activity:{type:'classSpell',spell:133,startedAt:0,endsAt:3000}}} data={{skills:[{spellId:133,name:'火球术'}]}} quartz/>}<output aria-label="测试结果">{report}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Check/>);
