import React,{useState,useRef,useEffect,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {createMoltenCoreDemo} from '../../../../packages/game-domain/src/molten-core-demo';
import {enterGoldRaid,leaveGoldRaid} from '../../../../packages/game-domain/src/rules/gold-raid.js';
import {act,advance,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import GoldRaid from '../../app/gold-raid';
import Battle from '../../app/battle';
import '../../app/globals.css';
const content=clientContent();
function fixture(){const s=createMoltenCoreDemo().state;s.growthPolicy='player';s.wallAt=Date.now();s.party=[];return s;}
function Harness(){
 const [state,setState]=useState(fixture),[error,setError]=useState(''),[open,setOpen]=useState(false),[paused,setPaused]=useState(true);
 const current=useRef(state);current.current=state;
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>setState(s=>advance(s,s.wallAt+500).state),500);return()=>clearInterval(timer);},[paused]);
 const send=async(action:any)=>{try{let s;if(action.type==='leaveInstance'||action.type==='enterDungeon'){s=structuredClone(current.current);if(action.type==='leaveInstance')leaveGoldRaid(s);else enterGoldRaid(s,action.contentId.replace(/-gold$/,''));}else s=act(current.current,action,current.current.wallAt);current.current=s;setState(s);setError('');return true;}catch(e:any){setError(e.message);return false;}};
 const snapshot=useMemo(()=>projectClientSnapshot(state,view(state)),[state]),props={state:snapshot.player,data:{...content,...snapshot.view},send,busy:false};
 return <main className="game-shell"><div className="panel"><p>独立地图试玩 · 不连接正式存档 · 25人实际战斗</p><button onClick={()=>setPaused(!paused)}>{paused?'继续试玩':'暂停试玩'}</button></div><GoldRaid {...props} onObserve={()=>setOpen(true)}/>{error&&<p role="alert">{error}</p>}{open&&<Battle {...props} open={open} onOpenChange={setOpen}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
