// Real engine fixture; never reads or writes saved characters.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {classDefinitions} from '../../../../packages/game-domain/src/rules/catalog.js';
import TalentTree from '../../app/talent-tree';
import PvpConfiguration from '../../app/pvp-configuration';
import '../../app/globals.css';
import '../../app/arena.css';
function fixture(classId=1,level=60){const definition=classDefinitions.find(c=>c.id===classId)!;const s=createGame('天赋研习',283,0,{classId,raceId:definition.races[0]});s.level=level;s.money=100000;s.location=classId===7?'orgrimmar':'stormwind';return s;}
function Preview(){
 const [state,setState]=useState(()=>fixture()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState('adventure');
 const data=view(state),send=async(action:Parameters<typeof act>[1])=>{setBusy(true);try{await new Promise(resolve=>setTimeout(resolve,100));setState(s=>act(s,action,s.wallAt));setError('');return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}};
 const used=Object.values(state.talents).reduce<number>((sum,n)=>sum+Number(n),0);
 return <main style={{maxWidth:960,margin:'24px auto',padding:12}}><nav className="filterbar" aria-label="预览场景" style={{marginBottom:18}}>{classDefinitions.map(c=><button key={c.id} onClick={()=>{setState(fixture(c.id));setError('');}}>{c.name}</button>)}<button onClick={()=>setState(fixture(state.classId,9))}>9 级无点数</button><button onClick={()=>setMode(mode==='adventure'?'pvp':'adventure')}>{mode==='adventure'?'PvP 预览':'冒险天赋'}</button><button onClick={()=>{let next=fixture(state.classId);for(let i=0;i<13;i++){const d=view(next),first=d.talentTrees[0];const node=d.talents.find(t=>t.tree===first.id&&t.canLearn);if(node)next=act(next,{type:'talent',id:node.id},next.wallAt);}setState(next);}}>示例加点</button></nav>
 {mode==='adventure'?<TalentTree key={state.classId} title={`${data.className}天赋`} trees={data.talentTrees} nodes={data.talents} available={Math.max(0,state.level-9-used)} busy={busy} onLearn={id=>send({type:'talent',id})} actions={<><button onClick={()=>setState(fixture(state.classId))}>清空测试加点</button><small>独立预览，不连接存档。</small></>}/>:<PvpConfiguration state={state} data={data} busy={busy} send={send}/>}
 {error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('mobile')?<iframe title="390 像素移动端预览" src="/talents.html" style={{display:'block',width:390,height:844,border:0,margin:'16px auto'}}/>:<Preview/>);
