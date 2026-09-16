// Isolated UI verification with the real engine and projected client payload.
// Never reads or writes a user's save; workshop requests are answered in memory.
import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,view,stats} from '../../../../packages/game-domain/src/rules/engine.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {workshopView} from '../../../../packages/game-domain/src/rules/workshop.js';
import {addItem} from '../../../../packages/game-domain/src/rules/character.js';
import World from '../../app/world';
import {money,duration} from '../../app/game-ui';
import '../../app/globals.css';

function fixture(classId=8){
 const s:any=createGame('艾尔文旅人',192,0,{classId,raceId:1});
 s.level=20;s.money=50000;s.location='stormwind';s.visited.push('stormwind');
 s.riding={horse:true};s.mounts=[5656];
 addItem(s,2589,10);addItem(s,2447,5);addItem(s,765,5);addItem(s,117,5);addItem(s,159,5);addItem(s,7073,2);
 const attributes=stats(s);if(!('maxHp' in attributes)||!('maxMana' in attributes))throw new Error('Character stats unavailable');s.hp=attributes.maxHp;s.mana=attributes.maxMana;
 return s;
}
function Harness(){
 const [s,setState]=useState(()=>fixture()),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const current=useRef(s);current.current=s;
 const baseFetch=useRef(window.fetch.bind(window));
 const installed=useRef(false);
 if(!installed.current){
  window.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,window.location.href);
   if(url.pathname==='/api/game/workshop')return new Response(JSON.stringify({...workshopView(current.current,Object.fromEntries(url.searchParams)),contentVersion:clientContent().contentVersion,revision:0}),{headers:{'Content-Type':'application/json'}});
   return baseFetch.current(input,init);
  };installed.current=true;
 }
 const update=(next:any)=>{current.current=next;setState(next);setRevision(n=>n+1);};
 const send=async(action:any)=>{try{update(act(current.current,action,current.current.wallAt));setError('');return true;}catch(e:any){setError(e.message);return false;}};
 const snapshot=projectClientSnapshot(s,view(s));
 return <main className="game-shell" style={{paddingTop:20,paddingBottom:40}}><section className="panel" style={{marginBottom:20}}><div className="section-heading"><div><h2>暴风城体验预览</h2><p>独立内存角色 · 不连接玩家存档</p></div><button onClick={()=>{update(fixture());setError('');}}>重置法师</button><button onClick={()=>{update(fixture(5));setError('');}}>切换牧师</button></div><p data-testid="fixture-status">{s.name} · {money(s.money)} · {s.location} · {s.activity.type} · 背包 {s.bag.length} 格</p><div className="action-row"><button disabled={!s.activity.endsAt} onClick={()=>update(advance(s,s.wallAt+Math.max(0,s.activity.endsAt-s.clock)).state)}>抵达目的地（测试）</button><span>{s.activity.endsAt?`剩余 ${duration(s.activity.endsAt-s.clock)}`:'可以自由探索'}</span></div>{error&&<p role="alert">{error}</p>}</section><World state={snapshot.player} data={{...clientContent(),...snapshot.view}} revision={revision} busy={false} send={send}/></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
