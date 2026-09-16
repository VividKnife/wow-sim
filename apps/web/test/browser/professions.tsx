/// <reference types="vite/client" />
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,view,stats} from '../../lib/game/engine.js';
import {addItem} from '../../lib/game/character.js';
import Character from '../../app/character';
import Strategy from '../../app/strategy';
import {Gathering} from '../../app/professions';
import '../../app/globals.css';
function fixture(){let s:ReturnType<typeof createGame>=createGame('旅行工匠',192,0);s.level=20;s.money=50000;s.location='stormwind';for(const id of ['alchemy','enchanting','herbalism','mining','skinning','fishing'])s=act(s,{type:'learnProfession',id},0);addItem(s,2447,5);addItem(s,765,5);addItem(s,5207,2);addItem(s,907420,2);addItem(s,2589,10);const st=stats(s) as ReturnType<typeof stats>&{maxHp:number;maxMana:number};s.hp=st.maxHp;s.mana=st.maxMana;return s;}
function Harness(){const [s,setState]=useState(fixture),[screen,setScreen]=useState('角色'),[error,setError]=useState('');const current=useRef(s);useEffect(()=>{current.current=s;},[s]);
 useEffect(()=>{const timer=setInterval(()=>setState((s:ReturnType<typeof createGame>)=>advance(s,s.wallAt+1000).state),1000);return()=>clearInterval(timer);},[]);
 const send=async(a:{type:string;[key:string]:unknown})=>{try{const next=act(current.current,a,current.current.wallAt);setState(next);current.current=next;setError('');return true;}catch(e:unknown){setError(e instanceof Error?e.message:String(e));return false;}};
 const props={state:s,data:view(s),busy:false,send};return <main className="game-shell"><section className="panel"><h1>生活职业与经济 · 独立验证</h1><p>本页面仅使用内存测试角色，不连接用户存档。</p><div className="action-row">{['角色','策略','采集'].map(t=><button key={t} onClick={()=>setScreen(t)}>{t}</button>)}<button onClick={()=>setState((s:ReturnType<typeof createGame>)=>({...s,location:'northwood',activity:{type:'idle'}}))}>测试地点：林地</button><button onClick={()=>setState((s:ReturnType<typeof createGame>)=>({...s,location:'stormwind',activity:{type:'idle'}}))}>测试地点：银行</button></div><p>余额 {s.money} 铜 · 背包 {s.bag.length} 格 · {s.activity.type}</p></section>{screen==='角色'?<Character {...props}/>:screen==='策略'?<Strategy {...props}/>:<Gathering {...props}/>} {error&&<p role="alert">{error}</p>}</main>;}
const root=import.meta.hot?.data.root||createRoot(document.getElementById('root')!);if(import.meta.hot)import.meta.hot.data.root=root;root.render(<Harness/>);
