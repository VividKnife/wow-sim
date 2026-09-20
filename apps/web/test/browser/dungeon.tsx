/// <reference types="vite/client" />
// Isolated browser harness. Uses the real engine and components; no API or saved user data.
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {dungeonRoute,enterDungeon} from '../../../../packages/game-domain/src/rules/dungeon.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {abilities} from '../../../../packages/game-domain/src/rules/catalog.js';
import {addItem} from '../../../../packages/game-domain/src/rules/character.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import DungeonPage from '../../app/dungeon-page';
import {recruitForTest} from '../support/party-fixture.mjs';
import Battle from '../../app/battle';
import Party from '../../app/party';
import Escort from '../../app/escort';
import '../../app/globals.css';

function fixture(scenario:string){
 let s:any=createGame('测试法师',283,0);s.level=18;s.learned=abilities.filter(a=>a.requiredLevel<=18).map(a=>a.spellId);const attributes:any=stats(s);s.hp=attributes.maxHp;s.mana=attributes.maxMana;
 for(const id of ['warrior','priest','rogue','mage'])s=recruitForTest(s,{type:'recruit',id},0);
 addItem(s,1113,20);addItem(s,2288,20);s.location='deadmines';
 if(scenario==='outdoor'){s.location='lighthouse';return act(s,{type:'hunt',id:391},0);}
 if(scenario==='escort'||scenario==='escort-fight'){
  s.location='sentinel';s.quests[155]={kills:{},event:false,acceptedAt:0,expiresAt:0};
  if(scenario==='escort-fight'){s=act(s,{type:'escortStart'},0);for(let i=0;!s.combat&&s.escort&&i<400;i++)s=advance(s,s.wallAt+1000).state;}
  return s;
 }
 if(scenario==='stockades'){s.level=26;s.location='stockades';s.quests[387]={kills:{},event:false};s.quests[391]={kills:{},event:false};enterDungeon(s,'stockades');return s;}
 if(scenario!=='entry')enterDungeon(s);
 if(scenario==='powder'){s.dungeon.cursor=dungeonRoute('deadmines').findIndex((e:any)=>e.id==='dm-gunpowder');for(const guid of dungeonRoute('deadmines')[s.dungeon.cursor].sourceGuids)s.dungeon.defeated[guid]=true;}
 if(scenario==='cannon'){s.dungeon.cursor=dungeonRoute('deadmines').findIndex((e:any)=>e.id==='dm-cannon');addItem(s,5397);}
 if(scenario==='recovery'){s.hp=0;s.activity={type:'dead'};s.party.find((c:any)=>c.classId===5).mana=0;}
 return s;
}
function Harness(){
 const [s,setState]=useState(()=>fixture('entry')),[open,setOpen]=useState(false),[error,setError]=useState('');
 const current=useRef(s);current.current=s;const key=useRef<string|null>(null);
 useEffect(()=>{const timer=setInterval(()=>setState((s:any)=>advance(s,s.wallAt+500,{}).state),500);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const next=s.combat?`${s.combat.runId}:${s.combat.startedAt}`:null;if(next&&next!==key.current)setOpen(true);key.current=next;},[s.combat?.startedAt,!!s.combat]);
 const send=async(action:any)=>{try{const next=act(current.current,action,current.current.wallAt);current.current=next;setState(next);setError('');return true;}catch(e:any){setError(e.message);return false;}};
 const snapshot=projectClientSnapshot(s,view(s)),props={state:snapshot.player,data:{...clientContent(),...snapshot.view},busy:false,send};
 return <main className="game-shell"><header className="panel" style={{margin:'20px 0'}}><h2>独立测试角色 · 不连接用户存档</h2><p>18 级与补给为测试夹具；每场战斗使用真实引擎。此页面不代表自然升级通关。</p><div className="action-row">{[['entry','手册'],['stockades','监狱冒险'],['map','矿井地图'],['powder','火药箱'],['cannon','火炮'],['recovery','队长倒下'],['outdoor','野外小队'],['escort-fight','Escort battle'],['escort','护送']].map(([id,name])=><button key={id} onClick={()=>{setState(fixture(id));setOpen(false);setError('');key.current=null;}}>{name}夹具</button>)}</div></header><Escort {...props}/>{['lighthouse','sentinel','moonbrook'].includes(s.location)?<Party {...props}/>:<DungeonPage {...props} onOpenParty={()=>setError('队伍管理入口已触发')} onConfigure={()=>setError('配置入口已触发')}/>} {(s.combat||s.lastCombat)&&<><button onClick={()=>setOpen(true)}>查看测试战斗</button><Battle {...props} open={open} onOpenChange={setOpen}/></>}{error&&<p role="alert">{error}</p>}</main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Harness/>);
