import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ItemTransfer from '../../app/item-transfer';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import '../../app/globals.css';
import '../../app/character.css';
function Harness(){
 const [game,setGame]=useState<any>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/fixture-api').then(r=>r.json()).then(setGame);},[]);
 if(!game)return <p>载入中</p>;
 const send=async(body:any)=>{setBusy(true);const response=await fetch('/fixture-api',{method:'POST',body:JSON.stringify({...body,characterId:game.state.id,requestId:crypto.randomUUID()})});const result=await response.json();setBusy(false);if(!response.ok){setError(result.error);return false;}setError('');setGame(result);return true;};
 return <main style={{maxWidth:620,margin:'32px auto',padding:12}}><h1>队伍物品转移</h1><label>查看角色<GameSelect aria-label="查看角色" value={game.state.id} onValueChange={async nextValue=>setGame(await (await fetch('/fixture-api?characterId='+nextValue)).json())}>{game.roster.map((c:any)=><GameSelectOption key={c.id} value={c.id}>{c.name}</GameSelectOption>)}</GameSelect></label><ItemTransfer key={game.state.id} state={game.state} data={{...clientContent(),...game.data}} busy={busy} send={send} roster={game.roster}/>{error&&<p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
