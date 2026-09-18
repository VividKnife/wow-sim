import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import LootWindow from '../../app/loot-window';
import '../../app/globals.css';
import '../../app/character.css';
const items={2589:{name:'亚麻布',quality:1,icon:'/icons/assets/inv_fabric_linen_01.png'},25:{name:'破损的短剑',quality:0,icon:'/icons/assets/inv_sword_04.png'},2164:{name:'断肠',quality:4,icon:'/icons/assets/inv_weapon_shortblade_16.png'}};
type Entry={uid:string;id:number;count:number;lootBattleId:string;bound?:boolean};
function fixture(autoLoot=false){return {id:'hero',lastCombat:{id:'battle',lootGold:127},combat:null,hp:100,bag:[] as Entry[],pending:[{uid:'a',id:2589,count:3,lootBattleId:'battle'},{uid:'b',id:25,count:1,lootBattleId:'battle'},{uid:'c',id:2164,count:1,bound:true,lootBattleId:'battle'}],settings:{autoLoot}};}
function Harness(){
 const [state,setState]=useState(()=>fixture()),[generation,setGeneration]=useState(0),[full,setFull]=useState(false),[calls,setCalls]=useState(0);
 const send=async(a:{type:string;autoLoot?:boolean;uids?:string[]})=>{setCalls(n=>n+1);setState(s=>a.type==='settings'?{...s,settings:{...s.settings,autoLoot:!!a.autoLoot}}:full?s:{...s,pending:s.pending.filter(i=>!a.uids?.includes(i.uid)),bag:[...s.bag,...s.pending.filter(i=>a.uids?.includes(i.uid))]});return true;};
 return <main className="game-shell"><h1>战利品窗口验证</h1><p>背包物品：{state.bag.length} · 待拾取：{state.pending.length} · 请求次数：{calls}</p><button className="classic-button" onClick={()=>{setState(fixture());setGeneration(n=>n+1);setCalls(0);}}>重置手动拾取</button><button className="classic-button" onClick={()=>{setState(fixture(true));setGeneration(n=>n+1);setCalls(0);}}>测试自动拾取</button><label><input type="checkbox" checked={full} onChange={e=>setFull(e.target.checked)}/>模拟满包</label><LootWindow key={generation} state={state} data={{items,bagCapacity:16}} send={send} busy={false}/></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
