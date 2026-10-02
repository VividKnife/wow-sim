import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import HunterPets from '../../app/hunter-pets';
import fixture from './hunter-pets.fixture.json';
import '../../app/globals.css';
// Presentation fixture from projectClientSnapshot; authoritative commands are
// covered in packages/game-domain/test/pet-action-bar.test.mjs.
function Harness(){
 const [state,setState]=useState<any>(structuredClone(fixture.state)),[data,setData]=useState<any>(structuredClone(fixture.data)),[lastAction,setLastAction]=useState(''),[stable,setStable]=useState(false);
 const reset=()=>{setState(structuredClone(fixture.state));setData(structuredClone(fixture.data));};
 const send=async(action:any)=>{setLastAction(JSON.stringify(action));if(action.command==='autocast')setData({...data,petControls:{...data.petControls,skills:data.petControls.skills.map((skill:any)=>skill.id===action.spellId?{...skill,autocast:action.enabled}:skill)}});return true;};
 return <main style={{maxWidth:1000,margin:'24px auto',padding:'0 12px'}}><div style={{display:'flex',flexWrap:'wrap',gap:16,marginBottom:16}}><button onClick={()=>setStable(!stable)}>切换兽栏服务</button><button onClick={reset}>重置预览</button><button onClick={()=>setState({...state,pet:null})}>解散预览</button><button onClick={()=>setState({...state,pet:{...fixture.state.pet,hp:0}})}>死亡预览</button><button onClick={()=>{setState({...state,pet:null});setData({...data,petStable:{...data.petStable,current:null}});}}>无宠物预览</button></div><HunterPets state={state} data={data} busy={false} send={send} stableService={stable}/><output aria-label="最后发出的命令" style={{overflowWrap:'anywhere'}}>{lastAction}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
