import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import {recruit,companionSkills} from '../../../../packages/game-domain/src/rules/party.js';
import {createMoltenCoreDemo,startMoltenCoreBoss} from '../../../../packages/game-domain/src/molten-core-demo';
import {arenaView} from '../../../../packages/game-domain/src/rules/arena.js';
import {clientContent} from '../../../../packages/game-domain/src/rules/client-content.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot';
import Battle from '../../app/battle';
import ArenaBattle from '../../app/arena-battle';
import '../../app/globals.css';
import '../../app/arena.css';

const content=clientContent();
function fixture(mode:string):any{
 if(mode==='mc'){const s=startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron').state;s.combat.ground='molten';return s;}
 let s:any=createGame('艾琳 · 霜语',283,0,{classId:8,raceId:1,gender:'female'});
 s.level=20;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 if(mode!=='world')for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['warlock','ranged']])recruit(s,id,{role});
 if(mode==='arena'){
  s=act(s,{type:'arenaPrepare',size:5,mapId:'four-pillars',opponentId:'casters',memberIds:[s.id,...s.party.map((c:any)=>c.id)]},0);
  return act(s,{type:'arenaStart',matchId:s.arena.id,revision:s.arena.planRevision,plan:s.arena.teams[0].plan},0);
 }
 s.location='goldshire';startCombat(s,mode==='world'?[299]:[636,636,1729],mode!=='world');s.combat.ground=mode==='world'?'grass':'cave';return s;
}
function Preview(){
 const [mode,setMode]=useState('world'),[state,setState]=useState(()=>fixture('world')),[open,setOpen]=useState(false),[paused,setPaused]=useState(true),[run,setRun]=useState(0);
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>{if(!document.hidden)setState((s:any)=>advance(s,s.wallAt+100).state);},100);return()=>clearInterval(timer);},[paused]);
 const snapshot=useMemo(()=>projectClientSnapshot(state,view(state)),[state]);
 const choose=(next:string)=>{setMode(next);setState(fixture(next));setRun(v=>v+1);setPaused(false);setOpen(next!=='arena');};
 return <main style={{maxWidth:1400,margin:'auto',padding:24}}><h1>全游戏 3D 战斗试玩</h1><p>野外 · 五人本 · 熔火之心 · 竞技场。原版骨骼模型，透视镜头与战斗音效。</p><p>独立试玩，不连接账号或存档。60 级显示职业 T1 套装，低等级使用初始服装；外观保留种族与性别。</p>
  <div className="action-row" style={{margin:'18px 0'}}>{Object.entries({world:'野外战斗',dungeon:'五人副本',mc:'MC 团队战斗',arena:'5v5 竞技场'}).map(([id,name])=><button key={id} onClick={()=>choose(id)}>{name}</button>)}<button onClick={()=>setPaused(v=>!v)}>{paused?'继续模拟':'暂停模拟'}</button>{mode!=='arena'&&<button onClick={()=>setOpen(true)}>查看当前战斗</button>}</div>
  {mode==='arena'?<ArenaBattle key={run} match={arenaView(state).match}/>:open&&<Battle key={run} state={snapshot.player} data={{...content,...snapshot.view}} busy={false} send={async(action:any)=>{setState((s:any)=>act(s,action,s.wallAt));return true;}} open={open} onOpenChange={setOpen}/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
