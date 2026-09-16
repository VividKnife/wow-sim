// Isolated preview: real world UI + engine, no user save or network API.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,view} from '../../lib/game/engine.js';
import World from '../../app/world';
import '../../app/globals.css';
function fixture(location='goldshire'){
 let s:any=createGame('地图测试',11,0);s.level=4;s.location='goldshire';s=act(s,{type:'accept',id:62},0);s.location=location;
 s.money=200;s.flightPoints=['stormwind'];return s;
}
function Harness(){
 const [s,setState]=useState(()=>fixture()),[error,setError]=useState('');
 const send=async(action:any)=>{try{setState(act(s,action,s.wallAt));setError('');return true;}catch(e:any){setError(e.message);return false;}};
 return <main className="game-shell"><header className="panel" style={{margin:'20px 0'}}><h2>独立地图测试 · 不连接用户存档</h2><div className="action-row">{[['goldshire','艾尔文夹具'],['sentinel','西部荒野夹具'],['stormwind','暴风城夹具'],['ironforge','信使夹具']].map(([id,name])=><button key={id} onClick={()=>{setState(fixture(id));setError('');}}>{name}</button>)}<button onClick={()=>setState(advance(s,s.wallAt+Math.floor(Math.max(0,(s.activity.endsAt||s.clock)-s.clock)/2)).state)}>前进一半时间</button><button onClick={()=>setState(advance(s,s.wallAt+Math.max(0,(s.activity.endsAt||s.clock)-s.clock)).state)}>抵达目的地</button></div></header><World state={s} data={view(s)} busy={false} send={send}/>{error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
