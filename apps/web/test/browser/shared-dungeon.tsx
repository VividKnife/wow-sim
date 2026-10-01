import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dungeon from '../../app/dungeon';
import {GroupLootPopup} from '../../app/group-loot';
import '../../app/globals.css';
function Preview(){
 const [viewer,setViewer]=useState(0),[game,setGame]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(next:number,action?:any){setBusy(true);try{
  const response=await fetch('/api/shared-dungeon?viewer='+next,{method:action?'POST':'GET',headers:action?{'Content-Type':'application/json'}:{},body:action?JSON.stringify(action):undefined});
  const value=await response.json();if(!response.ok)throw new Error(value.error);setGame(value);setViewer(next);setError('');return true;
 }catch(e){setError(String(e));return false;}finally{setBusy(false);}}
 useEffect(()=>{void load(0);},[]);
 const props=game&&{state:game.snapshot.player,data:{...game.snapshot.view,items:game.itemData},busy,send:(action:any)=>load(viewer,action)};
 return <main className="game-shell" style={{maxWidth:1100,margin:'24px auto',padding:20}}>
  <section className="panel"><h1>共享副本 · 队长推进</h1><p>隔离测试：Alice 是房间根角色，Bob 是队长，另有三名 NPC。真实规则与检查点；手动测试时钟，不连接正式存档。</p>
   <div className="action-row"><button disabled={busy} onClick={()=>load(0)}>查看 Alice</button><button disabled={busy} onClick={()=>load(1)}>查看 Bob</button><button disabled={busy||!game} onClick={()=>load(viewer,{type:'previewAdvance'})}>推进 10 秒（测试）</button></div>
   <h2>当前角色：{game?.snapshot.player.name||'加载中'}</h2>{game&&<p>战斗：{game.snapshot.player.combat?'进行中':'未开始或已结束'} · 路线进度：{game.snapshot.view.dungeon.progress}/{game.snapshot.view.dungeon.total} · 模拟时间：{game.snapshot.player.clock} 毫秒</p>}{error&&<p role="alert">{error}</p>}
  </section>{props&&<><GroupLootPopup {...props as any}/><Dungeon {...props as any}/></>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
