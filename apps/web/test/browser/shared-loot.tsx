import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GroupLoot,GroupLootPopup} from '../../app/group-loot';
import '../../app/globals.css';
function Preview(){
 const [viewer,setViewer]=useState(0),[game,setGame]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(next:number,action?:any){setBusy(true);try{
  const response=await fetch('/api/shared-loot?viewer='+next,{method:action?'POST':'GET',headers:action?{'Content-Type':'application/json'}:{},body:action?JSON.stringify(action):undefined});
  const value=await response.json();if(!response.ok)throw new Error(value.error);setGame(value);setViewer(next);setError('');return true;
 }catch(e){setError(String(e));return false;}finally{setBusy(false);}}
 useEffect(()=>{void load(0);},[]);
 return <main className="game-shell" style={{maxWidth:900,margin:'24px auto',padding:20}}><section className="panel"><h1>共享副本 · 独立分装</h1><p>隔离测试：两名真人分配三件已生成的装备，最多同时显示两件。真实服务器规则和检查点；不连接正式存档。</p><div className="action-row"><button disabled={busy} onClick={()=>load(0)}>查看 Alice</button><button disabled={busy} onClick={()=>load(1)}>查看 Bob</button></div><h2>当前角色：{game?.snapshot.player.name||'加载中'}</h2>{error&&<p role="alert">{error}</p>}</section>{game&&<><GroupLootPopup {...{state:game.snapshot.player,data:{...game.snapshot.view,items:game.itemData},busy,send:(action:any)=>load(viewer,action)} as any}/><GroupLoot {...{state:game.snapshot.player,data:{...game.snapshot.view,items:game.itemData},busy,send:(action:any)=>load(viewer,action)} as any}/><section className="panel"><h2>当前角色的物品</h2><p>本次战斗分得：{game.snapshot.player.lastCombat?.lootGold||0} 铜；钱包：{game.snapshot.player.money} 铜；暴动击杀进度：{game.snapshot.player.quests[387]?.kills[1706]||0}/10</p><p>待领取：{game.snapshot.player.pending.length} 件；测试法杖：{game.snapshot.player.bag.filter((i:any)=>i.id===5201).length} 件</p><button disabled={busy||!game.snapshot.player.pending.length} onClick={()=>load(viewer,{type:'loot'})}>领取自己的物品</button></section></>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
