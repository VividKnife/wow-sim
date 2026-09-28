import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GoldAuctionPanel} from '../../app/gold-auction';
import {ItemTooltip} from '../../app/game-ui';
import '../../app/globals.css';
function Preview(){
 const [snapshot,setSnapshot]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[narrow,setNarrow]=useState(false);
 useEffect(()=>{fetch('/api/auction-preview').then(r=>r.json()).then(setSnapshot);},[]);
 const send=async(action:any)=>{setBusy(true);try{const r=await fetch('/api/auction-preview',{method:'POST',body:JSON.stringify(action)}),body=await r.json();if(!r.ok)throw Error(body.error);setSnapshot(body);setError('');return true;}catch(e:any){setError(e.message);return false;}finally{setBusy(false);}};
 return <main style={{maxWidth:1050,margin:'32px auto',padding:16}}><header style={{marginBottom:20}}><h1 style={{color:'#ddc68d',fontSize:24}}>金团竞拍与分阶段 BIS</h1><p style={{color:'#a99d87',fontSize:12}}>独立内存预览 · 点击推进 4 秒检查 NPC 加价和落槌</p><div style={{display:'flex',gap:16,marginTop:12}}><button disabled={busy} onClick={()=>send({type:'previewStep'})}>推进 4 秒</button><button disabled={busy} onClick={()=>send({type:'previewReset'})}>重置预览</button><button onClick={()=>setNarrow(!narrow)}>{narrow?'桌面宽度':'窄屏 360px'}</button></div></header>{error&&<p role="alert">{error}</p>}{snapshot&&<div style={{display:'flex',gap:24,alignItems:'flex-start',flexWrap:'wrap'}}><div style={{width:narrow?360:640,maxWidth:'100%'}}><GoldAuctionPanel {...snapshot} busy={busy} send={send}/></div><aside style={{width:340,maxWidth:'100%',display:'grid',gap:16}}><ItemTooltip item={snapshot.data.items[18814]}/><ItemTooltip item={snapshot.data.items[17103]}/></aside></div>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
