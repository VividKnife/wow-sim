import {readAudioPreference} from './audio-preferences.js';

/** Observe level increases, without replaying the level loaded on login. */
export function createLevelUpObserver(initial){
 let characterId=initial.id,level=initial.level;
 return snapshot=>{
  if(snapshot.id!==characterId){characterId=snapshot.id;level=snapshot.level;return null;}
  if(!Number.isInteger(snapshot.level)||snapshot.level<=level)return null;
  const reward={from:level,level:snapshot.level};
  level=snapshot.level;
  return reward;
 };
}

export function playLevelUpSound({createAudio=src=>new Audio(src),enabled=readAudioPreference('effectsEnabled'),volume=readAudioPreference('effectsVolume')}={}){
 if(!enabled)return null;
 try{
  const audio=createAudio('/sounds/level-up.ogg');
  audio.volume=Math.max(0,Math.min(1,Number(volume)||0));
  Promise.resolve(audio.play()).catch(()=>{});
  return audio;
 }catch{return null;}
}
