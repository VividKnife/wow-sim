import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Auction from '../../app/auction-house';
import '../../app/globals.css';
function Preview(){
 const [snapshot,setSnapshot]=useState<any>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function send(command?:any){setBusy(true);try{const response=await fetch('/api/auction-preview',command?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)}:{});const value=await response.json();if(!response.ok)throw new Error(value.error);setSnapshot(value);setError('');return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 useEffect(()=>{void send();},[]);
 return <main style={{maxWidth:1180,margin:'36px auto',padding:'0 16px'}}><div style={{display:'flex',gap:16,alignItems:'center',marginBottom:25,fontSize:12,color:'#adab9b'}}><span>独立测试存档</span><button disabled={busy} onClick={()=>send({type:'previewAdvance',ms:30000})}>推进 30 秒</button><button disabled={busy} onClick={()=>send({type:'previewAdvance',ms:3600000})}>推进 1 小时</button></div>{error&&<p role="alert">{error}</p>}{snapshot?<Auction {...snapshot} busy={busy} send={send}/>:<p>正在加载交易规则…</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
