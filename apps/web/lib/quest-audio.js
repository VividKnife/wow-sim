const questCues={accept:'quest-accept',turnin:'quest-complete'};

export function questSoundForCommand(command){
 return questCues[command?.type]||null;
}

export function playQuestSound(command,{createAudio=src=>new Audio(src)}={}){
 const cue=questSoundForCommand(command);
 if(!cue)return false;
 const audio=createAudio(`/sounds/${cue}.ogg`);
 audio.volume=.35;
 try{Promise.resolve(audio.play()).catch(()=>{});}catch{}
 return true;
}
