import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import LevelUpNotification from '../../app/level-up-notification';
import {writeAudioPreference} from '../../lib/audio-preferences.js';

function Preview(){
 const [state,setState]=useState({id:'preview',level:9});
 return <main style={{minHeight:'100vh',background:'radial-gradient(ellipse at center,#354335,#101914 70%)',color:'#ffe4aa',fontFamily:'serif',padding:24,boxSizing:'border-box'}}>
  <h1>升级反馈预览</h1><p>当前等级：{state.level}（初次打开不播放）</p>
  <button onClick={()=>{writeAudioPreference('effectsEnabled',true);setState(s=>({...s,level:s.level+1}));}}>升级并播放原版音效</button>{' '}
  <button onClick={()=>{writeAudioPreference('effectsEnabled',false);setState(s=>({...s,level:s.level+1}));}}>静音升级</button>{' '}
  <button onClick={()=>setState(s=>({...s}))}>重复快照</button>{' '}
  <button onClick={()=>setState(s=>({id:s.id==='preview'?'other':'preview',level:9}))}>切换角色</button>
  <LevelUpNotification key={state.id} state={state}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview/></React.StrictMode>);
