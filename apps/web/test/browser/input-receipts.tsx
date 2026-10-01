import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import InputProgress from '../../app/input-progress';
import {createInputReceiptTracker,inputReceiptPending} from '../../lib/input-receipts.js';
import '../../app/globals.css';
function Preview(){
 const [game,setGame]=useState<any>(null),[busy,setBusy]=useState(false),[result,setResult]=useState('尚未提交指令'),[waiting,setWaiting]=useState(false);
 const tracker=useRef(createInputReceiptTracker());
 async function call(operation?:string){setBusy(true);try{
  const response=await fetch('/api/input-receipts',{method:operation?'POST':'GET',headers:operation?{'Content-Type':'application/json'}:{},body:operation?JSON.stringify({operation}):undefined});
  const value=await response.json();if(!response.ok)throw new Error(value.error);
  setGame(value);tracker.current.observe(value);
  if(value.commandReceipt){setWaiting(inputReceiptPending(value.commandReceipt));setResult('等待服务器确认');const promise=tracker.current.wait(value.commandReceipt,value.execution);tracker.current.observe(value);
   void promise.then(()=>setResult(value.commandReceipt.confirmation==='applied'?'停火指令已执行，随定期检查点保存':'暂停指令已执行，结果已保存'),(error:unknown)=>setResult(error instanceof Error?error.message:String(error))).finally(()=>setWaiting(false));}
 }catch(error){setResult(String(error));}finally{setBusy(false);}}
 useEffect(()=>{void call();return()=>tracker.current.cancel();},[]);
 return <main className="game-shell" style={{maxWidth:700,margin:'32px auto',padding:20}}><section className="panel"><h1>排队指令 · 回执测试</h1><p>使用服务器规则实例与内存事务。手动推进用于稳定检查应用与保存的回执；此页面不是副本通关或真实容量测试。</p><InputProgress execution={game?.execution} waiting={waiting}/><p aria-label="指令结果">{result}</p><p>模拟时间：{game?.snapshot.player.clock??0}ms；待执行指令：{game?.execution.pendingInputs??0}；检查点次数：{game?.checkpointCount??0}</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button disabled={busy||waiting} onClick={()=>call('order')}>立即停火</button><button disabled={busy||waiting} onClick={()=>call('queue')}>提交延迟暂停</button><button disabled={busy||!game?.execution.pendingInputs} onClick={()=>call('advance')}>推进到执行时点</button><button disabled={busy||!game?.execution.clientSequence} onClick={()=>call('commit')}>提交检查点</button></div><p>战斗暂停：{game?.snapshot.player.combat?.command?.paused?'是':'否'}</p></section></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
