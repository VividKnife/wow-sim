import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import Character from '../../app/character';
import LocalNpcs from '../../app/local-npcs';
import '../../app/globals.css';
type FixtureState=ReturnType<typeof createGame>&{pet?:{name:string};cast?:{taming?:boolean}};
function fixture():FixtureState{const s=createGame('猎人驯服测试',7,0,{classId:3,raceId:2});s.level=10;s.money=100000;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;}
function Harness(){const [s,set]=useState(fixture),[error,setError]=useState('');const snap=projectClientSnapshot(s,view(s));const send=async(a:any)=>{try{set(act(s,a,s.wallAt));setError('');return true;}catch(e:any){setError(e.message);return false;}};const props={state:snap.player,data:{...clientContent(),...snap.view},busy:false,send};return <main className="game-shell"><h1>10级猎人 · 独立真实引擎测试</h1><button onClick={()=>set(advance(s,s.wallAt+25000).state)}>推进25秒</button><p>宠物：{s.pet?.name||'无'} · 引导：{s.cast?.taming?'驯服中':'无'}</p><LocalNpcs {...props}/><Character {...props}/>{error&&<p role="alert">{error}</p>}</main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
