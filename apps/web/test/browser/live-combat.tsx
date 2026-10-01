import {createRoot} from 'react-dom/client';
import Game from '../../app/game';
import '../../app/globals.css';
// Bounded, test-only display-frame and transport diagnostics, independent of React.
const hud=document.createElement('output');hud.id='preview-performance';hud.style.cssText='position:fixed;top:0;left:35%;z-index:99999;background:#111;color:white;padding:3px;font:12px monospace;pointer-events:none';document.body.append(hud);
const frames:number[]=[];let previous=performance.now(),lastReport=previous,messages=0,bytes=0,longTasks=0,snapshots=0,deltas=0,disconnects=0,samplingAt=previous;
const NativeSocket=window.WebSocket;
window.WebSocket=class extends NativeSocket{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);if(String(url).includes('/api/events'))this.addEventListener('message',event=>{messages++;bytes+=typeof event.data==='string'?new TextEncoder().encode(event.data).length:0;try{const data=JSON.parse(event.data);if(data.type==='snapshot')snapshots++;if(data.type==='delta')deltas++;}catch{}});this.addEventListener('close',()=>{if(String(url).includes('/api/events'))disconnects++;});}};
try{new PerformanceObserver(list=>{longTasks+=list.getEntries().length;}).observe({type:'longtask',buffered:true});}catch{}
const reset=document.createElement('button');reset.textContent='重新采样';reset.style.cssText='position:fixed;top:24px;left:35%;z-index:99999';reset.onclick=()=>{frames.length=0;messages=bytes=longTasks=snapshots=deltas=disconnects=0;samplingAt=performance.now();};document.body.append(reset);
function sample(now:number){const delta=now-previous;previous=now;if(!document.hidden&&delta<1000){frames.push(delta);if(frames.length>1800)frames.shift();}if(now-lastReport>=1000){const sorted=[...frames].sort((a,b)=>a-b),p=(q:number)=>Math.round((sorted[Math.floor((sorted.length-1)*q)]||0)*10)/10;hud.textContent=`帧间隔 P50 ${p(.5)} / P99 ${p(.99)} ms · WS ${messages} · 长任务 ${longTasks}`;hud.dataset.metrics=JSON.stringify({frames:frames.length,p50:p(.5),p99:p(.99),messages,bytes,longTasks,snapshots,deltas,disconnects,seconds:Math.round((now-samplingAt)/100)/10});lastReport=now;}requestAnimationFrame(sample);}requestAnimationFrame(sample);
createRoot(document.getElementById('root')!).render(<Game/>);
