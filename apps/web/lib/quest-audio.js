import {readAudioPreference} from './audio-preferences.js';
const questCues={accept:'quest-accept',turnin:'quest-complete'};

export function questSoundForCommand(command){
 return questCues[command?.type]||null;
}

export function playQuestSound(command,{createAudio=src=>new Audio(src),enabled=readAudioPreference('effectsEnabled'),volume=readAudioPreference('effectsVolume')}={}){
 const cue=questSoundForCommand(command);
 if(!cue||!enabled)return false;
 const audio=createAudio(`/sounds/${cue}.ogg`);
 audio.volume=.5*Math.max(0,Math.min(1,volume));
 try{Promise.resolve(audio.play()).catch(()=>{});}catch{}
 return true;
}
