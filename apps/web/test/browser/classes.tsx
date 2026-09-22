import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
/// <reference types="vite/client" />
// Real engine fixture; does not connect to the API or modify a saved character.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,act,advance,stats,view} from '../../../../packages/game-domain/src/rules/engine.js';
import {spells} from '../../../../packages/game-domain/src/rules/catalog.js';
import {addItem} from '../../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';
import Character from '../../app/character';
import Party from '../../app/party';
import Battle from '../../app/battle';
import {classOptions,racesForClass} from '../../app/class-options.js';
import '../../app/globals.css';

function fixture(classId=8,raceId=racesForClass(classId)[0].id){
 const state:any=createGame(`测试${classOptions.find(option=>option.id===classId)?.name||'角色'}`,283,0,{classId,raceId});
 state.level=60;state.money=100000000;
 const derived:any=stats(state);state.hp=derived.maxHp;
 if(derived.maxMana>0)state.mana=derived.maxMana;
 if(classId===4)state.energy=100;
 if(classId===1)state.rage=0;
 return state;
}

function Harness(){
 const [classId,setClassId]=useState(8),[raceId,setRaceId]=useState(1),[state,setState]=useState<any>(()=>fixture()),[open,setOpen]=useState(false),[showParty,setShowParty]=useState(false),[error,setError]=useState('');
 const replace=(next:any)=>{setState(next);setError('');};
 const selectClass=(nextClass:number)=>{const race=racesForClass(nextClass)[0].id;setClassId(nextClass);setRaceId(race);replace(fixture(nextClass,race));};
 const selectRace=(nextRace:number)=>{setRaceId(nextRace);replace(fixture(classId,nextRace));};
 const send=async(action:any)=>{try{replace(act(state,action,state.wallAt));return true;}catch(reason){setError((reason as Error).message);return false;}};
 const data=view(state),props={state,data,busy:false,send};
 return <main className="game-shell" style={{paddingTop:24,paddingBottom:32}}><section className="panel"><div className="eyebrow">真实引擎 / 独立夹具</div><h1>九职业界面验证</h1><p>固定等级 60、10000 金，不连接 API 或用户存档。所有操作直接调用游戏引擎。</p><div className="action-row"><label>职业 <GameSelect aria-label="测试职业" value={classId} onValueChange={nextValue=>selectClass(Number(nextValue))}>{classOptions.map(option=><GameSelectOption key={option.id} value={option.id}>{option.name}</GameSelectOption>)}</GameSelect></label><label>种族 <GameSelect aria-label="测试种族" value={raceId} onValueChange={nextValue=>selectRace(Number(nextValue))}>{racesForClass(classId).map(option=><GameSelectOption key={option.id} value={option.id}>{option.name}</GameSelectOption>)}</GameSelect></label><button onClick={()=>{let next=structuredClone(state),changed=true;while(changed){changed=false;for(const a of view(next).skills.filter((a:any)=>a.canTrain)){try{const learned=act(next,{type:'train',id:a.spellId},next.wallAt);next=learned;changed=true;}catch{}}}next.hp=(stats(next) as any).maxHp;next.mana=(stats(next) as any).maxMana;replace(next);}}>学习所有可训练技能</button><button onClick={()=>{const next=structuredClone(state),ids=new Set<number>();for(const id of next.learned){const sp=spells[id];for(let n=1;n<=8;n++)if(sp?.['Reagent'+n]>0)ids.add(sp['Reagent'+n]);}for(const id of ids)addItem(next,id,5);replace(next);}}>补充测试材料</button><button onClick={()=>{const next=structuredClone(state);startCombat(next,[299]);replace(next);setOpen(true);}}>开始测试战斗</button><button onClick={()=>replace(advance(state,state.wallAt+30000,{}).state)}>推进 30 秒</button><button onClick={()=>setOpen(true)} disabled={!state.combat&&!state.lastCombat}>查看战斗</button><button onClick={()=>setShowParty(value=>!value)}>{showParty?'隐藏队伍':'查看队伍'}</button><button onClick={()=>replace(fixture(classId,raceId))}>重置当前职业</button></div></section><Character {...props}/>{showParty&&<Party {...props}/>}<Battle {...props} open={open} onOpenChange={setOpen}/>{error&&<p role="alert" className="error">{error}</p>}</main>;
}

const root=import.meta.hot?.data.root||createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Harness/>);
