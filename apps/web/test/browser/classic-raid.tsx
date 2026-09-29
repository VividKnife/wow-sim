import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import GoldRaid from '../../app/gold-raid';
import '../../app/globals.css';
function Preview(){
 const [snapshot,setSnapshot]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[narrow,setNarrow]=useState(false);
 useEffect(()=>{fetch('/api/classic-raid-preview').then(r=>r.json()).then(setSnapshot);},[]);
 const send=async(action:any)=>{setBusy(true);try{const response=await fetch('/api/classic-raid-preview',{method:'POST',body:JSON.stringify(action)}),body=await response.json();if(!response.ok)throw Error(body.error);setSnapshot(body);setError('');return true;}catch(e:any){setError(e.message);return false;}finally{setBusy(false);}};
 return <main style={{maxWidth:narrow?360:1100,margin:'24px auto',padding:12}}><button onClick={()=>setNarrow(!narrow)}>{narrow?'桌面宽度':'窄屏 360px'}</button>{error&&<p role="alert">{error}</p>}{snapshot?<GoldRaid {...snapshot} busy={busy} send={send} onObserve={()=>{}}/>:<p>准备真实招募数据…</p>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
