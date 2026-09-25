const key='wow-sim:low-effects',battleZoomKey='wow-sim:battle-default-zoom',eventName='wow-sim:graphics-preferences';
export const battleZoomMin=.5,battleZoomMax=3;
export function readBattleZoom(){
 try{const value=Number(localStorage.getItem(battleZoomKey));if(Number.isFinite(value)&&value>=battleZoomMin&&value<=battleZoomMax)return value;}catch{}
 return 1;
}
export function writeBattleZoom(value){
 const zoom=Math.min(battleZoomMax,Math.max(battleZoomMin,Math.round(Number(value)*10)/10));
 if(!Number.isFinite(zoom))return;
 try{localStorage.setItem(battleZoomKey,String(zoom));}catch{}
 window.dispatchEvent(new Event(eventName));
}
export function readLowEffects(){
 try{const saved=localStorage.getItem(key);if(saved==='true'||saved==='false')return saved==='true';}catch{}
 return typeof window!=='undefined'&&window.matchMedia('(max-width: 700px)').matches;
}
export function writeLowEffects(value){
 try{localStorage.setItem(key,String(!!value));}catch{}
 window.dispatchEvent(new Event(eventName));
}
export function subscribeGraphicsPreferences(notify){
 const mobile=window.matchMedia('(max-width: 700px)');
 window.addEventListener(eventName,notify);window.addEventListener('storage',notify);mobile.addEventListener('change',notify);
 return()=>{window.removeEventListener(eventName,notify);window.removeEventListener('storage',notify);mobile.removeEventListener('change',notify);};
}
