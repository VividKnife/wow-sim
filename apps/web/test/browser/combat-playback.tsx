import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Battle from '../../app/battle';
import LiveDamageMeter from '../../app/live-damage-meter';
import '../../app/globals.css';

function Harness(){
 const [fixture,setFixture]=useState<any>(null),[open,setOpen]=useState(false),[error,setError]=useState('');
 const load=async(reset=false)=>{try{const response=await fetch('/api/fixture',{method:reset?'POST':'GET'});setFixture(await response.json());}catch(e:any){setError(e.message);}};
 useEffect(()=>{void load();const timer=setInterval(()=>{void fetch('/api/fixture').then(r=>r.json()).then(setFixture).catch(e=>setError(e.message));},2000);return()=>clearInterval(timer);},[]);
 return <main className="game-shell"><section className="panel"><h1>单人战斗回放验证</h1><p>模拟在本地预览服务器完成；浏览器通过真实 HTTP 下载回放，仅负责播放。此页面不连接玩家存档。</p><div className="action-row"><button onClick={()=>void load(true)}>新建战斗</button><button onClick={()=>setOpen(true)}>查看战斗</button><button onClick={()=>void load()}>重新连接</button></div><p>已下载回放次数：{fixture?.requests??0}</p>{error&&<p role="alert">{error}</p>}</section>{fixture&&<LiveDamageMeter state={fixture.snapshot.player} data={fixture.snapshot.view} playback={fixture.playback} contentVersion="fixture"/>}{fixture&&<Battle state={fixture.snapshot.player} data={fixture.snapshot.view} playback={fixture.playback} contentVersion="fixture" busy={false} send={async()=>false} open={open} onOpenChange={setOpen}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
