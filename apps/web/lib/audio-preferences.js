const keys={musicEnabled:'wow-sim:music-enabled',musicVolume:'wow-sim:music-volume',effectsEnabled:'wow-sim:effects-enabled',effectsVolume:'battle-volume'};
export const audioDefaults={musicEnabled:true,musicVolume:.25,effectsEnabled:false,effectsVolume:.7};
const eventName='wow-sim:audio-preferences';
export function readAudioPreference(name){
 try{const value=localStorage.getItem(keys[name]);if(value!==null&&value.trim()!==''){if(typeof audioDefaults[name]==='boolean')return value==='true';const number=Number(value);if(Number.isFinite(number))return Math.max(0,Math.min(1,number));}}catch{}
 return audioDefaults[name];
}
export function writeAudioPreference(name,value){
 const normalized=typeof audioDefaults[name]==='boolean'?!!value:Math.max(0,Math.min(1,Number(value)||0));
 try{localStorage.setItem(keys[name],String(normalized));}catch{}
 window.dispatchEvent(new Event(eventName));
}
export function subscribeAudioPreferences(notify){
 window.addEventListener(eventName,notify);window.addEventListener('storage',notify);
 return()=>{window.removeEventListener(eventName,notify);window.removeEventListener('storage',notify);};
}
