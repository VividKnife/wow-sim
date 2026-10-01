import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Battle from '../../app/battle';
import ArenaBattle from '../../app/arena-battle';
import '../../app/globals.css';
import '../../app/arena.css';

function Preview(){
 const [mode,setMode]=useState('world'),[game,setGame]=useState<any>(null),[content,setContent]=useState<any>(null),[open,setOpen]=useState(false),[paused,setPaused]=useState(true),[run,setRun]=useState(0),[error,setError]=useState('');
 const worker=useRef<Worker|null>(null),generation=useRef(0),requestId=useRef(0),pending=useRef(new Map<number,(ok:boolean)=>void>());
 useEffect(()=>{
  const instance=new Worker(new URL('./battle-3d.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
  instance.onmessage=({data})=>{
   if(data.type==='content'){setContent(data.content);return;}
   if(data.generation!==generation.current)return;
   if(data.type==='snapshot'){setGame(data);setPaused(data.paused);}
   if(data.type==='error'){setError(data.error);setPaused(true);for(const resolve of pending.current.values())resolve(false);pending.current.clear();}
   if(data.requestId){pending.current.get(data.requestId)?.(data.type==='snapshot');pending.current.delete(data.requestId);}
  };
  instance.onerror=event=>{setError(event.message);setPaused(true);for(const resolve of pending.current.values())resolve(false);pending.current.clear();};
  instance.postMessage({type:'fixture',generation:0,mode:'world',paused:true});
  const visibility=()=>instance.postMessage({type:'visibility',visible:!document.hidden});visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{document.removeEventListener('visibilitychange',visibility);worker.current=null;instance.terminate();for(const resolve of pending.current.values())resolve(false);pending.current.clear();};
 },[]);
 const choose=(next:string)=>{
  for(const resolve of pending.current.values())resolve(false);pending.current.clear();
  const id=++generation.current,nextPaused=['ragnaros','onyxia'].includes(next);
  setMode(next);setGame(null);setRun(id);setPaused(nextPaused);setOpen(next!=='arena');setError('');
  worker.current?.postMessage({type:'fixture',generation:id,mode:next,paused:nextPaused});
 };
 const send=(action:any)=>new Promise<boolean>(resolve=>{if(!worker.current){resolve(false);return;}const id=++requestId.current;pending.current.set(id,resolve);worker.current.postMessage({type:'action',generation:generation.current,requestId:id,action});});
 return <main style={{maxWidth:1400,margin:'auto',padding:24}}><h1>全游戏 3D 战斗试玩</h1><p>野外 · 五人本 · 熔火之心 · 竞技场。原版骨骼模型，透视镜头与战斗音效。</p><p>独立试玩，不连接账号或存档。60 级显示职业 T1 套装，低等级使用初始服装；外观保留种族与性别。</p>
  <div className="action-row" style={{margin:'18px 0'}}>{Object.entries({world:'野外战斗',dungeon:'五人副本',mc:'MC 团队战斗',ragnaros:'拉格纳罗斯 · 螺旋熔岩',onyxia:'奥妮克希亚 · 深呼吸',arena:'5v5 竞技场'}).map(([id,name])=><button key={id} onClick={()=>choose(id)}>{name}</button>)}<button disabled={!game} onClick={()=>worker.current?.postMessage({type:'pause',generation:generation.current,paused:!paused})}>{paused?'继续模拟':'暂停模拟'}</button>{mode!=='arena'&&<button disabled={!game} onClick={()=>setOpen(true)}>查看当前战斗</button>}</div>
  {error&&<p role="alert">{error}</p>}{!game&&<p role="status">正在准备战斗…</p>}
  {game&&content&&(mode==='arena'?<ArenaBattle key={run} match={game.match}/>:open&&<Battle key={run} state={game.snapshot.player} data={{...content,...game.snapshot.view}} busy={false} send={send} open={open} onOpenChange={setOpen}/>)}
 </main>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<Preview/>);
import.meta.hot?.dispose(()=>root.unmount());
