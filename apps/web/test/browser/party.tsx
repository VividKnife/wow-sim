import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import Party from '../../app/party';
import Character from '../../app/character';
import '../../app/globals.css';
function ready(){const s=createGame('盾卫',123,0,{classId:1});s.level=18;s.location='stormwind';s.money=300000;return act(s,{type:'sync'},0);}
function Harness(){
 const [state,setState]=useState(ready),[selected,setSelected]=useState('player'),[page,setPage]=useState('party'),[error,setError]=useState('');
 const member=state.party.find((c:any)=>c.id===selected);
 const actor=member?{...createGame(member.name,123,0,{classId:member.classId,raceId:member.raceId}),...member,location:state.location,bag:member.bag||[],party:[],money:0}:state;
 const send=async(action:any)=>{try{if(member){const next=act(actor,action,0);setState({...state,party:state.party.map((c:any)=>c.id===selected?next:c)});}else setState(act(state,action,0));setError('');return true;}catch(e){setError((e as Error).message);return false;}};
 const projected=projectClientSnapshot(actor,view(actor));
 const props={state:projected.player,data:{...clientContent(),...projected.view},busy:false,send};
 return <main className="game-shell" style={{padding:24}}><section className="panel"><p>独立队伍测试 · 不修改存档</p><button onClick={()=>{setSelected('player');setPage('party');}}>队伍</button><button onClick={()=>setPage('character')}>角色</button><GameSelect aria-label="查看角色" value={selected} onValueChange={nextValue=>{setSelected(nextValue);setPage('character');}}>{[state,...state.party].map((c:any)=><GameSelectOption key={c.id} value={c.id}>{c.name}</GameSelectOption>)}</GameSelect></section>{page==='party'?<Party {...props}/>:<Character key={selected} {...props}/>}<p role="alert">{error}</p></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
