import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Rules} from '../../../../packages/game-domain/src/model';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import ClassicGame from '../../app/classic-game';
import {createGame,act,advance,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {addItem,stats} from '../../../../packages/game-domain/src/rules/character.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import '../../app/globals.css';
const content=clientContent();
function Preview(){
 const [s,setState]=useState<Rules>(()=>{const s=createGame('快捷栏测试',37,0,{raceId:5,classId:8});s.id='quickbar-preview';s.level=40;s.learned=[...new Set([...s.learned,20577,3561,11418,5504,587,1459])];s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;addItem(s,17031,10);addItem(s,17032,10);return s;});
 const [panel,setPanel]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setState(s=>advance(s,s.wallAt+1000,{maxTicks:1000}).state),1000);return()=>clearInterval(timer);},[]);
 const snapshot=useMemo(()=>projectClientSnapshot(s,view(s)),[s]);
 return <main className="classic-game-root"><div style={{position:'fixed',top:4,left:'50%',transform:'translateX(-50%)',zIndex:100,display:'flex',gap:8}}><button onClick={()=>setState(current=>{const next=structuredClone(current);next.hp=stats(next).maxHp;startCombat(next,[124,124],true);next.combat!.command={paused:true,orders:[],marks:{}};return next;})}>预览：进入战斗</button><button onClick={()=>setState(current=>({...current,combat:null,cast:null,activity:{type:'idle'}}))}>预览：离开战斗</button></div><ClassicGame state={snapshot.player} data={{...content,...snapshot.view}} busy={false} send={async command=>{try{setState(act(s,command,s.wallAt));setError('');return true;}catch(e){setError(String(e));return false;}}} canLead panel={panel} onPanelChange={setPanel} renderPanel={()=>null} onStyleChange={()=>{}} onObserve={()=>{}} modalBattleOpen={false} overview={null} status={error} utilities={null} activityLabel="快捷技能测试"/></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
