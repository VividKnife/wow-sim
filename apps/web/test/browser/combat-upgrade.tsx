/// <reference types="vite/client" />
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {abilities} from '../../../../packages/game-domain/src/rules/catalog.js';
import Battle from '../../app/battle';
import Strategy from '../../app/strategy';
import '../../app/globals.css';
function fixture(group=true){
 let s:any=createGame('测试法师',283,0);s.level=20;s.learned=abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId);const st:any=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);
 s.rules=[{spell:10,condition:'enemyCountAtLeast',value:3,enabled:true},{spell:116,condition:'always',value:0,enabled:true}];
 s.party.find((c:any)=>c.classId===8).rules=[{spell:133,condition:'always',value:0,enabled:true}];
 startCombat(s,group?[636,636,1729]:[299],group);return s;
}
function Harness(){
 const [s,setState]=useState(()=>fixture()),[open,setOpen]=useState(false),[paused,setPaused]=useState(false),[error,setError]=useState('');const current=useRef(s);current.current=s;
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>setState((s:any)=>advance(s,s.wallAt+250,{}).state),250);return()=>clearInterval(timer);},[paused]);
 const send=async(action:any)=>{try{const next=act(current.current,action,current.current.wallAt);setState(next);current.current=next;setError('');return true;}catch(e:any){setError(e.message);return false;}};
 const props={state:s,data:view(s),busy:false,send};
 return <main className="game-shell"><section className="panel"><h1>战斗升级 · 独立验证</h1><p>20 级、已学技能及群怪为测试夹具，不连接用户存档。战斗使用真实引擎。</p><div className="action-row"><button onClick={()=>{setState(fixture());setOpen(true);}}>重置五人群怪</button><button onClick={()=>{setState(fixture(false));setOpen(true);}}>重置野外单怪</button><button onClick={()=>setOpen(true)}>查看战斗</button><button onClick={()=>setPaused(!paused)}>{paused?'继续模拟':'暂停模拟'}</button></div></section><Strategy {...props}/><Battle {...props} open={open} onOpenChange={setOpen}/>{error&&<p role="alert">{error}</p>}</main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Harness/>);
