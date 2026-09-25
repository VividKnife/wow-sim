const key='wow-sim:low-effects',eventName='wow-sim:graphics-preferences';
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
