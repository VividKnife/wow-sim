// Isolated real-engine UI fixture; never reads or writes player saves.
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {addItem,stats} from '../../../../packages/game-domain/src/rules/character.js';
import Character from '../../app/character';
import ActivityProgress from '../../app/activity-progress';
import '../../app/globals.css';

function fixture(){
 const s=createGame('生活技能测试',37,Date.now());s.level=20;s.location='goldshire';s.learned.push(5504,587,3561,1459);const st=stats(s);s.mana='maxMana' in st?st.maxMana:0;s.hp=50;
 for(const id of [17031,2454,118,2455,117,159])addItem(s,id,2);
 return s;
}
function Harness(){
 const [state,setState]=useState(fixture),[error,setError]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setState(s=>advance(s,Date.now(),{}).state),500);return()=>clearInterval(timer);},[]);
 const send=async(action:Parameters<typeof act>[1])=>{try{setState(act(state,action,Date.now()));setError('');return true;}catch(e){setError((e as Error).message);return false;}};
 const d:any=view(state);
 return <main className="game-shell"><div className="action-row"><button onClick={()=>setState(fixture())}>重置测试角色</button><button onClick={()=>send({type:'stop'})}>取消施法 / 停止恢复</button><span>位置：{d.location.name} · 力量 {d.stats.str} · 当前活动 {state.activity.type}</span></div><ActivityProgress state={state} data={d}/><Character state={state} data={d} busy={false} send={send}/>{error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
