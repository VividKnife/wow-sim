import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {stats,addItem} from '../../../../packages/game-domain/src/rules/character.js';
import {companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import {queueGroupLoot} from '../../../../packages/game-domain/src/rules/group-loot.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import Party from '../../app/party';
import Dungeon from '../../app/dungeon';
import {Button} from '../../components/ui/button';
import '../../app/globals.css';
const storage='npc-world-preview-v2';
function initial(){
 let s:any=createGame('暮色旅人',1729,0);s.id='npc-world-preview';s.level=24;s.location='deadmines';s.learned=companionSkills(s);s.money=1000000;
 for(const [id,role] of [['warrior','tank'],['priest','healer']])s=act(s,{type:'recruit',id,role},0);
 const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;addItem(s,1113,100);addItem(s,2288,100);
 return s;
}
function Harness(){
 const [state,setState]=useState<any>(()=>{try{return JSON.parse(localStorage.getItem(storage)||'null')||initial();}catch{return initial();}}),[error,setError]=useState('');
 const latest=useRef(state);latest.current=state;
 const commit=(next:any)=>{latest.current=next;setState(next);localStorage.setItem(storage,JSON.stringify(next));};
 useEffect(()=>{const timer=setInterval(()=>{const s=latest.current;try{commit(advance(s,s.wallAt+500).state);}catch(e){setError((e as Error).message);}},500);return()=>clearInterval(timer);},[]);
 const send=async(command:any)=>{try{const before=latest.current;let next=act(before,command,before.wallAt);if(command.type==='enterDungeon')next.previewOwned=before.party;if(command.type==='leaveDungeon'){next.party=next.previewOwned;delete next.previewOwned;}commit(next);setError('');return true;}catch(e){setError((e as Error).message);return false;}};
 const snapshot=projectClientSnapshot(state,view(state)),props={state:snapshot.player,data:{...clientContent(),...snapshot.view},busy:false,send};
 return <main className="game-shell" style={{maxWidth:1120,margin:'auto',padding:'20px 12px'}}><section className="panel"><span className="eyebrow">独立试玩 · 浏览器内存档</span><h1>冒险者大厅</h1><p>24级法师与两位自有队友。不会连接或修改正式角色；刷新保留本页体验。</p><div className="action-row"><Button variant="outline" onClick={()=>{commit(initial());setError('');}}>重置试玩</Button>{!state.dungeon&&state.npcWorld&&<Button variant="outline" onClick={()=>commit(advance(latest.current,latest.current.wallAt+300000).state)}>试玩：快进5分钟</Button>}{!state.dungeon&&<Button variant="outline" disabled={!state.npcWorld} onClick={()=>{const s=structuredClone(latest.current);s.wallAt+=2400000;s.level=Math.min(60,s.level+1);commit(act(s,{type:'npcVisit'},s.wallAt));}}>模拟成长40分钟</Button>}{state.dungeon&&<Button variant="outline" disabled={!!state.combat} onClick={()=>{const s=structuredClone(latest.current);queueGroupLoot(s,5191,1);commit(s);}}>生成真实分装测试掉落</Button>}</div></section>{error&&<p role="alert" className="panel">{error}</p>}{!state.dungeon&&<Party {...props}/>}<Dungeon {...props}/></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
