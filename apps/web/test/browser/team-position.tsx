import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import CombatPositionOrder from '../../app/combat-position-order';
import '../../app/globals.css';
import '../../app/combat-command.css';

function Preview(){
 const [game,setGame]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(body?:any){setBusy(true);setError('');try{const response=await fetch('/api/team-position',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw new Error(result.error);setGame(result);}catch(e){setError(String(e));}finally{setBusy(false);}}
 useEffect(()=>{void call();},[]);
 const s=game?.snapshot.player,d=game?.snapshot.view;
 return <main style={{maxWidth:600,margin:'24px auto',padding:16}}><h1>团队站位 · 服务器执行测试</h1><p>独立测试场景，使用真实服务器 Worker。按钮推进模拟时间；不连接正式存档，不作为副本通关证据。</p>{error&&<p role="alert">{error}</p>}{s&&<><p>模拟时间：{(s.clock/1000).toFixed(1)} 秒</p><div className="command-position-actions"><button disabled={busy} onClick={()=>call({advanceMs:1000})}>推进1秒</button><button disabled={busy} onClick={()=>call({advanceMs:10000})}>推进10秒</button></div><CombatPositionOrder battle={s.combat} view={d.combatCommand} memberId={s.id} locked={busy} request={(order,extra)=>call({action:{type:'combatCommand',encounterId:s.combat.id,order,...extra}})}/></>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
