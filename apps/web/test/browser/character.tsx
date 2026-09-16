// Real engine fixture; does not connect to the API or modify a saved character.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {addItem} from '../../../../packages/game-domain/src/rules/character.js';
import Character from '../../app/character';
import '../../app/globals.css';

function fixture(full=false){
 const state=createGame('霜语',283,0);state.level=18;state.money=12345;
 const derived=stats(state) as ReturnType<typeof stats>&{maxHp:number;maxMana:number};
 state.hp=derived.maxHp;state.mana=derived.maxMana;
 for(const id of [2070,159,4496,5571,6477,118,2455,2589,6948,7509,9513,1270])addItem(state,id,id===2070||id===159?5:1);
 if(full)for(let i=0;i<24;i++)addItem(state,6477);
 return state;
}
function Harness(){
 const [state,setState]=useState(()=>fixture()),[error,setError]=useState('');
 const send=async(action:Parameters<typeof act>[1])=>{try{setState(act(state,action,state.wallAt));setError('');return true;}catch(error){setError((error as Error).message);return false;}};
 return <main className="game-shell" style={{paddingTop:24,paddingBottom:32}}><div className="action-row" style={{margin:'0 0 22px'}}><button onClick={()=>{setState(fixture());setError('');}}>普通背包夹具</button><button onClick={()=>{setState(fixture(true));setError('');}}>满包与待拾取夹具</button><small>独立测试 · 不连接存档</small></div><Character state={state} data={view(state)} busy={false} send={send}/>{error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
