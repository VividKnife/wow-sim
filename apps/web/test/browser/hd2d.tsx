import {createNpcMember} from '../../../../packages/game-domain/src/rules/party.js';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
/// <reference types="vite/client" />
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {abilities} from '../../../../packages/game-domain/src/rules/catalog.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import Battle from '../../app/battle';
import '../../app/globals.css';

function fixture(ground='grass',group=true){
 let s:any=createGame('艾琳 · 霜语',283,0);s.level=20;s.learned=abilities.filter(a=>a.requiredLevel<=20).map(a=>a.spellId);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s.location='stormwind';
 if(group)for(const id of ['warrior','priest','rogue','mage'])createNpcMember(s,id);
 s.location='goldshire';
 s.rules=[{spell:10,condition:'enemyCountAtLeast',value:3,enabled:true},{spell:116,condition:'always',value:0,enabled:true}];
 if(group)s.party.find((c:any)=>c.classId===8).rules=[{spell:133,condition:'always',value:0,enabled:true}];
 startCombat(s,group?[636,636,1729]:[299],group);s.combat.ground=ground;
 return s;
}
function Preview(){
 const [run,setRun]=useState(0),[ground,setGround]=useState('grass'),[state,setState]=useState(()=>fixture()),[open,setOpen]=useState(true),[paused,setPaused]=useState(false);
 const current=useRef(state);current.current=state;
 useEffect(()=>{if(paused)return;const id=setInterval(()=>setState((s:any)=>advance(s,s.wallAt+100,{}).state),100);return()=>clearInterval(id);},[paused]);
 const snapshot=projectClientSnapshot(state,view(state));
 return <main style={{padding:'24px',maxWidth:1280,margin:'auto'}}><h1>HD-2D 战斗画面</h1><p>真实战斗引擎驱动的独立预览，不连接账号或存档。关闭战斗面板可切换场景。</p><div className="action-row" style={{margin:'18px 0'}}>
  <label>场景 <GameSelect aria-label="场景" value={ground} onValueChange={nextValue=>{setGround(nextValue);setState(fixture(nextValue));setRun(n=>n+1);setOpen(true);}}>{Object.entries({grass:'林间旷野',dirt:'暮色荒野',cave:'幽深矿洞',deck:'暮港甲板',water:'碧水浅滩'}).map(([value,name])=><GameSelectOption key={value} value={value}>{name}</GameSelectOption>)}</GameSelect></label>
  <button onClick={()=>{setState(fixture(ground));setRun(n=>n+1);setOpen(true);}}>重开五人战斗</button><button onClick={()=>{setState(fixture(ground,false));setRun(n=>n+1);setOpen(true);}}>野外单人战斗</button><button onClick={()=>setOpen(true)}>查看战斗</button><button onClick={()=>setPaused(p=>!p)}>{paused?'继续':'暂停'}模拟</button>
 </div><Battle key={run} state={snapshot.player} data={snapshot.view} busy={false} send={async(action:any)=>{setState(act(current.current,action,current.current.wallAt));return true;}} open={open} onOpenChange={setOpen}/></main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);

