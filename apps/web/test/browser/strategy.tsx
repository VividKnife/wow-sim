// Isolated editor fixture: saves stay in memory and never touch player data.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Strategy from '../../app/strategy';
import {MAX_STRATEGY_RULES} from '../../../../packages/sim-core/src/strategy-config.js';
import {strategyAction,strategyProfiles} from '../../../../packages/game-domain/src/rules/strategy-profiles.js';
import '../../app/globals.css';

const count=Math.max(0,Math.min(MAX_STRATEGY_RULES,Number(new URLSearchParams(location.search).get('count')??13)));
const skills=[{spellId:133,name:'火球术',nameEn:'Fireball',icon:'/icons/class-assets/spell_fire_flamebolt.jpg',rank:'等级 1',known:true},{spellId:116,name:'寒冰箭',nameEn:'Frostbolt',icon:'/icons/class-assets/spell_frost_frostbolt02.jpg',rank:'等级 1',known:true}];
const initial={id:'strategy-preview',name:'策略测试法师',classId:8,role:'ranged',skills,presets:[],rules:Array.from({length:count},(_,i)=>({spell:i%2?116:133,condition:'healthBelow',value:i,enabled:true,and:[{condition:'manaAbove',value:30}]})),policy:{role:'ranged',protectCC:true,waitForTank:true,pullDelaySeconds:3},autoBuffs:{enabled:true,armor:true,int:true,sta:true,targets:'party',refreshSeconds:30}};
function Preview(){
 const [member,setMember]=useState<any>({...initial,learned:skills.map(s=>s.spellId),strategyProfiles:[],strategyPolicy:initial.policy}),[saved,setSaved]=useState<any>(null),[error,setError]=useState(''),[editorKey,setEditorKey]=useState(0);
 const projected={...member,policy:member.strategyPolicy,strategyProfiles:strategyProfiles(member)};
 return <main className="game-shell" style={{paddingTop:24}}><button onClick={()=>setEditorKey(editorKey+1)}>重新打开编辑器</button>{error&&<p role="alert">{error}</p>}<Strategy key={editorKey} state={{...member,settings:{health:50,mana:50}}} data={{strategyMembers:[projected],potionOptions:[]}} busy={false} send={async command=>{try{const next=structuredClone(member);if(command.type==='strategy')strategyAction(next,command);setMember(next);setSaved(command);setError('');return true;}catch(e){setError(String(e));return false;}}}/><details><summary>最后保存的配置（仅内存）</summary><pre aria-label="最后保存的策略">{JSON.stringify(saved,null,2)}</pre></details></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
