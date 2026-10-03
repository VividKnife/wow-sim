/* global Audio */
import {readAudioPreference} from './audio-preferences.js';

const files={open:'ui-menu-open',close:'ui-menu-close',switch:'ui-tab',next:'ui-page-forward',previous:'ui-page-back'};

export function playUiSound(cue,{createAudio=src=>new Audio(src),enabled=readAudioPreference('effectsEnabled'),volume=readAudioPreference('effectsVolume')}={}){
 if(!files[cue]||!enabled||volume<=0)return false;
 try{
  const audio=createAudio(`/sounds/${files[cue]}.ogg`);
  audio.volume=.45*Math.max(0,Math.min(1,volume));
  Promise.resolve(audio.play()).catch(()=>{});
  return true;
 }catch{return false;}
}

export function uiSoundForButton(button){
 if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return null;
 const pagination=button.closest('[class*="pagination"],[aria-label="掉落分页"]');
 if(pagination){
  const label=`${button.getAttribute('aria-label')||''} ${button.textContent||''}`;
  if(/上一页|‹|←/.test(label))return 'previous';
  if(/下一页|›|→/.test(label))return 'next';
  return null;
 }
 if(button.closest('.main-nav,.cu-menu,.cu-dialog-header'))return null;
 if(button.matches('[role="tab"]'))return button.getAttribute('data-state')==='active'?null:'switch';
 if(button.closest('.character-sections,.spellbook-tabs,.journal-view-tabs,.journal-category-tabs,.journal-bosses,.profession-list')||
    button.hasAttribute('aria-pressed')&&button.closest('nav,.filterbar,[role="group"]')){
  return button.getAttribute('aria-pressed')==='true'?null:'switch';
 }
 return null;
}
