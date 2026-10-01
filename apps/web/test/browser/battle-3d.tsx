import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Battle from '../../app/battle';
import ArenaBattle from '../../app/arena-battle';
import InstanceScene from '../../app/instance-scene';
import {GameSelect,GameSelectOption} from '../../components/ui/game-select';
import {useLowEffects} from '../../lib/use-low-effects';
import '../../app/globals.css';
import '../../app/arena.css';

const initial=new URLSearchParams(location.search),initialMode=initial.get('boss')||'world';
function Preview(){
 const [mode,setMode]=useState(initialMode),[stage,setStage]=useState(initial.get('stage')||'battle'),[raidBosses,setRaidBosses]=useState<{id:string;name:string;subtitle:string}[]>([]);
 const [game,setGame]=useState<any>(null),[content,setContent]=useState<any>(null),[open,setOpen]=useState(initialMode!=='world'),[paused,setPaused]=useState(true),[run,setRun]=useState(0),[error,setError]=useState('');
 const [lowEffects,setLowEffects]=useLowEffects(),[showCommands,setShowCommands]=useState(false);
 const worker=useRef<Worker|null>(null),generation=useRef(0),requestId=useRef(0),pending=useRef(new Map<number,(ok:boolean)=>void>());
 useEffect(()=>{
  const instance=new Worker(new URL('./battle-3d.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
  instance.onmessage=({data})=>{
   if(data.type==='content'){setContent(data.content);setRaidBosses(data.raidBosses);return;}
   if(data.generation!==generation.current)return;
   if(data.type==='snapshot'){setGame(data);setPaused(data.paused);}
   if(data.type==='error'){setError(data.error);setPaused(true);for(const resolve of pending.current.values())resolve(false);pending.current.clear();}
   if(data.requestId){pending.current.get(data.requestId)?.(data.type==='snapshot');pending.current.delete(data.requestId);}
  };
  instance.onerror=event=>{setError(event.message);setPaused(true);for(const resolve of pending.current.values())resolve(false);pending.current.clear();};
  instance.postMessage({type:'fixture',generation:0,mode:initialMode,stage:initial.get('stage')||'battle',paused:true});
  const visibility=()=>instance.postMessage({type:'visibility',visible:!document.hidden});visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{document.removeEventListener('visibilitychange',visibility);worker.current=null;instance.terminate();for(const resolve of pending.current.values())resolve(false);pending.current.clear();};
 },[]);
 const choose=(next:string,nextStage=stage)=>{
  for(const resolve of pending.current.values())resolve(false);pending.current.clear();
  const id=++generation.current;
  setMode(next);setStage(nextStage);setGame(null);setRun(id);setPaused(true);setOpen(next!=='arena');setError('');
  const query=new URLSearchParams({boss:next,stage:nextStage});history.replaceState(null,'',`?${query}`);
  worker.current?.postMessage({type:'fixture',generation:id,mode:next,stage:nextStage,paused:true});
 };
 const send=(action:any)=>new Promise<boolean>(resolve=>{if(!worker.current){resolve(false);return;}const id=++requestId.current;pending.current.set(id,resolve);worker.current.postMessage({type:'action',generation:generation.current,requestId:id,action});});
 const boss=raidBosses.find(b=>b.id===mode),preparation=game?.snapshot.view.instanceScene;
 const area=game?.snapshot.player.combat?.area||preparation?.area;
 return <main style={{maxWidth:1600,margin:'auto',padding:24}}><h1>团本首领战场验收</h1><p>熔火之心 10 位首领与奥妮克希亚。战前集结和实战使用正式游戏场景，支持检查房间边界、站位和技能范围。</p><p>独立试玩，不连接账号或存档。切换场景后默认暂停，点击继续模拟可观察战斗。</p>
  <div className="action-row" style={{margin:'18px 0',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
   <label>团本首领<GameSelect aria-label="团本首领" value={boss?.id||''} onValueChange={value=>choose(value,'battle')}><GameSelectOption value="" disabled>选择首领</GameSelectOption>{raidBosses.map(b=><GameSelectOption key={b.id} value={b.id}>{b.name} · {b.subtitle}</GameSelectOption>)}</GameSelect></label>
   {boss&&<label>场景阶段<GameSelect aria-label="场景阶段" value={stage} onValueChange={value=>choose(mode,value)}><GameSelectOption value="preparation">战前集结</GameSelectOption><GameSelectOption value="battle">首领实战</GameSelectOption>{mode==='onyxia'&&<GameSelectOption value="mechanic">深呼吸预警</GameSelectOption>}</GameSelect></label>}
   {boss&&<label><input type="checkbox" checked={showCommands} onChange={e=>setShowCommands(e.target.checked)}/>显示战斗指挥</label>}
   <label><input type="checkbox" checked={lowEffects} onChange={e=>setLowEffects(e.target.checked)}/>简化特效</label>
   <button disabled={!game} onClick={()=>worker.current?.postMessage({type:'pause',generation:generation.current,paused:!paused})}>{paused?'继续模拟':'暂停模拟'}</button>
   {Object.entries({world:'野外战斗',dungeon:'五人副本',arena:'5v5 竞技场'}).map(([id,name])=><button key={id} onClick={()=>choose(id,'battle')}>{name}</button>)}
   {!boss&&mode!=='arena'&&<button disabled={!game} onClick={()=>setOpen(true)}>查看当前战斗</button>}
  </div>
  {error&&<p role="alert">{error}</p>}{!game&&<p role="status">正在准备战斗…</p>}
  {boss&&area&&<p data-testid="raid-room-summary">{area.name} · {area.boundary?.length} 个边界顶点 · 房间 {area.id} · {paused?'模拟已暂停':'模拟中'}</p>}
  {game&&content&&(mode==='arena'?<ArenaBattle key={run} match={game.match}/>:boss&&preparation?<InstanceScene key={run} scene={preparation} playerId={game.snapshot.player.id} skills={content.skills||[]} active/>:open&&<Battle key={run} embedded={!!boss} uiHidden={!!boss&&!showCommands} state={game.snapshot.player} data={{...content,...game.snapshot.view}} busy={false} send={send} open={open} onOpenChange={setOpen}/>)}
 </main>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<Preview/>);
import.meta.hot?.dispose(()=>root.unmount());
