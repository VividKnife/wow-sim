import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {publishLocalCombat} from '../../lib/local-combat-store';
import Battle from '../../app/battle';
import '../../app/globals.css';
function Preview(){
 const [game,setGame]=useState<any>(null),[open,setOpen]=useState(true),[error,setError]=useState('');
 const workerRef=useRef<Worker|null>(null),watching=useRef(open);
 useEffect(()=>{
  const worker=new Worker(new URL('./battle-live.worker.ts',import.meta.url),{type:'module'});
  workerRef.current=worker;
  worker.onmessage=({data})=>{
   if(data.type==='fixture')setGame(data);
   if(data.type==='frame')publishLocalCombat(data.snapshot);
   if(data.type==='full')setGame((previous:any)=>!previous||watching.current&&previous.snapshot.player.combat?.id===data.snapshot.player.combat?.id?previous:{...previous,snapshot:data.snapshot});
   if(data.type==='error')setError(data.error);
  };
  worker.onerror=event=>setError(event.message);
  worker.postMessage({type:'fixture',mode:new URLSearchParams(location.search).get('mode')||'raid'});
  const visibility=()=>worker.postMessage({type:'visibility',visible:!document.hidden,watching:watching.current});document.addEventListener('visibilitychange',visibility);
  return()=>{workerRef.current=null;document.removeEventListener('visibilitychange',visibility);worker.terminate();publishLocalCombat(null);};
 },[]);
 useEffect(()=>{watching.current=open;workerRef.current?.postMessage({type:'visibility',visible:!document.hidden,watching:open});},[open]);
 return <main><h1>运行中战斗性能验证</h1><p>使用正式模拟 Worker、战斗数据流与战斗界面。独立测试数据，不连接存档；通过 mode=raid、dungeon、solo 切换。</p><button onClick={()=>setOpen(true)}>查看战斗</button>{error&&<p role="alert">{error}</p>}{game?<Battle state={game.snapshot.player} data={{...game.content,...game.snapshot.view}} busy={false} send={async()=>false} open={open} onOpenChange={setOpen}/>:<p>正在初始化独立测试数据…</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
