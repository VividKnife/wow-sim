import {useEffect,useRef} from 'react';
import {playUiSound,uiSoundForButton} from '@/lib/ui-audio.js';

type Props={interfaceStyle:string;activeTab:string;classicPanel:string|null};

export default function GameUiSounds({interfaceStyle,activeTab,classicPanel}:Props){
 const previous=useRef({interfaceStyle,activeTab,classicPanel});
 useEffect(()=>{
  const old=previous.current;
  previous.current={interfaceStyle,activeTab,classicPanel};
  if(old.interfaceStyle!==interfaceStyle){playUiSound('switch');return;}
  if(interfaceStyle==='classic'&&old.classicPanel!==classicPanel){
   playUiSound(classicPanel?old.classicPanel?'switch':'open':'close');
  }else if(interfaceStyle==='web'&&old.activeTab!==activeTab)playUiSound('switch');
 },[interfaceStyle,activeTab,classicPanel]);
 useEffect(()=>{
  const onClick=(event:MouseEvent)=>{
   const target=event.target;
   if(!(target instanceof Element))return;
   const button=target.closest('button,[role="tab"]');
   if(button){const cue=uiSoundForButton(button);if(cue)playUiSound(cue);}
  };
  document.addEventListener('click',onClick,true);
  return()=>document.removeEventListener('click',onClick,true);
 },[]);
 return null;
}
