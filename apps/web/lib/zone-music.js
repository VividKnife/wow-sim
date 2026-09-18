// Presentation only. Use the actual location, never the map's preview selection.
const regions={'北郡':'forest','艾尔文':'forest','暴风城':'stormwind','西部荒野':'westfall'};
const locations={lakeshire:'forest',thelsamar:'forest',algaz:'forest',silverstream:'forest',ironforge:'ironforge',darnassus:'darnassus',orgrimmar:'orgrimmar',undercity:'undercity',thunderbluff:'thunderbluff',moonglade:'moonglade'};
export function zoneMusicForLocation(location,dungeon=false){
 if(!location)return null;
 const key=dungeon?'deadmines':locations[location.id]||regions[location.region];
 return key?`/music/${key}.mp3`:null;
}

export function createZoneMusic({createAudio=src=>new Audio(src),onStatus=(status)=>{void status;}}={}){
 let audio=null,source=null,enabled=true,active=true,disposed=false,pending=false,playing=false,generation=0,volume=.25;
 const status=value=>{if(!disposed)onStatus(value);};
 const stop=()=>{generation++;pending=false;playing=false;if(audio){audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();audio=null;}};
 const play=()=>{
  if(disposed||!enabled||!active||!source||pending||playing)return;
  if(!audio){audio=createAudio(source);audio.loop=true;audio.volume=volume;audio.preload='none';}
  const current=audio,token=++generation;
  pending=true;
  current.onerror=()=>{if(token===generation){pending=false;playing=false;status('error');}};
  const failed=error=>{if(token!==generation)return;pending=false;playing=false;status(error?.name==='NotAllowedError'?'blocked':'error');};
  try{Promise.resolve(current.play()).then(()=>{if(token!==generation)return;pending=false;playing=true;status('playing');},failed);}catch(error){failed(error);}
 };
 return {
  setVolume(value){if(disposed||!Number.isFinite(value))return;volume=Math.max(0,Math.min(1,value));if(audio)audio.volume=volume;},
  setSource(value){if(disposed||source===value)return;stop();source=value;status(value?'ready':'idle');play();},
  setEnabled(value){enabled=value;if(!value){stop();status('off');}else play();},
  setActive(value){active=value;if(!value){stop();status('paused');}else play();},
  retry:play,
  dispose(){disposed=true;stop();source=null;},
 };
}
