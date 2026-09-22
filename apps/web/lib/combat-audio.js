// Presentation only: these cues never advance or mutate the simulation.
const schools={1:'holy',2:'fire',3:'nature',4:'frost',5:'shadow',6:'arcane'};
export function combatSoundForEvent(event,skill={}){
 const name=skill.nameEn,school=event.school??skill.school;
 if(event.periodic&&name!=='Arcane Missiles')return null;
 if(event.kind==='cast'){
  if(name==='Renew')return 'renew';
  if(name==='Arcane Explosion')return null; // Its sourced burst is heard on impact.
  if(['Heroic Strike','Sinister Strike'].includes(name))return 'melee-swing';
  return schools[school]?`${schools[school]}-cast`:null;
 }
 if(event.kind==='heal'){
  if(['Renew','Rejuvenation','Regrowth','Drain Life','Health Funnel'].includes(name))return null;
  return name==='Flash Heal'?'flash-heal-impact':name==='Lesser Heal'||name==='Heal'?'heal-impact':null;
 }
 if(!['damage','incoming','miss'].includes(event.kind))return null;
 if(name==='Heroic Strike')return event.kind==='miss'?'melee-swing':'heroic-impact';
 if(name==='Sinister Strike')return event.kind==='miss'?'melee-swing':'sinister-impact';
 if(!event.spellId||event.spellId===6603)return 'melee-swing';
 if(event.kind==='miss')return null;
 if(name==='Arcane Explosion')return 'arcane-explosion';
 return schools[school]?`${schools[school]}-impact`:null;
}

export function createCombatAudio({createAudio=src=>new Audio(src),now=()=>Date.now(),maxVoices=4,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
 let enabled=false,active=false,volume=1;
 const voices=new Set(),lastPlayed=new Map(),deadlines=new Map();
 const clearDeadline=audio=>{if(deadlines.has(audio)){cancel(deadlines.get(audio));deadlines.delete(audio);}};
 const release=audio=>{clearDeadline(audio);audio.onended=null;audio.onerror=null;audio.onplaying=null;voices.delete(audio);};
 const stop=()=>{for(const audio of [...voices]){audio.pause();release(audio);}lastPlayed.clear();};
 return {
  get activeCount(){return voices.size;},
  setEnabled(value){enabled=value;if(!value)stop();},
  setActive(value){active=value;if(!value)stop();},
  setVolume(value){volume=Math.max(0,Math.min(1,Number.isFinite(value)?value:0));for(const audio of voices)audio.volume=(audio.src.includes('melee-swing')?.12:.22)*volume;},
  play(cue){
   if(!cue||!enabled||!active)return false;
   const time=now();if(time-(lastPlayed.get(cue)??-Infinity)<180)return false;
   // Drop excess cues instead of queuing an audible replay after a busy pull.
   if(voices.size>=maxVoices)return false;
   const audio=createAudio(`/sounds/${cue}.ogg`);audio.volume=(cue==='melee-swing'?.12:.22)*volume;
   voices.add(audio);lastPlayed.set(cue,time);
   audio.onended=()=>release(audio);audio.onerror=()=>release(audio);
   audio.onplaying=()=>clearDeadline(audio);
   // A cold or stalled download must not turn into a delayed combat replay.
   deadlines.set(audio,schedule(()=>{audio.pause();release(audio);},600));
   try{Promise.resolve(audio.play()).catch(()=>release(audio));}catch{release(audio);}
   return true;
  },
  dispose(){enabled=false;active=false;stop();},
 };
}
